"use client";

import { useState } from "react";
import { RotateCcw, ChevronRight, ChevronLeft } from "lucide-react";

import type { Flashcard } from "@/lib/ai/lecture-study";

/* ==========================================================================
   🃏 بطاقات المذاكرة — Phase 4-B
   ═══════════════════════════════════════════════════════════════════════

   بطاقة بوجهين: السؤال قدام، الإجابة وراها. الطالب بيضغط عشان يقلب.

   ⚠️ **ليه `useState` و مش `<details>`**: `<details>` بيقلب لكن مش بيpermit
   التنقل بالأسهم بين البطاقات بشكل طبيعي على الموبايل. كمان الـ
   `aria-expanded` بتاعتنا أوضح لقارئ الشاشة من سلوك details الافتراضي.

   🔒 مافيش `dangerouslySetInnerHTML` — النصوص بتترسم كـ children عادي.
   ═══════════════════════════════════════════════════════════════════════ */

export function FlashcardsPanel({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (cards.length === 0) return null;

  const card = cards[Math.min(index, cards.length - 1)];

  /** ⚠️ `clamp` بـ wrap-around: آخر بطاقة + "التالي" يرجع للأولى.
   *    طالب بيحفظ آخر بطاقة وبيضغط تاني مش المفروض يفضل في آخر عنصر. */
  const go = (delta: number) => {
    setIndex((current) => (current + delta + cards.length) % cards.length);
    // ⚠️ البطاقة الجديدة تبدأ مخفية — غير كده الطالب يشوف إجابة اللي بعدها
    // قبل ما يقرأ سؤالها.
    setRevealed(false);
  };

  const restart = () => {
    setIndex(0);
    setRevealed(false);
  };

  return (
    <section aria-labelledby="flashcards-heading" className="mt-3 overflow-hidden rounded-2xl border border-rule bg-[var(--card-primary)]">
      <header className="flex items-center justify-between gap-3 border-b border-rule bg-black/[0.03] px-5 py-3 dark:bg-white/[0.03]">
        <h3 id="flashcards-heading" className="text-sm font-extrabold text-ink">
          🃏 بطاقات المذاكرة
        </h3>
        <span className="text-xs text-ink-soft">
          {index + 1} / {cards.length}
        </span>
      </header>

      <div className="p-5">
        <button
          type="button"
          onClick={() => setRevealed((value) => !value)}
          aria-expanded={revealed}
          className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-rule bg-[var(--card-secondary)] p-5 text-center transition-colors hover:opacity-90"
        >
          <span className="text-sm font-bold text-ink">{card.question}</span>
          {revealed && (
            <span className="mt-3 border-t border-rule pt-3 text-sm leading-relaxed text-ink-soft">
              {card.answer}
            </span>
          )}
        </button>

        <p className="mt-2 text-center text-xs text-ink-soft">
          {revealed ? "اضغط لإخفاء الإجابة" : "اضغط لعرض الإجابة"}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-rule bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
          >
            <ChevronRight size={16} aria-hidden />
            <span>السابقة</span>
          </button>

          <button
            type="button"
            onClick={restart}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-rule bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
          >
            <RotateCcw size={15} aria-hidden />
            <span>من الأول</span>
          </button>

          <button
            type="button"
            onClick={() => go(1)}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-rule bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
          >
            <span>التالية</span>
            <ChevronLeft size={16} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}