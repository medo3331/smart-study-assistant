"use client";

import { Check } from "lucide-react";

import { unitLabel } from "@/lib/ai/slides-labels";

/* ==========================================================================
   🎬 معاينة شرائح العرض — مشترك بين المستندات والمحاضرات
   ============================================================================

   ⚠️ **«اللي شايفه = اللي هيطلع»**: الشريط الملوّن فوق كل شريحة هو
   **نفس** التدرّج اللي في الـ PPTX المصدَّر. ⇒ الطالب بيفهم شكل
   الملف قبل ما ينزّله.

   ⚠️ **شارة المرجع** = نفس لغة الاقتباسات في الشرح المكثف
     (`.deck-cite` = نسخة مصغّرة من `.citation-mark`).
   ========================================================================== */

export type DeckSlidePreview = {
  heading: string;
  bullets: Array<{ text: string; page: number | null; label?: string }>;
  notes?: string;
};

export function DeckSlides({
  slides,
  unit,
  showVerified = true,
}: {
  slides: DeckSlidePreview[];
  unit: "page" | "slide" | "paragraph" | "segment";
  /** شارة «متحقَّق منه» (المرجع اتحقَّق فعلاً). */
  showVerified?: boolean;
}) {
  if (slides.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-ink-soft">
        مفيش شرائح جاهزة بعد. ولّد جزء وبيظهر هنا.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {slides.map((slide, index) => (
        <article key={`${index}-${slide.heading}`} className="deck-slide-mini">
          <div className="deck-slide-mini-bar" aria-hidden />
          <div className="deck-slide-mini-body">
            <h4 className="deck-slide-mini-heading">{slide.heading}</h4>
            <ul className="mt-1.5 space-y-1">
              {slide.bullets.map((bullet, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline gap-x-1.5 text-xs leading-relaxed text-ink-soft"
                >
                  <span>• {bullet.text}</span>
                  {bullet.page !== null && (
                    <span
                      className="deck-cite"
                      title={bullet.label ?? unitLabel(unit, bullet.page)}
                    >
                      {bullet.label ?? bullet.page}
                    </span>
                  )}
                  {showVerified && bullet.page !== null && (
                    <span className="deck-cite-verified">
                      <Check size={9} aria-hidden />
                      <span className="sr-only">متحقَّق منه</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}
