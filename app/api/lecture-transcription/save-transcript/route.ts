/* ==========================================================================
   🎙️ /api/lecture-transcription/save-transcript — حفظ النص المدمج في Supabase
   ═════════════════════════════════════════════════════════════════════════

   بعد ما ينتهي المتصفح من تفريغ كل الأجزاء ودمج النصوص، يبعته هنا
   للحفظ في `public.lectures` لصاحب الجلسة.

   inputs (JSON):
     - transcript: LectureTranscript (النص المدمج + الميتاداتا).
     - originalFilename: اسم الملف الأصلي.
     - storagePath: مسار الملف في Supabase Storage (اختياري — لو تم الرفع المباشر).
     - fileSize: حجم الملف الأصلي بالبايت (اختياري).

   output:
     200 → { saved: true, lectureId, lecture }
     200 → { saved: false, persistCode, persistMessage } (زائر أو فشل حفظ)
     4xx/5xx → { error: { code, message } }

   ⚠️ سيرفر بس — مفيش استيراد من كومبوننت كلاينت.
   ═════════════════════════════════════════════════════════════════════════ */

import { NextResponse, type NextRequest } from "next/server";

import { clampText } from "@/lib/api-guard";
import { saveLectureForCurrentUser } from "@/lib/ai/lecture-store";
import { type LectureTranscript } from "@/lib/ai/transcription-shared";

/** الحد الأقصى لطول اسم الملف الأصلي. */
const MAX_FILENAME_CHARS = 200;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      transcript?: LectureTranscript;
      originalFilename?: string;
      storagePath?: string | null;
      fileSize?: number | null;
    } | null;

    if (!body?.transcript || typeof body.transcript.text !== "string") {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", message: "الطلب مش فيه نص تفريغ صالح." } },
        { status: 400 },
      );
    }

    const result = await saveLectureForCurrentUser({
      transcript: body.transcript,
      originalFilename: clampText(body.originalFilename ?? "محاضرة", MAX_FILENAME_CHARS),
      storagePath: body.storagePath ?? null,
      fileSize: body.fileSize ?? null,
    });

    if (result.ok) {
      return NextResponse.json({
        saved: true,
        lectureId: result.lecture.id,
        lecture: result.lecture,
      });
    }

    return NextResponse.json({
      saved: false,
      persistCode: result.code,
      persistMessage: result.message,
    });
  } catch (error) {
    console.error("lecture-transcription/save-transcript: خطأ غير متوقع", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "حصلت مشكلة أثناء حفظ المحاضرة. حاول مرة أخرى.",
        },
      },
      { status: 500 },
    );
  }
}