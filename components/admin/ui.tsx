import type { ReactNode } from "react";

/**
 * 🎨 مجموعة مكوّنات لوحة الأدمن (نواة الـ design system الموحّد).
 * كل صفحات /admin/* بتستخدم دي عشان الشكل يبقى واحد — بدل ما كل صفحة
 * تكرر نفس الـ classes. مفيش أي بيانات وهمية جوه أي مكوّن هنا.
 */

export type AdminTone = "default" | "amber" | "emerald" | "rose" | "purple" | "blue";

const TONE_TEXT: Record<AdminTone, string> = {
  default: "text-slate-200",
  amber: "text-amber-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  purple: "text-purple-300",
  blue: "text-blue-300",
};

const TONE_BORDER: Record<AdminTone, string> = {
  default: "border-slate-800",
  amber: "border-amber-500/30",
  emerald: "border-emerald-500/30",
  rose: "border-rose-500/30",
  purple: "border-purple-500/30",
  blue: "border-blue-500/30",
};

const TONE_BG: Record<AdminTone, string> = {
  default: "bg-slate-900/80",
  amber: "bg-amber-500/5",
  emerald: "bg-emerald-500/5",
  rose: "bg-rose-500/5",
  purple: "bg-purple-500/5",
  blue: "bg-blue-500/5",
};

/** ترويسة موحّدة لكل صفحة أدمن. */
export function AdminPageHeader({
  title,
  subtitle,
  badge,
  permissionKey,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  permissionKey?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex flex-wrap items-center gap-2">{title}</h1>
        {subtitle ? <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {badge ? (
          <span className="text-[11px] bg-amber-500/10 text-amber-300 px-2 py-1 rounded whitespace-nowrap">{badge}</span>
        ) : null}
        {permissionKey ? (
          <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-1 rounded font-mono whitespace-nowrap" dir="ltr">
            {permissionKey}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** كارت قسم. */
export function AdminCard({
  title,
  description,
  tone = "default",
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  tone?: AdminTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${TONE_BG[tone]} border ${TONE_BORDER[tone]} rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 ${className}`}>
      {title ? (
        <div>
          <h2 className={`text-base sm:text-lg font-bold ${TONE_TEXT[tone]}`}>{title}</h2>
          {description ? <p className="text-[11px] sm:text-xs text-slate-400 mt-1 leading-relaxed">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** رقم إحصائي — القيمة دايمًا جاية من برّه (لو مش متاحة اكتب "N/A"). */
export function AdminStatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: AdminTone;
}) {
  return (
    <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 sm:p-4 min-w-0">
      <p className="text-[11px] text-slate-400 mb-1">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold break-words ${TONE_TEXT[tone]}`}>{value}</p>
      {hint ? <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{hint}</p> : null}
    </div>
  );
}

/** تنبيه/ملاحظة. */
export function AdminNotice({ tone = "default", title, children }: { tone?: AdminTone; title?: string; children: ReactNode }) {
  const text =
    tone === "rose" ? "text-rose-300" : tone === "emerald" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : "text-slate-300";
  return (
    <div className={`${TONE_BG[tone]} border ${TONE_BORDER[tone]} rounded-xl p-3 text-[11px] sm:text-xs leading-relaxed ${text}`}>
      {title ? <p className="font-bold mb-1">{title}</p> : null}
      {children}
    </div>
  );
}

/** غلاف جدول — بيمنع أي overflow مخفي وبيسمح بالسكرول الأفقي على الموبايل. */
export function AdminTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-x-auto">
      <table className="w-full text-[11px] sm:text-xs text-right min-w-[640px]">{children}</table>
    </div>
  );
}

/**
 * هيكل أساسي (skeleton حقيقي) للأقسام اللي لسه ما اتنفذتش.
 * ⚠️ مفيش أي mock بيانات هنا — بنقول صراحة إيه الناقص ومحتاج إيه.
 */
export function AdminSkeleton({
  title,
  items,
  deferredTo,
}: {
  title: string;
  items: { label: string; detail: string }[];
  deferredTo: string;
}) {
  return (
    <AdminCard tone="amber" title={`${title} — هيكل أساسي فقط (Skeleton)`} description={`مفيش بيانات وهمية هنا. التنفيذ الفعلي مؤجّل إلى: ${deferredTo}.`}>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((it) => (
          <li key={it.label} className="bg-slate-950/40 border border-dashed border-slate-700 rounded-xl p-3">
            <p className="text-xs font-bold text-slate-300">{it.label}</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{it.detail}</p>
          </li>
        ))}
      </ul>
    </AdminCard>
  );
}
