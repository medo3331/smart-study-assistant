// lib/notes/study-deck.ts
//
// 🎴 تحليل ردود الـ AI لدِيك المذاكرة — pure، بدون React.
//
// الـ AI بيرجّع نص ممكن يكون فيه كلام حوالين الـ JSON أو code fences —
// المحلل هنا متسامح: بيلقط أول كائن JSON صالح وبيتحقق من الشكل، وبيهمل
// أي عنصر ناقص بدل ما يكسر التجربة.

export interface Flashcard {
  q: string;
  a: string;
}

export interface McqQuestion {
  q: string;
  options: string[];
  /** فهرس الإجابة الصحيحة. */
  answer: number;
}

export type StudyDeck =
  | { kind: "flashcards"; cards: Flashcard[] }
  | { kind: "mcq"; questions: McqQuestion[] };

/** استخراج JSON متسامح — بينظف أي كلام حوالين الـ JSON أو code fences. */
export function extractJson(raw: string): unknown {
  const stripped = raw
    .replace(/```json/gi, "```")
    .split("```")
    .map((part) => part.trim())
    .find((part) => part.startsWith("{") || part.startsWith("["));
  const candidate = stripped ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** يبني دِيك متحقق منه من رد الـ AI — null لو مفيش محتوى صالح. */
export function parseDeck(kind: "flashcards" | "mcq", raw: string): StudyDeck | null {
  const data = extractJson(raw) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;
  if (kind === "flashcards") {
    const cards = Array.isArray(data.cards) ? data.cards : [];
    const parsed = cards
      .map((card) => {
        const entry = card as { q?: unknown; a?: unknown; front?: unknown; back?: unknown };
        const q = String(entry.q ?? entry.front ?? "").trim();
        const a = String(entry.a ?? entry.back ?? "").trim();
        return q && a ? { q, a } : null;
      })
      .filter((card): card is Flashcard => card !== null)
      .slice(0, 30);
    return parsed.length > 0 ? { kind: "flashcards", cards: parsed } : null;
  }
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const parsed = questions
    .map((question) => {
      const entry = question as { q?: unknown; options?: unknown; answer?: unknown };
      const q = String(entry.q ?? "").trim();
      const options = Array.isArray(entry.options)
        ? entry.options.map((option) => String(option).trim()).filter(Boolean)
        : [];
      const answer = Number(entry.answer);
      return q && options.length >= 2 && Number.isInteger(answer) && answer >= 0 && answer < options.length
        ? { q, options, answer }
        : null;
    })
    .filter((question): question is McqQuestion => question !== null)
    .slice(0, 20);
  return parsed.length > 0 ? { kind: "mcq", questions: parsed } : null;
}
