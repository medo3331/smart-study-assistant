"use client";

interface Props {
  completed: number;
  total: number;
  progressPct: number | null;
  currentDay?: number | null;
}

export function PreparatoryProgress({ completed, total, progressPct, currentDay }: Props) {
  if (!total || total === 0) {
    return (
      <section aria-label="تقدمك" className="sheet-card p-5 sm:p-6">
        <h2 className="font-display font-semibold text-ink">تقدمك الدراسي</h2>
        <div className="mt-4 rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center">
          <p className="text-2xl" aria-hidden>📈</p>
          <p className="mt-2 text-sm font-semibold text-ink">ابدأ أول درس ليظهر تقدمك</p>
          <p className="mt-1 text-xs text-ink-soft">تابع إنجازك يوماً بيوم</p>
        </div>
      </section>
    );
  }
  const pct = progressPct ?? Math.round((completed / total) * 100);
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <section aria-label="تقدمك" className="sheet-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display font-semibold text-ink">تقدمك الدراسي</h2>
        <span className="mono text-xs font-bold text-ink">{safePct}%</span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-paper-3 border border-rule" role="progressbar" aria-valuenow={safePct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${safePct}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="mono text-ink-soft">أنجزت {completed} من {total}</span>
        {currentDay && <span className="tag">اليوم {currentDay}</span>}
      </div>
    </section>
  );
}
