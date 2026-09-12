"use client";

interface Subject {
  id: string;
  name: string;
  code?: string;
  type?: string;
}

const ICONS: Record<string, string> = {
  "رياضيات": "📐",
  "الرياضيات": "📐",
  "لغة عربية": "📝",
  "عربي": "📝",
  "لغة إنجليزية": "🔤",
  "انجليزي": "🔤",
  "علوم": "🔬",
  "دراسات": "🌍",
  "دراسات اجتماعية": "🌍",
  "دين": "🕌",
  "تربية دينية": "🕌",
  "حاسب": "💻",
  "تكنولوجيا": "💻",
};

function iconFor(name: string): string {
  const lower = name.trim();
  if (ICONS[lower]) return ICONS[lower];
  for (const [k, v] of Object.entries(ICONS)) if (lower.includes(k) || k.includes(lower)) return v;
  return "📚";
}

export function PreparatorySubjectGrid({
  subjects,
  loading,
  error,
  gradeName,
  onSelect,
}: {
  subjects: Subject[];
  loading?: boolean;
  error?: string | null;
  gradeName?: string | null;
  onSelect?: (subjectName: string) => void;
}) {
  if (loading) {
    return (
      <section aria-label="موادي" className="sheet-card p-5 sm:p-6">
        <h2 className="font-display text-[1.05rem] font-bold text-ink">موادك الدراسية</h2>
        <p className="mt-2 mono text-xs text-ink-soft">جارٍ تحميل موادك…</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-xl bg-paper-3 border border-rule" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="موادي" className="sheet-card p-5 sm:p-6">
        <h2 className="font-display text-[1.05rem] font-bold text-ink">موادك الدراسية</h2>
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">{error}</p>
      </section>
    );
  }

  if (!subjects || subjects.length === 0) {
    return (
      <section aria-label="موادي" className="sheet-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[1.05rem] font-bold text-ink">موادك الدراسية</h2>
          {gradeName && <span className="tag">{gradeName}</span>}
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center">
          <p className="text-2xl" aria-hidden>📚</p>
          <p className="mt-2 text-sm font-bold text-ink">لا توجد مواد مرتبطة حالياً</p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">ابدأ بتحديد هدفك وستظهر موادك هنا</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="موادي" className="sheet-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[1.05rem] font-bold text-ink">موادك الدراسية</h2>
        <div className="flex items-center gap-2">
          {gradeName && <span className="tag">{gradeName}</span>}
          <span className="mono text-[11px] text-ink-soft">{subjects.length} مواد</span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-soft">اختر مادة لبدء المذاكرة أو المراجعة</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect?.(s.name)}
            aria-label={`افتح مادة ${s.name}`}
            className="group flex items-center gap-3 rounded-xl border border-rule bg-paper-2 p-3.5 text-right hover:bg-paper-3 hover:border-ink/10 hover:shadow-[0_2px_8px_var(--shade)] active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15"
          >
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper-2 border border-rule text-[1.1rem]">
              {iconFor(s.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display font-semibold text-sm leading-5 text-ink truncate">{s.name}</span>
              <span className="block mono text-[11px] text-ink-soft group-hover:text-ink">افتح →</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
