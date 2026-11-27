import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { generateDeckFile } from "@/lib/ai/slides-generator";
import type { DeckState, DeckSlide } from "@/lib/ai/slides";

/* ==========================================================================
   💾 /api/slides-export — تحميل شرائح الشات كملف حقيقي (PowerPoint/PDF/Word)
   ══════════════════════════════════════════════════════════════════════════

   💡 **ليه route مستقل؟** شرائح الشات (`ChatSlides`) بتولّد JSON على الكلاينت،
      لكن مولّد الـ deck (`generateDeckFile`) بيتعامل مع node:fs (خطوط PDF) —
      فالتصدير لازم يبقى سيرفر. مفيش AI call هنا: التحويل بيانات-صافي،
      فمفيش credit بيتحسب (نفس فلسفة generate-slides: الـ route بيرجّع JSON بس).

   المدخل: { topic, slides: [{title, bullets, note, code}], format: pptx|pdf|docx }
   الخرج: ملف binary مع Content-Disposition (يُحفظ على جهاز الطالب مباشرة).
   ========================================================================== */

const MAX_SLIDES = 30;
const MAX_TOPIC_CHARS = 200;
const MAX_BULLET_CHARS = 400;

/** تحويل شرائح الشات (شكل الكلاينت) إلى شكل Deck الموحّد. */
function toDeckSlides(raw: unknown): DeckSlide[] {
  if (!Array.isArray(raw)) return [];
  const out: DeckSlide[] = [];
  for (const s of raw.slice(0, MAX_SLIDES)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, MAX_TOPIC_CHARS) : "";
    const bullets = Array.isArray(o.bullets)
      ? o.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0).slice(0, 10)
          .map((b) => ({ text: b.trim().slice(0, MAX_BULLET_CHARS), page: null as number | null }))
      : [];
    const note = typeof o.note === "string" ? o.note.trim().slice(0, 600) : "";
    if (!title && bullets.length === 0) continue;
    out.push({
      heading: title || "شريحة",
      bullets,
      ...(note ? { notes: note } : {}),
    });
  }
  return out;
}

export async function POST(req: Request) {
  const { response: authError } = await requireUser("message");
  if (authError) return authError;

  let body: { topic?: unknown; slides?: unknown; format?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "بيانات غير صالحة." } }, { status: 400 });
  }

  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, MAX_TOPIC_CHARS) : "شرح";
  const deckSlides = toDeckSlides(body.slides);
  if (deckSlides.length === 0) {
    return NextResponse.json({ error: { message: "مفيش شرائح صالحة للتحميل." } }, { status: 400 });
  }
  const format = body.format === "pdf" || body.format === "docx" ? body.format : "pptx";

  const state: DeckState = {
    version: 1,
    title: topic,
    total_parts: 1,
    parts: [{ index: 0, status: "ready", pages: [], slides: deckSlides, error: null }],
    source: { file_name: "chat", page_count: 0, unit: "slide" },
  };

  try {
    const file = await generateDeckFile({ format, state, slides: deckSlides });
    // ⚠️ filename عربي — ASCII fallback + filename* UTF-8 عشان الـ header ما يكسرش.
    const disposition = `attachment; filename="magicly-slides.${format}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`;
    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("slides-export failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: { message: "تعذّر توليد الملف — جرّب تاني." } }, { status: 500 });
  }
}
