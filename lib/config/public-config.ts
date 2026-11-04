/**
 * إعدادات المنصة العامة — منطق نقي (قابل للاختبار بلا شبكة ولا DB).
 *
 * ⚠️ مبدأ: هذا الـ endpoint يعيد **بيانات عامة فقط** (رقم الدعم، القالب،
 * العملة، المدد، وأسعار الباقات المعلنة). لا يمرّر أي شيء خاص بمستخدم.
 */

export const PUBLIC_CONFIG_KEYS = [
  "whatsapp_number",
  "whatsapp_template",
  "payment_methods",
  "subscription_durations",
  "default_currency",
] as const;

export type PublicConfigKey = (typeof PUBLIC_CONFIG_KEYS)[number];
export type PublicConfig = Partial<Record<PublicConfigKey, string>>;

export type PublicPlan = {
  plan_key: string;
  display_name_ar: string | null;
  price: number | string | null;
  currency: string | null;
};

/** صفوف site_settings → كائن مفاتيح عامة فقط (أي مفتاح آخر يُهمَل). */
export function buildPublicConfig(
  rows: Array<{ key?: unknown; value?: unknown }> | null | undefined
): PublicConfig {
  const out: PublicConfig = {};
  for (const row of rows ?? []) {
    const key = typeof row?.key === "string" ? row.key : "";
    if (!(PUBLIC_CONFIG_KEYS as readonly string[]).includes(key)) continue;
    const value = row?.value;
    out[key as PublicConfigKey] =
      typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  }
  return out;
}

/** صفوف subscription_plans → قائمة أسعار معلنة فقط. */
export function buildPublicPlans(
  rows: Array<Record<string, unknown>> | null | undefined
): PublicPlan[] {
  return (rows ?? [])
    .filter((row) => typeof row?.plan_key === "string" && row.plan_key)
    .map((row) => ({
      plan_key: String(row.plan_key),
      display_name_ar: typeof row.display_name_ar === "string" ? row.display_name_ar : null,
      price: (row.price as number | string | null) ?? null,
      currency: typeof row.currency === "string" ? row.currency : null,
    }));
}

export type UpgradeTarget = { targetKey: "pro" | "ultra"; label: string };

/**
 * الباقة التالية للترقية. free → pro، pro → ultra، ultra → لا شيء.
 * `premium` (ميراث) تُعامَل كـ pro حتى يُنظّف الترحيل.
 */
export function nextUpgrade(plan: string | null | undefined): UpgradeTarget | null {
  const key = (plan ?? "").trim().toLowerCase();
  if (key === "free" || key === "") return { targetKey: "pro", label: "ترقية إلى Pro" };
  if (key === "pro" || key === "premium") return { targetKey: "ultra", label: "ترقية إلى Ultra" };
  return null;
}

/** يجد سعر الباقة المطلوبة داخل القائمة المعلنة. */
export function findPlanPrice(
  plans: PublicPlan[] | null | undefined,
  planKey: string
): { price: string; currency: string } | null {
  const plan = (plans ?? []).find((item) => item.plan_key === planKey);
  if (!plan || plan.price == null || plan.price === "") return null;
  return {
    price: String(plan.price),
    currency: plan.currency ?? "",
  };
}

export type WhatsappVars = {
  name?: string;
  mag_code?: string;
  plan_name?: string;
  price?: string;
};

/** يبني نص الرسالة من القالب مع استبدال المتغيّرات وتنظيف المسافات الزائدة. */
export function buildWhatsappMessage(
  template: string | null | undefined,
  vars: WhatsappVars
): string {
  const fallback = "أنا {name}، كود {mag_code}، عايز أشترك في {plan_name}";
  const tpl = (template ?? "").trim() || fallback;
  const replaced = tpl.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return typeof value === "string" ? value : whole;
  });
  return replaced.replace(/\s{2,}/g, " ").trim();
}

/**
 * رابط واتساب جاهز. يعيد null لو الرقم غير موجود/غير صالح
 * (فالواجهة تُخفي الزر بدل رابط مكسور).
 */
export function buildWhatsappHref(input: {
  whatsappNumber?: string | null;
  template?: string | null;
  vars?: WhatsappVars;
}): string | null {
  const rawNumber = (input.whatsappNumber ?? "").trim();
  const digits = rawNumber.replace(/[^\d]/g, "");
  if (digits.length < 8) return null; // بلا رقم حقيقي → لا زر
  const message = buildWhatsappMessage(input.template, input.vars ?? {});
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
