"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/* ==========================================================================
   🎬 شريط أجزاء العرض — مشترك بين المستندات والمحاضرات
   ============================================================================

   ⚠️ **مسطرة الأجزاء** (`.deck-parts-rail`): كل جزء = خط صغير. المتولّد
      ملوّن، والجزء الحالي عليه هالة. ⇒ الطالب بيشوف «قد إيه اتعمل»
      من غير ما يقرا رقم.
   ========================================================================== */

export function DeckPartNav({
  total,
  current,
  readyCount,
  statuses,
  busy,
  onSelect,
}: {
  total: number;
  current: number;
  readyCount: number;
  /** حالة كل جزء: `ready` | `pending` | `failed`. */
  statuses: Array<"ready" | "pending" | "failed">;
  busy?: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSelect(current - 1)}
          disabled={current === 0 || busy}
          aria-label="الجزء السابق"
          className="grid h-8 w-8 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        <span className="min-w-[6.5rem] text-center text-xs font-semibold text-ink-soft">
          الجزء {current + 1} من {total}
        </span>
        <button
          type="button"
          onClick={() => onSelect(current + 1)}
          disabled={current >= total - 1 || busy}
          aria-label="الجزء التالي"
          className="grid h-8 w-8 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="deck-parts-rail" aria-hidden>
          {statuses.map((status, i) => (
            <span
              key={i}
              data-ready={status === "ready" ? "true" : "false"}
              data-current={i === current ? "true" : "false"}
            />
          ))}
        </span>
        <span className="text-[11px] text-ink-soft">
          {readyCount} من {total} متولّد
        </span>
      </div>
    </div>
  );
}
