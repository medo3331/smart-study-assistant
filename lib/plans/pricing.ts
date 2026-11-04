// الأسعار بالجنيه المصري (EGP) — مطابقة لـ db/27-subscription-plans-egp.sql.
export const PLAN_PRICES: Record<string, { monthly: number | null; currency: string; label?: string }> = {
  free: { monthly: 0, currency: "EGP", label: "مجاني" },
  pro: { monthly: 199, currency: "EGP" },
  ultra: { monthly: 399, currency: "EGP" },
};

export function formatPlanPrice(planKey: string): string {
  const p = PLAN_PRICES[planKey];
  if (!p) return "—";
  if (p.label) return p.label;
  if (p.monthly === null) return "—";
  return `${p.monthly.toFixed(2)} ${p.currency}/شهر`;
}
