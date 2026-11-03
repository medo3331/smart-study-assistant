import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { cleanTextForSpeech } from "@/lib/voice/clean";

// Phase 2: Text-to-Speech via ElevenLabs.
// Credits: NOT deducted yet — ai_credit_ledger policy for TTS is pending review
// (see economy.ts: AI_CREDITS status = FUTURE). When policy is approved,
// wire guardAiAccessAndReserve/refundAiCreditIfNeeded here.

export async function POST(req: Request) {
  const { user, response: authError } = await requireUser("message");
  if (authError) return authError;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_TTS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return NextResponse.json(
      { error: { message: "خدمة الصوت غير مهيّأة.", code: "TTS_NOT_CONFIGURED" } },
      { status: 503 }
    );
  }

  let body: { text?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "بيانات غير صالحة." } }, { status: 400 });
  }
  const raw = typeof body.text === "string" ? body.text : "";
  const text = cleanTextForSpeech(raw).slice(0, 2000);
  if (!text.trim()) {
    return NextResponse.json({ error: { message: "نص فارغ." } }, { status: 400 });
  }

  const modelId = process.env.ELEVENLABS_TTS_MODEL_ID || "eleven_multilingual_v2";

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[tts] elevenlabs error", res.status, errText.slice(0, 200));
      return NextResponse.json(
        { error: { message: "تعذر توليد الصوت.", code: "TTS_PROVIDER_ERROR" } },
        { status: 502 }
      );
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.warn("[tts] fetch failed", e);
    return NextResponse.json(
      { error: { message: "تعذر الاتصال بخدمة الصوت.", code: "TTS_NETWORK_ERROR" } },
      { status: 502 }
    );
  }
}
