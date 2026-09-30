import { NextResponse, type NextRequest } from "next/server";

import { checkDailyBudget, checkRateLimit, clampText } from "@/lib/api-guard";
import { saveLectureForCurrentUser } from "@/lib/ai/lecture-store";
import { transcribeLectureFromUrl } from "@/lib/ai/transcription";
import {
  TranscriptionError,
  type StartTranscriptionRequest,
} from "@/lib/ai/transcription-shared";
import {
  createSignedReadUrl,
  deleteObject,
  isStorageConfigured,
  verifyUploadedObject,
} from "@/lib/ai/transcription-storage";

/* ==========================================================================
   🎙️ /api/lecture-transcription/transcribe — تفريغ من ملف مرفوع (المرحلة 2)
   ═══════════════════════════════════════════════════════════════════════

   المتصفح خلّص الرفع → يبعته مسار الملف → إحنا نتفرّغ عليه.

   ═══ الخطوات ═══
     1. `verifyUploadedObject` — نقرأ الحجم **الحقيقي** من Supabase
        (مش اللي المتصفح أعلنه) ونتأكد إن الملف موجود.
     2. `createSignedReadUrl` — رابط قراءة موقّع مؤقت.
     3. ElevenLabs مع `cloud_storage_url` — هو بيسحب الملف من Supabase
        مباشرة. الملف **مش** بينزل في الذاكرة بتاعتنا خالص.
     4. `saveLectureForCurrentUser` — حفظ التفريغ في `public.lectures`
        لصاحب الجلسة (المرحلة ٣). **بيفشل بهدوء** لو مفيش جلسة أو لو
        قاعدة البيانات واقفة — والتفريغ برجع عادي في الحالتين.
     5. `deleteObject` — **بعد نجاح الحفظ بس** (شوف التعليق جوه الكود).

   ⚠️ ليش الحفظ قبل الحذف: لو حذفنا الأول، أي فشل في الحفظ = الطالب
   يخسر تسجيله *و* مايحفظش تفريغه. الترتيب ده معناه إن الملف بيفضل
   موجود عند أي فشل في الحفظ، فيقدر يدوس «حاول تاني» على نفس المسار
   من غير ما يرفع ٣٧ ميجا تاني. والـ lifecycle job (٢٤ ساعة) بيبقى
   الشبكة الأمان لو الطالب راح ومش راجع.

   ⚠️Cleanup بالترتيب ده مقصود: الخطأ الشائع إننا نحذف الملف قبل
   200 ميجا من جديد (المسار القديم مكنش عنده المشكلة دي لأن الملف كان
   لسه في متصفح الطالب).
   لسه في المتصفح.

   ═══ inputs ═══
   POST JSON { path, filename, size }

   ═══ output ═══
   200 → { transcript: LectureTranscript, saved: boolean, ... }
         `saved: true`  → { lectureId, lecture } — الحفظ تم فعلاً.
         `saved: false` → { persistCode, persistMessage } — إمّا الزائر
                          مش مسجّل (AUTH_REQUIRED) أو الحفظ فشل
                          (DB_FAILED). **التفريغ نجح في الحالتين** —
                          `saved` بيصف الحفظ بس، مش نجاح التفريغ.
   ═══════════════════════════════════════════════════════════════════════ */

/** ٣ تحويلات في الساعة لكل IP — كل واحد بياكل فلوس فعلية. */
const IP_LIMIT = 3;
const IP_WINDOW_MS = 60 * 60 * 1000;

/** سقف يومي عام على عدد التحويلات. */
const DAILY_BUDGET = 40;

/**
 * أقصى مدة تنفيذ على المنصّة (ثواني).
 *
 * ⚠️ ده **حد الفانكشن** مش حد الخدمة. محاضرة 3 ساعات ممكن تفريغها
 * تستغرق أكتر من 5 دقايق، وعندها الطلب هيتقطع. الحل الصح للملفات
 * الطويلة جداً هو ElevenLabs async/webhook + جدول حالة — المرحلة ٣.
 * لحد ما ده يتحط، الطالب يضغط إعادة المحاولة والملف لسه موجود.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const overBudget = checkDailyBudget("lecture-transcription-job", DAILY_BUDGET);
    if (overBudget) return overBudget;

    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    const limited = checkRateLimit(`lecture-transcribe:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (limited) return limited;

    if (!isStorageConfigured()) {
      throw new TranscriptionError(
        "STORAGE_NOT_CONFIGURED",
        "تحويل المحاضرات غير متاح حالياً.",
        503,
      );
    }

    const body = (await request.json().catch(() => null)) as Partial<
      StartTranscriptionRequest & { size: number }
    > | null;
    if (!body?.path) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "مفيش ملف اتبعت. ارفع المحاضرة الأول." } },
        { status: 400 },
      );
    }

    // ١) الحقيقة من Supabase: الحجم الحقيقي + وجود الملف.
    const path = clampText(body.path, 300).trim();
    const realSize = await verifyUploadedObject(path, Number(body.size) || 0);

    // ٢) رابط موقّع مؤقت — ElevenLabs هو بيسحب الملف، مش إحنا.
    const signedUrl = await createSignedReadUrl(path);

    // ٣) التفريغ. مفتاح ElevenLabs بيفضل جوه السيرفر — مش في أي رد.
    const transcript = await transcribeLectureFromUrl(signedUrl);

    /* ٤) حفظ المحاضرة للمستخدم (المرحلة ٣).
     *
     * ⚠️ **الترتيب ده مقصود ومش قابل للتبادل**: بنحاول الحفظ **قبل**
     * حذف الملف. لو حفظنا وحذفنا الأول، أي فشل في قاعدة البيانات =
     * الطالب يخسر التسجيل *و* مايحفظش النص = يبقى ضايع خالص.
     * كلمة "محاضرة" بتتأكد إن الحفظ تم فعلاً.
     *
     * ملاحظة على التصميم: الحفظ **بيفشل بهدوء** (مش بيرمي exception)
     * في الحالتين دول:
     *   - زائر مش مسجّل → الحفظ مستحيل بالتصميم، مش خطأ.
     *   - خطأ في قاعدة البيانات → نرجّع الرسالة مع النص.
     * التفريغ أصلاً نجح ومحدش هيرميه عشان الحفظ فشل.
     *
     * ⚠️ الـ try/catch حوالين الحفظ مقصود: `saveLectureForCurrentUser`
     * بترجّع نتيجة بدل ما ترمي، بس لو العميل نفسه فشل في البناء
     * (بيئة ناقصة مثلاً) فالاستثناء كان هيوصل لكتلة الـ catch
     * الكبيرة ويضيّع **التفريغ الناجح**. التفريغ أغلى من الحفظ — مش
     * من حقّ خطأ في الحفظ يبلعه.
     */
    const saveResult = await saveLectureForCurrentUser({
      transcript,
      originalFilename: clampText(body.filename, 200).trim() || "محاضرة",
      storagePath: path,
      fileSize: realSize,
    }).catch((error: unknown) => {
      console.error("lecture-transcription: استثناء أثناء حفظ المحاضرة", error);
      return {
        ok: false as const,
        code: "DB_FAILED" as const,
        message: "حصلت مشكلة أثناء حفظ المحاضرة. جرّب تاني كمان شوية.",
      };
    });

    /* ٥) التنظيف — **بعد نجاح الحفظ بس**، وده تغيير مقصود عن السلوك
     * القديم اللي كان بيحذف قبل أي حفظ.
     *
     *   - حفظ نجح  → الملف بقى مش محتاج، نحذفه (نفس سلوك اليوم).
     *   - زائر      → مافيش محاضرة محفوظة، فالمسؤولية على الـ lifecycle
     *                  job اللي بيحذف الأقدم من ٢٤ ساعة (db/13-*.sql).
     *   - فشل حفظ   → **بنسيب الملف** عمداً. الطالب يقدر يدوس
     *                  «حاول تاني» على نفس المسار من غير ما يرفع
     *                  ٣٧ ميجا تاني. وده أأمن من إننا نضيّع تسجيله.
     */
    if (saveResult.ok) {
      await deleteObject(path);
    }

    /* ٦) الرد. `saved` بيوصف **الحفظ** بس — لا بيخلطه بنجاح
     * التفريغ. الحالتين ٢٠٠ لأن التفريغ نجح في الحالتين:
     *   الحفظ زائر  → { saved: false, persistCode: "AUTH_REQUIRED" }
     *   الحفظ فشل   → { saved: false, persistCode: "DB_FAILED" }
     * الواجهة بتعرض النص في الحالتين وتقول للطالب صراحةً إن المحاضرة
     * متحفظتش (شوف components/lecture-transcription/LectureTranscriber.tsx).
     */
    return NextResponse.json({
      transcript,
      saved: saveResult.ok,
      ...(saveResult.ok
        ? { lectureId: saveResult.lecture.id, lecture: saveResult.lecture }
        : { persistCode: saveResult.code, persistMessage: saveResult.message }),
    });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      if (error.detail) {
        console.error(`lecture-transcription/transcribe: ${error.code} — ${error.detail}`);
      }
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("lecture-transcription/transcribe: خطأ غير متوقع", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.",
        },
      },
      { status: 500 },
    );
  }
}
