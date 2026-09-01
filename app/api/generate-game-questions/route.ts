/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";

export async function POST(request: Request) {
  let guard: { refId: string } | null = null;
  let supabase: any = null;
  let userId: string | null = null;
  try {
    const { user, supabase: sb, response: authError } = await requireUser("message");
    if (authError) return authError;
    supabase = sb;
    userId = user.id;
    const limited = checkRateLimit(`game-questions:${user.id}`, 10, 60_000, "message");
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const lessonText = clampText(body?.lessonText, 8000).trim();
    if (!lessonText) {
      return NextResponse.json({ error: "Lesson text is required" }, { status: 400 });
    }

    // Phase H: 1 credit gate (free model, but still costs credit — no anonymous bypass)
    const g = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");
    if (!g.ok) return g.response;
    guard = g;

    const prompt = `
      بناءً على النص التعليمي التالي، قم بإنشاء 4 أزواج من المصطلحات وتعريفاتها (أو الأسئلة وإجاباتها) المناسبة للعبة مطابقة الكروت.
      يجب أن يكون الرد بصيغة JSON صالح فقط بدون أي نصوص إضافية أو علامات Markdown (مثل \`\`\`json)، بحيث يكون بالهيكل التالي تماماً:
      [
        { "question": "السؤال أو المصطلح", "answer": "الإجابة أو التعريف" }
      ]

      النص التعليمي:
      \${lessonText}
    `;

    const apiKey = (process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || "").trim();
    if (!apiKey) {
      await refundAiCreditIfNeeded(supabase, userId, guard.refId);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are a helpful educational assistant that outputs strictly in JSON format." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    const textResult = completion.choices[0]?.message?.content || "";
    const jsonStartIndex = textResult.indexOf("[");
    const jsonEndIndex = textResult.lastIndexOf("]") + 1;
    const jsonString = textResult.substring(jsonStartIndex, jsonEndIndex);
    const pairs = JSON.parse(jsonString);

    return NextResponse.json({ pairs });

  } catch (error) {
    if (guard && supabase && userId) await refundAiCreditIfNeeded(supabase, userId, guard.refId);
    console.error("Error generating game questions with Groq:", error);
    return NextResponse.json({ error: "Failed to generate questions" }, { status: 500 });
  }
}
