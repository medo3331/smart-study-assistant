"use client";

import Link from "next/link";

const ACTIONS = [
  { id: "study", label: "ذاكر درس", sub: "ابدأ شرح صغير", icon: "📖", href: "/dashboard", tone: "bg-emerald-50 border-emerald-200" },
  { id: "quiz", label: "حل أسئلة", sub: "سؤالين بسرعة", icon: "✏️", href: "/exams", tone: "bg-amber-50 border-amber-200" },
  { id: "plan", label: "خطتي", sub: "شوف يومك", icon: "🗓️", href: "/dashboard/planner", tone: "bg-sky-50 border-sky-200" },
  { id: "quran", label: "وردي", sub: "قرآن وأذكار", icon: "🕌", href: "/worship", tone: "bg-violet-50 border-violet-200" },
] as const;

export function PrimaryQuickActions() {
  return (
    <section aria-label="اختصارات سريعة" className="sheet-card p-5 sm:p-6">
      <h2 className="font-display text-[1.05rem] font-bold text-ink">نعمل إيه بسرعة؟ ⚡</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className={`group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center hover:shadow-[0_4px_12px_var(--shade)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${a.tone}`}
          >
            <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-paper-2 border border-rule text-xl shadow-sm">
              {a.icon}
            </span>
            <span className="font-bold text-sm text-ink">{a.label}</span>
            <span className="mono text-[11px] text-ink-soft">{a.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
