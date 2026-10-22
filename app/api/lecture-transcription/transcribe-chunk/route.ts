/* ==========================================================================
   🎙️ /api/lecture-transcription/transcribe-chunk — تفريغ جزء واحد من ملف كبير
   ═════════════════════════════════════════════════════════════════════════

   المتصفح يرفع جزء (chunk) من ملف كبير عبر FormData، وإحنا نفرّغه عبر
   ElevenLabs ونرجع النص الخاص بهذا الجزء فقط.

   inputs (multipart/form-data):
     - file: الجزء (Blob/File) — 최대 3 ميجا (تجنب حد Vercel 4.5 ميجا).
     - chunkIndex: رقم الجزء (صفر-indexed).
     - totalChunks: العدد الكلي للأجزاء.
     - fileName: اسم الملف الأصلي.

   output:
     200 → { text: string, chunkIndex: number, totalChunks: number }
     4xx/5xx → { error: { code, message } }

   ⚠️ سيرفر بس — مفيش استيراد من كومبوننت كلاينت.
   ═════════════════════════════════════════════════════════════════════════ */

import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/api-guard";
import { transcribeLectureFile } from "@/lib/ai/transcription";
import {
  assertLectureChunk,
  TranscriptionError,
} from "@/lib/ai/transcription-shared";

/** أقصى حجم للجزء الواحد في الطلب (حمایة إضافية للواجهة). */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * 🔒 حدRate-limit على عدد الأجزاء في **الطلب الواحد** — حماية من إساءة
 * الاستخدام (طلب 10.000 جزء صغير عشان يستهلك حصة الـ API).
 *
 * ⚠️ ملاحظة مهمة: الحد **مش** على عدد الطلبات في الساعة — ده على عدد
 * الأجزاء اللي المتصفح بيبعتها في نفس الملف. ليش؟ لأن ملف واحد كبير
 * (21 ميجا) بيتقسم إلى ~8 أجزاء، ولو كان الحد 3 كان الطلب الرابع هيرجع
 * 429 والواجهة هتفشل في نص الملف.
 */
const MAX_CHUNKS_PER_REQUEST = 50;

/**
 * 💰 سقف الإنفاق: عدد الأجزاء المسموح تفريغها **في الساعة** لكل IP.
 *
 * الأجزاء بتتكلّف فلوس على ElevenLabs — كل جزء = نداء مدفوع. فالسقف
 * بيحمي ميزانية التطبيق من حدّاد بيبعت قطع صغيرة كتير.
 *
 * الأرقام: 40 جزء × 3 ميجا ≈ 120 ميجا في الساعة. ده يكفي لملف محاضرة
 * كامل (ساعة) ويترك مساحةRetry لو المستخدم جرّب تاني.
 */
const IP_CHUNK_LIMIT = 40;
const IP_WINDOW_MS = 60 * 60 * 1000;

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    const limited = checkRateLimit(
      `lecture-transcribe-chunk:ip:${ip}`,
      IP_CHUNK_LIMIT,
      IP_WINDOW_MS,
    );
    if (limited) return limited;

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const chunkIndex = Number(form.get("chunkIndex"));
    const totalChunks = Number(form.get("totalChunks"));
    const fileName = String(form.get("fileName") ?? "محاضرة");

    if (!file) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "مفيش جزء ملف في الطلب." } },
        { status: 400 },
      );
    }

    if (
      Number.isNaN(chunkIndex) ||
      Number.isNaN(totalChunks) ||
      chunkIndex < 0 ||
      totalChunks <= 0 ||
      chunkIndex >= totalChunks
    ) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CHUNK",
            message: "بيانات الجزء غير صالحة.",
          },
        },
        { status: 400 },
      );
    }

    // 🔒 سقف عدد الأجزاء في الملف الواحد — يمنع طلب مبالغ فيه في الحجم.
    if (totalChunks > MAX_CHUNKS_PER_REQUEST) {
      return NextResponse.json(
        {
          error: {
            code: "TOO_MANY_CHUNKS",
            message: `الملف كبير أوي. أقصى عدد أجزاء ${MAX_CHUNKS_PER_REQUEST}.`,
          },
        },
        { status: 413 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: { code: "EMPTY_CHUNK", message: "الجزء فاضي." } },
        { status: 400 },
      );
    }

    if (file.size > MAX_CHUNK_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "CHUNK_TOO_LARGE",
            message: `الحجم المسموح للجزء الواحد ${Math.round(
              MAX_CHUNK_BYTES / (1024 * 1024),
            )} ميجابايت.`,
          },
        },
        { status: 413 },
      );
    }

    // 🔎 فحص امتداد **الملف الأصلي** — امتداد اسم الجزء (`.part1`) مش صالح.
    // checkRateLimit خلّص فوق — فلو رجع error هنا المستخدم يقدر يجرب تاني.
    assertLectureChunk(file, fileName, MAX_CHUNK_BYTES);

    // التفريغ عبر ElevenLabs (الجزء لوحده).
    const transcript = await transcribeLectureFile(file);

    return NextResponse.json({
      text: transcript.text,
      chunkIndex,
      totalChunks,
      fileName,
    });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      if (error.detail) {
        console.error(`lecture-transcription/transcribe-chunk: ${error.code} — ${error.detail}`);
      }
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("lecture-transcription/transcribe-chunk: خطأ غير متوقع", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "حصلت مشكلة أثناء تحويل الجزء. حاول مرة أخرى.",
        },
      },
      { status: 500 },
    );
  }
}