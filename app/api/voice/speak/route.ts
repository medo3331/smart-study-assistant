import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { cleanTextForSpeech } from "@/lib/voice/clean";

// Phase 2: Text-to-Speech via ElevenLabs (إن كان متظبطًا) — وإلا Groq Orpheus مجانًا.
// Credits: NOT deducted yet — ai_credit_ledger policy for TTS is pending review
// (see economy.ts: AI_CREDITS status = FUTURE). When policy is approved,
// wire guardAiAccessAndReserve/refundAiCreditIfNeeded here.
//
// ⚠️ **ليه Groq fallback (2026-11):** ElevenLabs مدفوع ومفتاحه مش متظبط في
//    البيئة — بينما حساب Groq نفسه فيه TTS مجاني عربي (orpheus-arabic-saudi).
//    ⚠️ حد Orpheus الرسمي: **200 حرف لكل طلب** — فالشرح الطويل يتقسم لمقاطع
//    على حدود الجُمل، وكل مقطع يترجّع WAV مستقل، والمشغّل في الواجهة
//    يشغّلهم بالترتيب (JSON {segments} بدل ملف صوتي واحد).

export async function POST(req: Request) {
  const { user, response: authError } = await requireUser("message");
  if (authError) return authError;

  let body: { text?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "بيانات غير صالحة." } }, { status: 400 });
  }
  const raw = typeof body.text === "string" ? body.text : "";
  const text = cleanTextForSpeech(raw).slice(0, 2400);
  if (!text.trim()) {
    return NextResponse.json({ error: { message: "نص فارغ." } }, { status: 400 });
  }

  // ---- Groq Orpheus المجاني — بديل ElevenLabs لما مفيش مفتاحها ----
  const elevenApiKey = process.env.ELEVENLABS_API_KEY;
  const elevenVoiceId = process.env.ELEVENLABS_TTS_VOICE_ID;
  if (!elevenApiKey || !elevenVoiceId) return speakWithGroq(text);

  const modelId = process.env.ELEVENLABS_TTS_MODEL_ID || "eleven_multilingual_v2";

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": elevenApiKey,
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
      // مفتاح موجود بس فاشل — نجرّب Groq بدل ما نكسر الزر.
      return speakWithGroq(text);
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

/* ==========================================================================
   Groq Orpheus — TTS مجاني (احتياطي ElevenLabs)
   ==========================================================================
   ⚠️ حد Orpheus الرسمي: 200 حرف لكل طلب — التقسيم على حدود الجُمل إجباري.
   ⚠️ D-REAL-008: الموديلات دي ظاهرة في قائمة حساب Groq (11 موديل) — سكربت
      التحقق scripts/verify-groq-tts.mjs هو اللي يثبت الشكل قبل اعتمادها.
   الرد: JSON {ok, segments:[base64 wav,...]} — الواجهة تشغّل المقاطع بالترتيب.
   ========================================================================== */

const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
const GROQ_TTS_MAX_CHUNK = 190;
const GROQ_TTS_MAX_CHUNKS = 10;

const ARABIC_RE = /[\u0600-\u06FF]/g;

/** تقسيم على حدود الجُمل — كلمة واحدة ما تتنصّلش أبدًا. */
function chunkForOrpheus(text: string): string[] {
  const sentences = text.split(/(?<=[.؟!،؛:,\n])\s+/).filter((s) => s.trim());
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length <= GROQ_TTS_MAX_CHUNK) {
      cur = (cur ? `${cur} ` : "") + s;
    } else {
      if (cur) chunks.push(cur);
      if (s.length <= GROQ_TTS_MAX_CHUNK) {
        cur = s;
      } else {
        // جملة أطول من الحد — نقسمها بالكلمات.
        let part = "";
        for (const w of s.split(/\s+/)) {
          if ((part + " " + w).trim().length <= GROQ_TTS_MAX_CHUNK) part = (part ? `${part} ` : "") + w;
          else { chunks.push(part); part = w; }
        }
        cur = part;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.slice(0, GROQ_TTS_MAX_CHUNKS);
}

async function speakWithGroq(text: string): Promise<Response> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: { message: "خدمة الصوت غير مهيّأة.", code: "TTS_NOT_CONFIGURED" } },
      { status: 503 }
    );
  }
  const isArabic = (text.match(ARABIC_RE)?.length ?? 0) > text.length / 3;
  const model = isArabic ? "canopylabs/orpheus-arabic-saudi" : "canopylabs/orpheus-v1-english";
  const voice = isArabic ? "fahad" : "hannah";
  const chunks = chunkForOrpheus(text);
  if (chunks.length === 0) {
    return NextResponse.json({ error: { message: "نص فارغ." } }, { status: 400 });
  }

  try {
    const results = await Promise.all(
      chunks.map(async (input) => {
        const res = await fetch(GROQ_TTS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, voice, input, response_format: "wav" }),
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`groq-tts ${res.status}: ${detail.slice(0, 200)}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.toString("base64");
      })
    );
    return NextResponse.json(
      { ok: true, segments: results, format: "wav" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.warn("[tts] groq orpheus error:", (e as Error).message);
    return NextResponse.json(
      { error: { message: "تعذر توليد الصوت.", code: "TTS_PROVIDER_ERROR" } },
      { status: 502 }
    );
  }
}
