"use client";

import { useCallback, useEffect, useState } from "react";
import { useNotebook } from "../LessonStudioProvider";
import { MAX_FLASHCARDS, type LessonFlashcard } from "@/lib/lesson/flashcards";

/* ==========================================================================
   FlashcardsPractice (P5) — فلاش كاردز الدرس:
   تتولّد من الشرح المخزّن (action flashcards في /api/lesson-content —
   «ولّد مرة وخزّن») وكل كارت يتقلب بضغطة، ويتحوّل للنوتة كنص منسق
   عبر نفس مسار الـ postMessage الموجود — بدون أي نداء إضافي.
   ========================================================================== */

export default function FlashcardsPractice({ dayId, topic }: { dayId: string; topic: string }) {
  const { queueNotebookDraft } = useNotebook();
  const [cards, setCards] = useState<LessonFlashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  const fetchCards = useCallback(
    async (force = false) => {
      if (force) setGenerating(true);
      setError(null);
      try {
        const response = await fetch("/api/lesson-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dayId, action: "flashcards", force }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error?.message || "توليد الفلاش كاردز فشل — جرّب تاني.");
        }
        setCards(Array.isArray(data.flashcards) ? (data.flashcards as LessonFlashcard[]) : []);
        setFlipped(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : "توليد الفلاش كاردز فشل — جرّب تاني.");
      } finally {
        setLoading(false);
        setGenerating(false);
      }
    },
    [dayId]
  );

  // أول فتح: الكروت المخزّنة (لو موجودة) — من غير توليد.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/lesson-content?dayId=${encodeURIComponent(dayId)}`);
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok && Array.isArray(data.flashcards) && data.flashcards.length > 0) {
          setCards(data.flashcards as LessonFlashcard[]);
        }
      } catch {
        /* best-effort — زر التوليد هو الطريق */
      } finally {
        setLoading(false);
      }
    })();
  }, [dayId]);

  const toggleFlip = (index: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const cardToNote = (card: LessonFlashcard) => ({
    title: topic,
    body: `🃏 فلاش كارد\n\n**السؤال:** ${card.front}\n\n**الإجابة:** ${card.back}`,
    source: "فلاش كارد",
  });

  return (
    <div className="sheet-card p-5 sm:p-6 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <p className="eyebrow eyebrow-flush mb-1">مراجعة سريعة</p>
          <h2 className="h3">فلاش كاردز الدرس</h2>
        </div>
        {cards.length > 0 ? (
          <button
            onClick={() => void fetchCards(true)}
            disabled={generating}
            className="btn btn-quiet text-[11px] px-2.5 py-1 ms-auto"
            title="توليد مجموعة كروت جديدة — القديمة بتتفوق للكاش"
          >
            ♻️ كروت جديدة
          </button>
        ) : (
          <button
            onClick={() => void fetchCards()}
            disabled={loading || generating}
            className="btn btn-marker text-xs px-3.5 py-2 ms-auto"
          >
            {generating ? "بيجهّز الكروت…" : "جهّز الكروت"}
          </button>
        )}
      </div>

      {error && <p className="text-[11.5px] text-ink-soft">{error}</p>}

      {loading && cards.length === 0 ? (
        <p className="text-[11.5px] text-ink-soft">بيفحص الكروت المخزّنة…</p>
      ) : cards.length === 0 ? (
        <p className="text-[11.5px] text-ink-soft leading-relaxed">
          الكروت بتتولّد من الشرح المخزّن للدرس — ولّد الشرح الأول من تاب «الشرح» لو لسه متولّدش.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {cards.slice(0, MAX_FLASHCARDS).map((card, i) => (
            <div key={i} className="rounded-xl border border-rule bg-paper p-3 space-y-2">
              <button
                onClick={() => toggleFlip(i)}
                aria-pressed={flipped.has(i)}
                className="w-full text-right space-y-1.5"
                title={flipped.has(i) ? "اضغط لرجوع السؤال" : "اضغط لعرض الإجابة"}
              >
                <span className="tag tag-quiet inline-block">{flipped.has(i) ? "الإجابة" : `كارت ${i + 1}`}</span>
                <span className="block text-[12px] font-bold text-ink leading-snug">{flipped.has(i) ? card.back : card.front}</span>
              </button>
              <button
                onClick={() => queueNotebookDraft(cardToNote(card))}
                className="btn btn-quiet text-[10.5px] px-2 py-1"
                title="إضافة الكارت للنوتة — بالمعاينة"
              >
                📝 للنوتة
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
