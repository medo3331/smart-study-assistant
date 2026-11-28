// lib/lesson/flashcards.ts
//
// 🗂️ فلاش كاردز الدرس — P5 (Practice & Assessment).
//
// تتولّد من الشرح المخزّن (cited الأول — المصدر الأساسي) في نداء AI واحد
// مجمّع، وتتخزّن في `lesson_content.questions` jsonb (عمود جاهز من db/46):
//   { flashcards: [{ front, back }], generatedAt }
// «ولّد مرة وخزّن» — إعادة التوليد بديل صريح (force).

/** أقصى عدد كروت في التوليد الواحد. */
export const MAX_FLASHCARDS = 10;
/** أقل عدد كروت يقبله التوليد (أقل من كده الرد مش مفيد). */
export const MIN_FLASHCARDS = 3;

export type LessonFlashcard = { front: string; back: string };

/** قراءة الفلاش كاردز المخزّنة — best-effort: أي شكل تالف ⇒ []. */
export function readFlashcards(raw: unknown): LessonFlashcard[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const list = (raw as { flashcards?: unknown }).flashcards;
  if (!Array.isArray(list)) return [];
  const out: LessonFlashcard[] = [];
  for (const item of list.slice(0, MAX_FLASHCARDS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const front = typeof (item as { front?: unknown }).front === "string" ? ((item as { front: string }).front).trim() : "";
    const back = typeof (item as { back?: unknown }).back === "string" ? ((item as { back: string }).back).trim() : "";
    if (front && back) out.push({ front: front.slice(0, 300), back: back.slice(0, 800) });
  }
  return out;
}

/** تنقية رد الموديل — نفس عقود القراءة، بيرفض الرد القليل/التالف. */
export function parseFlashcards(raw: string): LessonFlashcard[] | null {
  let parsed: unknown;
  try {
    // الموديل ممكن يغلّف الـ JSON — بنلقط أول مصفوفة.
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return null;
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const cards: LessonFlashcard[] = [];
  for (const item of parsed.slice(0, MAX_FLASHCARDS)) {
    if (!item || typeof item !== "object") continue;
    const front = typeof (item as { front?: unknown }).front === "string" ? ((item as { front: string }).front).trim() : "";
    const back = typeof (item as { back?: unknown }).back === "string" ? ((item as { back: string }).back).trim() : "";
    if (front && back) cards.push({ front: front.slice(0, 300), back: back.slice(0, 800) });
  }
  return cards.length >= MIN_FLASHCARDS ? cards : null;
}
