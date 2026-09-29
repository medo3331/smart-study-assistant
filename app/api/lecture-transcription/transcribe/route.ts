import { NextResponse, type NextRequest } from "next/server";

import { checkDailyBudget, checkRateLimit, clampText } from "@/lib/api-guard";
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
     4. `deleteObject` — **بعد النجاح بس**. لو فشل التحويل، الملف بيفضل
        موجود والطالب يقدر يعيد المحاولة من غير ما يرفع تاني.

   ⚠️Cleanup بالترتيب ده مقصود: الخطأ الشائع إننا نحذف الملف قبل
   200 ميجا من جديد (المسار القديم مكنش عنده المشكلة دي لأن الملف كان
   لسه في متصفح الطالب).
   لسه في المتصفح.

   ═══ inputs ═══
   POST JSON { path, filename, size }

   ═══ output ═══
   200 → { transcript: LectureTranscript } — **نفس** شكل المرحلة 1 حرفياً.
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
    await verifyUploadedObject(path, Number(body.size) || 0);

    // ٢) رابط موقّع مؤقت — ElevenLabs هو بيسحب الملف، مش إحنا.
    const signedUrl = await createSignedReadUrl(path);

    // ٣) التفريغ. مفتاح ElevenLabs بيفضل جوه السيرفر — مش في أي رد.
    const transcript = await transcribeLectureFromUrl(signedUrl);

    // ٤) نضّف — بعد النجاح بس (شوف التعليق فوق).
    await deleteObject(path);

    return NextResponse.json({ transcript });
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
