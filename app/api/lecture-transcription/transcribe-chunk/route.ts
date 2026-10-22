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
import { TranscriptionError } from "@/lib/ai/transcription-shared";

/** ٣ تحويلات في الساعة لكل IP. */
const IP_LIMIT = 3;
const IP_WINDOW_MS = 60 * 60 * 1000;

/** أقصى حجم للجزء الواحد في الطلب (حمایة إضافية للواجهة). */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    const limited = checkRateLimit(`lecture-transcribe-chunk:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
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