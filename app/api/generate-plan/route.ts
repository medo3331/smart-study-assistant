/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { GROQ_MODELS } from "@/lib/ai-config";

/** أقصى طول لأي حقل نصي جاي من الكلاينت. */
const MAX_FIELD_CHARS = 200;
/** حدود عدد الأيام المسموح بها. */
const MIN_DAYS = 1;
const MAX_DAYS = 60;

function errorDetails(error: unknown) {
  if (typeof error !== "object" || error === null) return { message: "", status: undefined };
  const candidate = error as { message?: unknown; status?: unknown };
  return {
    message: typeof candidate.message === "string" ? candidate.message : "",
    status: typeof candidate.status === "number" ? candidate.status : undefined,
  };
}

export async function POST(req: Request) {
  let guard: any = null;
  let __hUser: any = null;
  let __hSupabase: any = null;
  try {
    // ١) لازم مستخدم مسجّل — الراوت ده كان مفتوح وبيستهلك توكنز لأي حد
    const { user, supabase, response: authError } = await requireUser("success");
    __hUser = user; __hSupabase = supabase;
    if (authError) return authError;

    // ٢) حدّ استخدام: توليد الخطة أغلى طلب عندنا
    const limited = checkRateLimit(`plan:${user.id}`, 8, 60_000, "success");
    if (limited) return limited;
    // Phase H: 1 credit gate (free model, but still costs 1 credit)
    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "البيانات المبعوتة غير صالحة." },
        { status: 400 }
      );
    }

    const subject = clampText(body.subject, MAX_FIELD_CHARS).trim();
    const stage = clampText(body.stage, MAX_FIELD_CHARS).trim();
    const level = clampText(body.level, MAX_FIELD_CHARS).trim();
    const daysCount = Number(body.daysCount);

    if (!subject || !stage || !level) {
      return NextResponse.json(
        { success: false, error: "جميع الحقول مطلوبة لتوليد الخطة الدراسية." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(daysCount) || daysCount < MIN_DAYS || daysCount > MAX_DAYS) {
      return NextResponse.json(
        {
          success: false,
          error: `عدد الأيام لازم يكون رقم صحيح بين ${MIN_DAYS} و ${MAX_DAYS}.`,
        },
        { status: 400 }
      );
    }

    // تجميع وقراءة المفاتيح من متغيرات البيئة
    const rawKeys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY,
    ];

    // إزالة المسافات الزائدة والتأكد من صحة النص
    const validKeys = rawKeys
      .map((k) => k?.trim())
      .filter((k): k is string => typeof k === "string" && k.length > 0);

    const apiKeys = Array.from(new Set(validKeys));

    if (apiKeys.length === 0) {
      console.error("generate-plan: مفيش أي GROQ_API_KEY معرف");
      await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ""), (guard as any)?.refId ?? "");
      return NextResponse.json(
        { success: false, error: "الخدمة غير متاحة حالياً." },
        { status: 503 }
      );
    }

    // تعليمات خفيفة وموزونة جداً لمنع استهلاك التوكنز وتجاوز TPM
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `أنت معلم خبير. أنشئ هيكل خطة دراسية خفيف جداً بدون شروحات مطولة أو كويزات. أخرج JSON فقط بدون Markdown.
إذا كان اسم المادة غير صحيح أو غير مفهوم:
{"isValid": false, "reason": "اسم المادة غير واضح."}

إذا كان صحيحاً، أرجع الخطة بالهيكل التالي:
{
  "isValid": true,
  "days": [
    {
      "day": 1,
      "title": "عنوان الدرس الرئيسي",
      "description": "ملخص مكثف من سطر واحد فقط عن الدرس."
    }
  ]
}`,
      },
      {
        role: "user",
        content: `أنشئ خطة دراسية لمادة "${subject}"، المرحلة: "${stage}"، المستوى: "${level}"، المدة: ${daysCount} يوم.`,
      },
    ];

    let rawContent = "";
    let lastError: unknown = null;

    // التنقل بين المفاتيح وتجاهل أي مفتاح به خطأ أو منتهي
    for (const apiKey of apiKeys) {
      try {
        const groq = new Groq({ apiKey });
        const completion = await groq.chat.completions.create({
          model: GROQ_MODELS.fast,
          messages,
          temperature: 0.3,
          max_tokens: 1500,
          response_format: { type: "json_object" },
        });

        rawContent = completion.choices[0]?.message?.content || "";
        if (rawContent) break; // عند نجاح أي مفتاح نخرج فوراً
      } catch (err) {
        console.warn(`فشل المفتاح الحالي (${errorDetails(err).message})، جاري تجربة المفتاح التالي...`);
        lastError = err;
      }
    }

    if (!rawContent) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      throw lastError || new Error("فشلت جميع المفاتيح المتاحة في الاتصال بالخدمة.");
    }

    // ٣) الموديل ممكن يرجّع JSON مكسور — ده خطأ متوقّع مش كراش
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(rawContent);
    } catch {
      console.error("generate-plan: رد غير صالح من الموديل");
      return NextResponse.json(
        { success: false, error: "الرد جه بشكل غير مفهوم. حاول تاني." },
        { status: 502 }
      );
    }

    const parsedPlan =
      typeof parsedData === "object" && parsedData !== null
        ? (parsedData as { isValid?: unknown; reason?: unknown; days?: unknown })
        : null;

    if (parsedPlan?.isValid === false) {
      return NextResponse.json({
        success: false,
        error:
          typeof parsedPlan.reason === "string"
            ? parsedPlan.reason
            : "اسم المادة غير واضح، يرجى كتابة اسم مادة صريحة.",
      });
    }

    // ٤) نتأكد إن الشكل اللي رجع فعلاً فيه أيام قبل ما نرجّعه للكلاينت
    if (!Array.isArray(parsedPlan?.days) || parsedPlan.days.length === 0) {
      console.error("generate-plan: رد بدون أيام");
      return NextResponse.json(
        { success: false, error: "مقدرتش أبني الخطة. حاول تاني بعد شوية." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: parsedData,
    });

  } catch (error) {
    try { if (guard && (guard as any)?.refId) await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ''), (guard as any).refId); } catch {}
    console.error("Groq API Error:", error);

    // ٥) رسايل عامة للكلاينت — تفاصيل الخطأ بتفضل في اللوج بس
    const { message, status } = errorDetails(error);
    const isRateLimit = message.includes("TPM") || status === 413 || status === 429;
    const errorMsg = isRateLimit
      ? "الخدمة مشغولة دلوقتي. حاول تاني بعد دقيقة."
      : "حصل خطأ أثناء توليد الخطة. حاول تاني.";

    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
