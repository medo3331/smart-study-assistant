export const PLAN_PRICES: Record<string, { monthly: number | null; currency: string; label?: string }> = {
  free: { monthly: 0, currency: "USD", label: "مجاني" },
  pro: { monthly: 9.99, currency: "USD" },
  ultra: { monthly: 19.99, currency: "USD" },
};

export function formatPlanPrice(planKey: string): string {
  const p = PLAN_PRICES[planKey];
  if (!p) return "—";
  if (p.label) return p.label;
  if (p.monthly === null) return "—";
  return `${p.monthly.toFixed(2)} ${p.currency}/شهر`;
}
