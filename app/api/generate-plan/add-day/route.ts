/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { GROQ_MODELS } from "@/lib/ai-config";

const MAX_TEXT = 220;

export async function POST(req: Request) {
  let guard: any = null;
  let __hUser: any = null;
  let __hSupabase: any = null;
  try {
    const { user, supabase, response: authError } = await requireUser("success");
    __hUser = user; __hSupabase = supabase;
    if (authError) return authError;

    const limited = checkRateLimit(`add-day:${user.id}`, 10, 60_000, "success");
    if (limited) return limited;
    // Phase H: 1 credit
    guard = await guardAiAccessAndReserve(supabase, user.id, "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    const subject = clampText(body?.subject, MAX_TEXT).trim();
    const previousTopics = clampText(body?.previousTopics, 900).trim();
    const learningStyle = clampText(body?.learningStyle, 40).trim();
    if (!subject) return NextResponse.json({ success: false, error: "المادة مطلوبة." }, { status: 400 });

    const apiKey = [process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3, process.env.GROQ_API_KEY]
      .map((key) => key?.trim())
      .find((key): key is string => Boolean(key));
    if (!apiKey) { await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ""), (guard as any)?.refId ?? ""); return NextResponse.json({ success: false, error: "الخدمة غير متاحة حالياً." }, { status: 503 }); }

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MODELS.fast,
      temperature: 0.35,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "أنت معلم. اقترح خطوة الدراسة التالية فقط بدون تكرار ما سبق. أعد JSON فقط بالشكل: {\"title\":\"عنوان قصير\",\"topic\":\"عنوان الدرس\",\"description\":\"وصف قصير عملي\"}." },
        { role: "user", content: `المادة: ${subject}\nأسلوب التعلم: ${learningStyle || "عملي"}\nالموضوعات المنجزة أو المضافة سابقاً: ${previousTopics || "لا يوجد"}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "";
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid response");
    const day = parsed as { title?: unknown; topic?: unknown; description?: unknown };
    const topic = clampText(day.topic, MAX_TEXT).trim();
    if (!topic) throw new Error("missing topic");

    return NextResponse.json({ success: true, data: {
      title: clampText(day.title, MAX_TEXT).trim() || "الخطوة التالية",
      topic,
      description: clampText(day.description, MAX_TEXT).trim(),
    } });
  } catch (error) {
    try { if (guard && (guard as any)?.refId) await refundAiCreditIfNeeded(__hSupabase, (__hUser?.id ?? ''), (guard as any).refId); } catch {}
    console.error("add-day generation failed:", error);
    return NextResponse.json({ success: false, error: "تعذر تجهيز الخطوة التالية. حاول مرة أخرى." }, { status: 502 });
  }
}
