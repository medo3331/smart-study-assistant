/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { GROQ_MODELS } from "@/lib/ai-config";

/** أقصى طول لأي حقل نصي جاي من الكلاينت. */
const MAX_FIELD_CHARS = 300;

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
    // ١) لازم مستخدم مسجّل
    const { user, supabase, response: authError } = await requireUser("success");
    __hUser = user; __hSupabase = supabase;
    if (authError) return authError;

    // ٢) حدّ استخدام لكل مستخدم
    const limited = checkRateLimit(`day:${user.id}`, 20, 60_000, "success");
    if (limited) return limited;
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
    const dayTitle = clampText(body.dayTitle, MAX_FIELD_CHARS).trim();
    const type = body.type; // 'explanation' | 'quiz'

    if (!subject || !dayTitle || !type) {
      return NextResponse.json(
        { success: false, error: "جميع البيانات المطلوبة غير مكتملة." },
        { status: 400 }
      );
    }

    // ٣) النوع من قائمة مقفولة — مش أي قيمة جاية من الكلاينت
    if (type !== "quiz" && type !== "explanation") {
      return NextResponse.json(
        { success: false, error: "نوع الطلب غير مدعوم." },
        { status: 400 }
      );
    }

    // تجميع وتنظيف المفاتيح من متغيرات البيئة
    const rawKeys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY,
    ];

    const validKeys = rawKeys
      .map((k) => k?.trim())
      .filter((k): k is string => typeof k === "string" && k.length > 0);

    const apiKeys = Array.from(new Set(validKeys));

    if (apiKeys.length === 0) {
      console.error("generate_day: مفيش أي GROQ_API_KEY معرف");
      await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ""), (guard as any)?.refId ?? "");
      return NextResponse.json(
        { success: false, error: "الخدمة غير متاحة حالياً." },
        { status: 503 }
      );
    }

    // إعداد الـ Prompt بناءً على نوع الطلب
    const prompt =
      type === "quiz"
        ? `أنشئ 3 أسئلة اختيار من متعدد مع الإجابات الصحيحة لدرس "${dayTitle}" في مادة "${subject}". أرجع الناتج بتنسيق JSON فقط بالشكل التالي:
{"quiz": [{"question": "السؤال", "options": ["اختيار 1", "اختيار 2", "اختيار 3", "اختيار 4"], "correctAnswer": 0}]}`
        : `اكتب شرحاً مفصلاً، واضحاً، ومبسطاً لدرس "${dayTitle}" في مادة "${subject}". استخدم نقاطاً واضحة وأمثلة شارحة إذا أمكن.`;

    let result = "";
    let lastError: unknown = null;

    // التجربة المتتابعة عبر جميع المفاتيح
    for (const apiKey of apiKeys) {
      try {
        const groq = new Groq({ apiKey });
        const completion = await groq.chat.completions.create({
          model: GROQ_MODELS.fast,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 1000,
          response_format: type === "quiz" ? { type: "json_object" } : undefined,
        });

        result = completion.choices[0]?.message?.content || "";
        if (result) break; // نجاح الطلب، اخرج من اللوب
      } catch (err) {
        console.warn(`فشل المفتاح في جلب التفاصيل، يتم التجربة بالمفتاح التالي...`);
        lastError = err;
      }
    }

    if (!result) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      throw lastError || new Error("فشلت جميع المفاتيح في جلب تفاصيل الدرس.");
    }

    // إذا كان الطلب كويز، نقوم بتحليل الـ JSON لتمريره كمصفوفة صريحة
    if (type === "quiz") {
      // ٤) رد مكسور من الموديل = خطأ متوقّع مش كراش
      let parsedQuiz: unknown;
      try {
        parsedQuiz = JSON.parse(result);
      } catch {
        console.error("generate_day: رد كويز غير صالح");
        return NextResponse.json(
          { success: false, error: "الأسئلة جِت بشكل غير مفهوم. حاول تاني." },
          { status: 502 }
        );
      }

      const quiz =
        typeof parsedQuiz === "object" && parsedQuiz !== null
          ? (parsedQuiz as { quiz?: unknown }).quiz
          : undefined;
      if (!Array.isArray(quiz) || quiz.length === 0) {
        console.error("generate_day: كويز فاضي");
        return NextResponse.json(
          { success: false, error: "مقدرتش أجيب أسئلة للدرس ده. حاول تاني." },
          { status: 502 }
        );
      }

      return NextResponse.json({ success: true, data: quiz });
    }

    return NextResponse.json({ success: true, data: result });

  } catch (error) {
    try { if (guard && (guard as any)?.refId) await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ''), (guard as any).refId); } catch {}
    console.error("Day Details Error:", error);

    // ٥) تفاصيل الخطأ تفضل في اللوج — الكلاينت بياخد رسالة عامة
    const { message, status } = errorDetails(error);
    const isRateLimit = message.includes("TPM") || status === 413 || status === 429;

    return NextResponse.json(
      {
        success: false,
        error: isRateLimit
          ? "الخدمة مشغولة دلوقتي. حاول تاني بعد دقيقة."
          : "حصل خطأ أثناء جلب تفاصيل الدرس. حاول تاني.",
      },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
