import { NextResponse, type NextRequest } from "next/server";

import { checkDailyBudget, checkRateLimit } from "@/lib/api-guard";
import {
  MAX_LECTURE_FILE_BYTES,
  TranscriptionError,
  transcribeLecture,
} from "@/lib/ai/transcription";

/* ==========================================================================
   🎙️ /api/lecture-transcription — تحويل تسجيل محاضرة إلى نص
   ═══════════════════════════════════════════════════════════════════════

   الراوت ده رقيق عمداً: مصادقة + حدود + ترجمة أخطاء. كل كلام الـ API
   نفسه في `lib/ai/transcription.ts` — فأي حاجة هتتغيّر في طريقة النداء
   أو تطبيع الرد بتعدّي من غير ما تفتح الملف ده.

   ═══ المدخلات ═══
   POST multipart/form-data — الحقل `file` (تسجيل صوت/فيديو).

   ═══ المخرجات ═══
   200 → { transcript: LectureTranscript } — نفس العقد المتعلَم في
        `lib/ai/transcription-shared.ts`، جاهز يتبعت للمساعد الذكي بعدين.
   4xx/5xx → { error: { code, message } } — رسالة عربية آمنة + كود
        للتعامل من الواجهة. **مفيش** اسم المزوّد ولا الـ stack ولا المفتاح
        في أي رد.

   ⚠️ حدّ الاستخدام عام على مستوى الموقع (مش للمستخدم) عن قصد: الصفحة
   متاحة للزائر من غير تسجيل دخول (زي /api/demo بالظبط)، فأنا بدل حدّ
   لكل مستخدم بيتحقق إن الخدمة مش مفتوحة لحد واحد بياكل الفاتورة.
   حدّ الـ IP جواه بيكمّل تغطية الإساءة من حدّ IP واحد.
   ═══════════════════════════════════════════════════════════════════════ */

/** سماحية لترويسات الـ multipart فوق حجم الملف نفسه. */
const BODY_OVERHEAD_BYTES = 64 * 1024;

/** ٥ تحويلات في الساعة لكل IP. محاضرة بتاخد وقت وفلوس، فالتكرار لازم
 *  يكون مقصود. */
const IP_LIMIT = 5;
const IP_WINDOW_MS = 60 * 60 * 1000;

/** سقف يومي عام لكل instance — سقف حقيقي على الفاتورة، مش راحة للمستخدم. */
const DAILY_BUDGET = 60;

/** أقصى مدة تنفيذ على المنصّة (ثواني). محاضرة ساعة بتحتاج وقت. */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    /* ترتيب الطبقتين مقصود: السقف اليومي **قبل** حدّ الـ IP. السبب إن
       checkRateLimit بيكتب في ماب في الذاكرة قبل ما يرجّع، فلو اتنادى
       الأول كان كل طلب جديد بيكبر الماب حتى بعد ما الميزانية تخلص. */
    const overBudget = checkDailyBudget("lecture-transcription", DAILY_BUDGET);
    if (overBudget) return overBudget;

    /* حدّ الـ IP. x-forwarded-for بيتزوّر، فهو وحده مش كفاية — السقف
       اليومي فوق هو اللي بيغطي الحالة دي. */
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    const limited = checkRateLimit(`lecture-transcription:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (limited) return limited;

    /* رفض مبكر بالحجم قبل قراءة الـ body.
       formData() بيحمّل الأجزاء كلها في الذاكرة، فالفحص بعديها معناه
       إننا خزّنا الملف بالكامل الأول. */
    const declaredSize = Number(request.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_LECTURE_FILE_BYTES + BODY_OVERHEAD_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: `حجم الملف كبير أوي. أقصى حجم مسموح ${Math.round(
              MAX_LECTURE_FILE_BYTES / (1024 * 1024),
            )} ميجابايت.`,
          },
        },
        { status: 413 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "مفيش ملف اتبعت. اختر تسجيل المحاضرة الأول." } },
        { status: 400 },
      );
    }

    const transcript = await transcribeLecture(file);

    return NextResponse.json({ transcript });
  } catch (error) {
    /* كل أخطاء الخدمة متغلّفة في TranscriptionError برسالة عربية جاهزة
       للعرض ورمز HTTP دقيق. أي حاجة تانية (bug) بتترجم لرسالة عامة. */
    if (error instanceof TranscriptionError) {
      if (error.detail) {
        console.error(
          `lecture-transcription: ${error.code} — ${error.detail}`,
        );
      }
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    console.error("lecture-transcription: خطأ غير متوقع", error);
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
