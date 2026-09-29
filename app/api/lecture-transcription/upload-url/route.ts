import { NextResponse, type NextRequest } from "next/server";

import { checkDailyBudget, checkRateLimit, clampText } from "@/lib/api-guard";
import {
  TranscriptionError,
  type CreateUploadTicketRequest,
} from "@/lib/ai/transcription-shared";
import { createUploadTicket, isStorageConfigured } from "@/lib/ai/transcription-storage";

/* ==========================================================================
   🎙️ /api/lecture-transcription/upload-url — تذكرة الرفع (المرحلة 2)
   ═══════════════════════════════════════════════════════════════════════

   بيولّد presigned URL للمتصفح يرفع بيه الملف **مباشرة** لـ Supabase
   Storage. الراوت ده بيستقبل JSON صغير (اسم + نوع + حجم) — مش الملف.

   ⚠️ ليه الراوت ده مهم أمنياً: المتصفح ما بياخدش أي صلاحية عامة على
   باكيت، وبياخد تذكرة موقّعة على **مسار واحد محدّد**، وعمرها ساعتين.
   التذكرة مالهاش قيمة غير تصريح مؤقت للرفع على ملف واحد، ومحدش بيقرا
   حاجة من الباكيت ده غير الخادم.
   ⚠️ الجسم الصغير ده (مئات البايت) هو كل اللي بيعدّي في الفانكشن —
   الملف كله بيروح من المتصفح للتخزين مباشرة.

   ═══ inputs ═══
   POST JSON { filename, contentType, size }

   ═══ output ═══
   200 → { signedUrl, token, path, expiresIn }
   4xx/5xx → { error: { code, message } } — رسالة عربية آمنة.

   ⚠️ ليش مفيش مصادقة: نفس قرار `/api/demo` — الصفحة مفتوحة للزائر،
   والحماية هنا **اقتصادية** (سقف يومي + حد لكل IP) مش هوية. وكمان
   التذكرة مالهاش قيمة غير تصريح مؤقت للرفع على ملف واحد، ومحدش بيقرا
   حاجة من الباكيت ده غير الخادم.
   ═══════════════════════════════════════════════════════════════════════ */

/** ٤ محاضرات في الساعة لكل IP. */
const IP_LIMIT = 4;
const IP_WINDOW_MS = 60 * 60 * 1000;

/** سقف يومي عام على عدد **تذاكر الرفع** (مش على التحويل نفسه). */
const DAILY_BUDGET = 80;

export async function POST(request: NextRequest) {
  try {
    /* ترتيب الطبقتين مقصود: السقف اليومي **قبل** حد الـ IP، عشان
       حد الـ IP بيكتب في ماب في الذاكرة قبل ما يرجّع. */
    const overBudget = checkDailyBudget("lecture-transcription-upload", DAILY_BUDGET);
    if (overBudget) return overBudget;

    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    const limited = checkRateLimit(`lecture-upload:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (limited) return limited;

    if (!isStorageConfigured()) {
      throw new TranscriptionError(
        "STORAGE_NOT_CONFIGURED",
        "رفع المحاضرات الكبيرة غير متاح حالياً.",
        503,
      );
    }

    const body = (await request.json().catch(() => null)) as Partial<
      CreateUploadTicketRequest
    > | null;
    if (!body) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "طلب غير صالح. حاول تاني." } },
        { status: 400 },
      );
    }

    const ticket = await createUploadTicket({
      // clampText بيقصّ النص ويشيل أي حاجة مش string — حماية من payload
      // غريب اسمه ملايين الحروف.
      filename: clampText(body.filename, 200).trim(),
      contentType: clampText(body.contentType, 120).trim().toLowerCase(),
      size: typeof body.size === "number" ? body.size : Number.NaN,
    });

    return NextResponse.json(ticket);
  } catch (error) {
    if (error instanceof TranscriptionError) {
      if (error.detail) {
        console.error(`lecture-transcription/upload-url: ${error.code} — ${error.detail}`);
      }
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("lecture-transcription/upload-url: خطأ غير متوقع", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "مقدرناش نجهّز رفع المحاضرة. حاول تاني.",
        },
      },
      { status: 500 },
    );
  }
}
