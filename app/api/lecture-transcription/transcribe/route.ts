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
import {
  claimTicket,
  consumeTicket,
  releaseTicket,
  TicketError,
  type TicketClaimant,
} from "@/lib/ai/tickets";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/* ==========================================================================
   🎙️ /api/lecture-transcription/transcribe — تفريغ من ملف مرفوع (المرحلة 2)
   ═══════════════════════════════════════════════════════════════════════

   المتصفح خلّص الرفع → يبعته مسار الملف + تذكرته → إحنا نتفرّغ عليه.

   🎫 **بوابة الملكية (الخطوة ٠ — قبل أي قراءة أو فلوس):**
   المسار لوحده مش كفاية دلوقتي. اللازم:
     1. `claimTicket` — استحواذ ذري على التذكرة بشرط:
        - المالك نفسه (جلسة أو سر الزائر) — IDOR مقفول.
        - التذكرة لسه شغّالة (مش منتهية/مستهلكة).
        - المسار مربوط بالتذكرة دي بالظبط.
        - مفيش تفريغ جاري (وإلا 423).
     2. أي فشل قبل نجاح التفريغ → `releaseTicket` (بشرط claim_id
        بتاعنا) — طلب قديم مش بيفك استحواذ أحدث.
     3. نجاح التفريغ → `consumeTicket` **قبل** الحفظ — النص وصّل
        للطالب، فإعادة المحاولة على نفس التذكرة ممنوعة (404 + «ارفع
        من جديد») حتى لو الحفظ فشل: مفيش تفريغة مدفوعة تانية على
        نص هو شايفه قدامه.

   ⚠️ الردود الموحدة عن قصد: «التذكرة مش موجودة» و«مش بتاعتك»
   و«منتهية» و«مستهلكة» كلهم نفس الرد 404 بالظبط — مفيش كشف وجود
   تذكرة لمستخدم تاني (شوف سيناريو 12 في الاختبارات).

   ═══ الخطوات ═══
     0. `claimTicket` — بوابة الملكية (فوق).
     1. `verifyUploadedObject` — نقرأ الحجم **الحقيقي** من Supabase
        (مش اللي المتصفح أعلنه) ونتأكد إن الملف موجود.
     2. `createSignedReadUrl` — رابط قراءة موقّع مؤقت.
     3. ElevenLabs مع `cloud_storage_url` — هو بيسحب الملف من Supabase
        مباشرة. الملف **مش** بينزل في الذاكرة بتاعتنا خالص.
     4. `consumeTicket` — التذكرة اتعملت، النص وصل.
     5. `saveLectureForCurrentUser` — حفظ التفريغ في `public.lectures`
        لصاحب الجلسة. **بيفشل بهدوء** — والتفريغ برجع عادي.
     6. `deleteObject` — **بعد نجاح الحفظ بس**.

   ═══ inputs ═══
   POST JSON { path, filename, ticketId, secret? }

   ═══ output ═══
   200 → { transcript: LectureTranscript, saved: boolean, ... }
   404 → TICKET_INVALID — رد موحد (تذكرة غلط/مش بتاعتك/منتهية/مستهلكة)
   423 → TRANSCRIPTION_IN_PROGRESS — مالك صح بس فيه تفريغ جاري
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
 * (الـ lease بتاع التذكرة 12 دقيقة بيسمح لطلب جديد يستحوذ لو الفانكشن
 * ماتت في النص — شوف lib/ai/tickets.ts.)
 */
export const maxDuration = 300;

/** هوية صاحب الطلب من الجلسة — null لو زائر بلا جلسة. */
async function resolveSessionUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let claimId: string | null = null;
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
    // بدون تذكرة ملكية مفيش تفريغ خالص — العميل القديم لازم يتحدث.
    if (typeof body.ticketId !== "string" || body.ticketId.trim() === "") {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "طلب غير صالح. ارفع المحاضرة من جديد." } },
        { status: 400 },
      );
    }

    const path = clampText(body.path, 300).trim();

    /* ═══ ٠) بوابة الملكية — قبل أي قراءة للملف أو نداء مدفوع ═══
     * الطلب بيعلن هويته إما بجلسة (owner_user_id) أو بسر التذكرة
     * (زائر بلا جلسة). الخلط بينهم = invalid. */
    const sessionUserId = await resolveSessionUserId();
    const claimant: TicketClaimant =
      sessionUserId !== null
        ? { userId: sessionUserId, secret: null }
        : { userId: null, secret: clampText(body.secret ?? "", 200).trim() };

    let claim;
    try {
      claim = await claimTicket(createServiceClient(), {
        ticketId: clampText(body.ticketId, 100).trim(),
        storagePath: path,
        claimant,
      });
      claimId = claim.claimId;
    } catch (error) {
      if (error instanceof TicketError) {
        if (error.kind === "concurrent") {
          return NextResponse.json(
            { error: { code: "TRANSCRIPTION_IN_PROGRESS", message: error.message } },
            { status: 423 },
          );
        }
        // ⚠️ الرد الموحّد — مفيش أي تفريق بين «مش موجودة» و«مش بتاعتك»
        // و«منتهية» و«مستهلكة». اللوج بالـ kind بس، مش بالتفاصيل.
        return NextResponse.json(
          { error: { code: "TICKET_INVALID", message: error.message } },
          { status: 404 },
        );
      }
      throw error;
    }

    // ١) الحقيقة من Supabase: الحجم الحقيقي + وجود الملف.
    const realSize = await verifyUploadedObject(path, Number(body.size) || 0);

    // ٢) رابط موقّع مؤقت — ElevenLabs هو بيسحب الملف، مش إحنا.
    const signedUrl = await createSignedReadUrl(path);

    // ٣) التفريغ. أي فشل هنا = فك الاستحواذ (بشرط claim_id بتاعنا).
    let transcript;
    try {
      transcript = await transcribeLectureFromUrl(signedUrl);
    } catch (error) {
      await releaseTicket(createServiceClient(), { claimId }).catch(() => {});
      throw error;
    }

    /* ٤) التذكرة اتعملت — **قبل** الحفظ وبنجاح التفريغ نفسه.
     * لو الحفظ فشل بعدها، مفيش إعادة تفريغ على نفس التذكرة: النص
     * وصل للطالب في الرد، و«حاول تاني» على نفس التذكرة هيبقى
     * تفريغة مدفوعة تانية على حاجة هو شايفها (سيناريو 14). */
    await consumeTicket(createServiceClient(), { claimId }).catch(() => {});
    claimId = null; // استهلاكت — مفيش فك بعد كده.

    /* ٥) حفظ المحاضرة للمستخدم.
     * الحفظ **بيفشل بهدوء** في الحالتين دول:
     *   - زائر مش مسجّل → الحفظ مستحيل بالتصميم، مش خطأ.
     *   - خطأ في قاعدة البيانات → نرجّع الرسالة مع النص.
     * التفريغ أصلاً نجح ومحدش هيرميه عشان الحفظ فشل.
     * ⚠️ الـ try/catch حوالين الحفظ مقصود: لو العميل نفسه فشل في
     * البناء فالاستثناء كان هيبلع التفريغ الناجح — وأغلى من الحفظ.
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

    /* ٦) التنظيف — **بعد نجاح الحفظ بس**.
     *   - حفظ نجح  → الملف بقى مش محتاج، نحذفه.
     *   - زائر      → المسؤولية على الـ lifecycle job (٢٤ ساعة).
     *   - فشل حفظ   → بنسيب الملف عمداً — بس التذكرة مستهلكة، فأي
     *                  «حاول تاني» على المسار ده بيرفض (404) وبيقول
     *                  للطالب يرفع من جديد. مفيش تفريغة تانية ببلاش.
     */
    if (saveResult.ok) {
      await deleteObject(path);
    }

    /* ٧) الرد. `saved` بيوصف **الحفظ** بس. الحالتين ٢٠٠ لأن التفريغ
     * نجح في الحالتين. */
    return NextResponse.json({
      transcript,
      saved: saveResult.ok,
      ...(saveResult.ok
        ? { lectureId: saveResult.lecture.id, lecture: saveResult.lecture }
        : { persistCode: saveResult.code, persistMessage: saveResult.message }),
    });
  } catch (error) {
    // فشل بعد الاستحواذ وقبل نجاح التفريغ → فك بهدوء (بشرط claim_id).
    if (claimId !== null) {
      await releaseTicket(createServiceClient(), { claimId }).catch(() => {});
    }
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
