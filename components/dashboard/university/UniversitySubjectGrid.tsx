"use client";

interface Subject {
  id: string;
  name: string;
  code?: string;
  type?: string;
}

const ICONS: Record<string, string> = {
  "برمجة": "💻",
  "خوارزميات": "⚙",
  "قواعد بيانات": "🗄",
  "شبكات": "🌐",
  "ذكاء": "🤖",
};

function iconFor(name: string): string {
  const lower = name.trim();
  for (const [k, v] of Object.entries(ICONS)) if (lower.includes(k)) return v;
  return "📘";
}

export function UniversitySubjectGrid({
  subjects,
  loading,
  error,
  facultyName,
  departmentName,
  onSelect,
}: {
  subjects: Subject[];
  loading?: boolean;
  error?: string | null;
  facultyName?: string | null;
  departmentName?: string | null;
  onSelect?: (subjectName: string) => void;
}) {
  if (loading) {
    return (
      <section aria-label="مواد التخصص" className="sheet-card p-5 sm:p-6">
        <h2 className="font-display text-[1.02rem] font-semibold text-ink">مواد التخصص</h2>
        <p className="mt-2 mono text-xs text-ink-soft">جارٍ التحميل…</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-xl bg-paper-3 border border-rule" />
          ))}
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section aria-label="مواد التخصص" className="sheet-card p-5 sm:p-6">
        <h2 className="font-display text-[1.02rem] font-semibold text-ink">مواد التخصص</h2>
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">{error}</p>
      </section>
    );
  }
  if (!subjects || subjects.length === 0) {
    return (
      <section aria-label="مواد التخصص" className="sheet-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[1.02rem] font-semibold text-ink">مواد التخصص</h2>
          <div className="flex gap-2">{facultyName && <span className="tag">{facultyName}</span>}</div>
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-rule bg-paper-2 p-6 text-center">
          <p className="text-sm font-semibold text-ink">لا توجد مواد</p>
          <p className="mt-1 text-xs text-ink-soft">تأكد من اكتمال بيانات التخصص والفصل</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="مواد التخصص" className="sheet-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[1.02rem] font-semibold text-ink">مواد التخصص</h2>
        <div className="flex items-center gap-2">
          {departmentName && <span className="tag bg-sky-50 border-sky-200 text-sky-900">{departmentName}</span>}
          <span className="mono text-[11px] text-ink-soft">{subjects.length} مواد</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-soft">اختر مادة لبدء المذاكرة الجامعية</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect?.(s.name)}
            aria-label={`افتح ${s.name}`}
            className="group flex flex-col gap-2.5 rounded-xl border border-rule bg-white p-4 text-right hover:border-ink/15 hover:shadow-sm active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
          >
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white text-sm font-bold">
              {iconFor(s.name)}
            </span>
            <span className="font-display font-semibold text-[13px] leading-5 text-ink">{s.name}</span>
            {s.code && <span className="mono text-[11px] text-ink-soft">{s.code}</span>}
            <span className="mono text-[11px] text-ink-soft group-hover:text-ink">دراسة →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
