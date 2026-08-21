import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { GROQ_MODELS } from "@/lib/ai-config";
import { planShape, MAX_EXAM_DAYS, type DayKind } from "@/lib/exam-intent";

/* ==========================================================================
   توليد خطة الطوارئ

   المستخدم قال «عندي امتحان بعد ٣ أيام» — الراوت ده بيحوّل ده لخطة
   بأيام مسمّاة.

   ⚠️ الفرق الجوهري عن /api/generate-plan: **شكل الأيام بيتحدد في الكود
   مش في الموديل.** بنحسب `planShape(n)` الأول (آخر يوم كويز، اللي قبله
   مراجعة) وبنبعت للموديل الأدوار جاهزة ونقوله «املا العناوين بس».

   ليه؟ لأن الموديل لو سيبناه يرتّب، بيحصل حاجتين:
     • بيحط المراجعة في النص أو ينساها خالص
     • بيغيّر عدد الأيام (طلبنا ٣ فيرجّع ٥)
   والاتنين بيكسروا الوعد اللي المستخدم شافه على الشاشة.
   ========================================================================== */

const MAX_SUBJECT_CHARS = 120;
const MAX_TOPICS_CHARS = 1500;

/** الشكل اللي بيرجع للكلاينت. */
interface DraftDay {
  dayNumber: number;
  kind: DayKind;
  title: string;
  description: string;
}

export async function POST(req: Request) {
  try {
    // ١) لازم مسجّل دخول — نفس منطق باقي الراوتات
    const { user, response: authError } = await requireUser("success");
    if (authError) return authError;

    // ٢) حدّ استخدام. أعلى شوية من generate-plan (٨) لأن ده أرخص
    //    (توكنز أقل بكتير) وبيتعمل في لحظة قلق فالمستخدم بيعيد المحاولة.
    const limited = checkRateLimit(`exam-plan:${user.id}`, 10, 60_000, "success");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "البيانات المبعوتة غير صالحة." },
        { status: 400 }
      );
    }

    const subject = clampText(body.subject, MAX_SUBJECT_CHARS).trim();
    // المستخدم ممكن يكتب عناوين الفصول بنفسه («الفصل ٣ و٤ و٥»)
    const topics = clampText(body.topics, MAX_TOPICS_CHARS).trim();
    const daysCount = Number(body.daysCount);

    if (!subject) {
      return NextResponse.json(
        { success: false, error: "لازم تكتب اسم المادة." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(daysCount) || daysCount < 1 || daysCount > MAX_EXAM_DAYS) {
      return NextResponse.json(
        {
          success: false,
          error: `عدد الأيام لازم يكون رقم صحيح بين ١ و ${MAX_EXAM_DAYS}.`,
        },
        { status: 400 }
      );
    }

    // ٣) الشكل بيتحدد هنا — الموديل بيملا بس
    const shape = planShape(daysCount);

    const rawKeys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY,
    ];
    const apiKeys = Array.from(
      new Set(rawKeys.map((k) => k?.trim()).filter((k): k is string => !!k && k.length > 0))
    );

    if (apiKeys.length === 0) {
      console.error("exam-plan: مفيش أي GROQ_API_KEY معرف");
      return NextResponse.json(
        { success: false, error: "الخدمة غير متاحة حالياً." },
        { status: 503 }
      );
    }

    // وصف الأدوار بالعربي عشان الموديل يفهم كل يوم عايز إيه
    const roleLines = shape
      .map((kind, i) => {
        const n = i + 1;
        if (kind === "quiz") {
          return `اليوم ${n}: اختبار شامل — عنوانه يوضّح إنه مراجعة نهائية واختبار على كل المنهج. مفيش محتوى جديد.`;
        }
        if (kind === "review") {
          return `اليوم ${n}: مراجعة — تثبيت اللي اتعلمه في الأيام اللي فاتت. مفيش محتوى جديد.`;
        }
        return `اليوم ${n}: محتوى جديد — جزء من المنهج.`;
      })
      .join("\n");

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `أنت معلم خبير بيساعد طالب عنده امتحان قريب. مهمتك تقسيم المنهج على الأيام المتاحة.

قواعد لازم تتبعها بالحرف:
- أخرج JSON فقط بدون Markdown وبدون أي كلام قبله أو بعده.
- عدد الأيام في الرد لازم يساوي العدد المطلوب بالظبط.
- الأدوار (محتوى / مراجعة / اختبار) محددة سلفاً ومينفعش تغيّرها.
- العنوان قصير جداً (٢ إلى ٥ كلمات) زي "الفصل الأول: المتغيرات".
- الوصف سطر واحد مكثف يقول المطلوب في اليوم ده بالظبط.
- اكتب بالعربي المصري البسيط، والمصطلحات التقنية سيبها بالإنجليزي.

الشكل:
{
  "isValid": true,
  "days": [
    { "day": 1, "title": "عنوان قصير", "description": "سطر واحد عن المطلوب." }
  ]
}

لو اسم المادة غير مفهوم أو مش مادة دراسية:
{ "isValid": false, "reason": "سبب قصير بالعربي." }`,
      },
      {
        role: "user",
        content: `المادة: "${subject}"
عدد الأيام المتاحة قبل الامتحان: ${daysCount}
${topics ? `المواضيع اللي لازم تتغطّى (من الطالب): ${topics}` : "الطالب ما حددش المواضيع — قسّم المنهج الأساسي للمادة دي بشكل منطقي."}

أدوار الأيام (التزم بها):
${roleLines}

رجّع ${daysCount} يوم بالظبط.`,
      },
    ];

    let rawContent = "";
    let lastError: unknown = null;

    for (const apiKey of apiKeys) {
      try {
        const groq = new Groq({ apiKey });
        const completion = await groq.chat.completions.create({
          model: GROQ_MODELS.fast,
          messages,
          temperature: 0.3,
          max_tokens: 1800,
          response_format: { type: "json_object" },
        });
        rawContent = completion.choices[0]?.message?.content || "";
        if (rawContent) break;
      } catch (err) {
        console.warn("exam-plan: فشل مفتاح، بنجرّب اللي بعده");
        lastError = err;
      }
    }

    if (!rawContent) {
      throw lastError || new Error("فشلت جميع المفاتيح المتاحة.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("exam-plan: رد غير صالح من الموديل");
      return NextResponse.json(
        { success: false, error: "الرد جه بشكل غير مفهوم. حاول تاني." },
        { status: 502 }
      );
    }

    const obj = (parsed ?? {}) as { isValid?: unknown; reason?: unknown; days?: unknown };

    if (obj.isValid === false) {
      return NextResponse.json({
        success: false,
        error: typeof obj.reason === "string" && obj.reason ? obj.reason : "اسم المادة غير واضح.",
      });
    }

    if (!Array.isArray(obj.days) || obj.days.length === 0) {
      console.error("exam-plan: رد بدون أيام");
      return NextResponse.json(
        { success: false, error: "مقدرتش أبني الخطة. حاول تاني بعد شوية." },
        { status: 502 }
      );
    }

    // ٤) التطبيع: الشكل اللي احنا حسبناه هو الحاكم، مش اللي الموديل رجّعه.
    //
    //    الموديل بيرجّع أحياناً أيام أقل أو أكتر من المطلوب. بنمشي على
    //    `shape` (طوله مضمون) وبناخد عنوان الموديل لو موجود وإلا بنولّد
    //    عنوان افتراضي — كده المستخدم بياخد خطة كاملة في كل الحالات.
    const modelDays = obj.days as Array<{ day?: unknown; title?: unknown; description?: unknown }>;

    const days: DraftDay[] = shape.map((kind, i) => {
      const n = i + 1;
      // بندوّر بالرقم الأول (الموديل بيرقّم صح غالباً)، وبنرجع للترتيب لو مالقيناش
      const match =
        modelDays.find((d) => Number(d?.day) === n) ?? modelDays[i] ?? {};

      const rawTitle = typeof match.title === "string" ? match.title.trim() : "";
      const rawDesc = typeof match.description === "string" ? match.description.trim() : "";

      return {
        dayNumber: n,
        kind,
        title: clampText(rawTitle || fallbackTitle(kind, n), 120),
        description: clampText(rawDesc || fallbackDescription(kind, subject), 300),
      };
    });

    return NextResponse.json({
      success: true,
      data: { subject, daysCount, days },
    });
  } catch (error: unknown) {
    console.error("exam-plan route error:", error);
    const e = (error ?? {}) as { message?: string; status?: number };
    const isRateLimit =
      e.message?.includes("TPM") || e.status === 413 || e.status === 429;
    return NextResponse.json(
      {
        success: false,
        error: isRateLimit
          ? "الخدمة مشغولة دلوقتي. حاول تاني بعد دقيقة."
          : "حصل خطأ أثناء بناء الخطة. حاول تاني.",
      },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}

/* عناوين بديلة لو الموديل سقّط يوم — الخطة لازم تفضل كاملة. */
function fallbackTitle(kind: DayKind, dayNumber: number): string {
  if (kind === "quiz") return "اختبار شامل";
  if (kind === "review") return "مراجعة اللي فات";
  return `الجزء ${dayNumber}`;
}

function fallbackDescription(kind: DayKind, subject: string): string {
  if (kind === "quiz") return `حل أسئلة على كل منهج ${subject} وراجع غلطاتك.`;
  if (kind === "review") return "رجّع على نقط الأيام اللي فاتت بسرعة وثبّت اللي نسيته.";
  return `اذاكر الجزء ده من ${subject} وحل عليه أمثلة.`;
}
