import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";

// هذا المسار مخصص لـ Magic Assistant (مرشد المنصة)
// مصمم لا يستهلك من كوتة AI Credits الطالب
// يستخدم موديل سريع ورخيص (مثل نيموترون من NVIDIA أو نموذج لغوي اقتصادي)
// ويحتوي على System Prompt خاص بالمرشد فقط

export async function POST(req: Request) {
  try {
    const { user, response: authError } = await requireUser("message");
    if (authError) return authError;

    const body = await req.json();
    const userMessage = body?.text || body?.content || "";

    // === تحقق من أن المستخدم سأل سؤالاً دراسياً (ليه ناعتذر) ===
    const studyKeywords = ["فيزياء", "رياضيات", "كيمياء", "معادلة", "تفاضل", "تكامل", "حل"];
    const studyRegex = /(?:فيزياء|رياضيات|كيمياء|معادلة|تفاضل|تكامل|الحل|السؤال|تمرين)/i;

    if (studyRegex.test(userMessage)) {
      return NextResponse.json({
        ok: false,
        response: {
          text: "هذا خارج تخصصي، أنا مرشد للمنصة. لأجل أسئلتك الدراسية، استخدم المعلم الشخصي في /chat",
          source: "assistant",
        },
        skippedCredits: true, // Signal to caller that we didn't consume a credit
      });
    }

    // === استدعاء الموديل السريع ===
    // نستخدم router لإرسال الطلب لنموذج اقتصادي (NVIDIA nimotron أو مشابه)
    // الملاحظة: يجب التأكد أن الـ router مخوَّل بالمرشد (يمكن إضافته للقائمة المختصرة)
    let completion;
    try {
      completion = await aiRouter.completeChat("chat", {
        messages: [
          {
            role: "system",
            content:
              // Dynamic prompt will be injected by the caller or we use a static fallback
              "You are Magic Assistant, the official guide of Magicly platform. Help users understand all platform features: how to upload a lecture, how to use the AI tutor, how to change subscription, what is QR code feature, how to contact support. Be friendly and concise. Do NOT answer academic/academic questions (math, physics, chemistry). If user asks, politely redirect them to /chat."
          },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
      });
    } catch (e) {
      console.warn("[magic-assistant] AI error", e);
      return NextResponse.json({
        ok: false,
        response: {
          text: "تعذر الاتصال بالمرشد في هذه اللحظة، جرب ponownie.",
          source: "assistant",
        },
        skippedCredits: true,
      });
    }

    const assistantMessage = completion.content || "";

    return NextResponse.json({
      ok: true,
      response: {
        text: assistantMessage,
        source: "assistant",
      },
      skippedCredits: true, // Important: we explicitly say we didn't consume a credit
    });
  } catch (error) {
    console.error("[magic-assistant] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "حدث خطأ غير متوقع", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// GET for health check or simple queries
export async function GET(req: Request) {
  const { search } = await req.json() || {};
  return NextResponse.json({
    name: "Magic Assistant",
    version: "2.0 AI-powered",
    description: "Omniscient platform guide AI",
  });
}