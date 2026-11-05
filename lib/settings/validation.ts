/**
 * تحقّق إعدادات المنصة — منطق نقي (بلا Supabase وبلا Next).
 *
 * يُستخدم في السيرفر داخل `site-settings-manage.ts` قبل أي كتابة،
 * وفي الاختبارات مباشرة.
 */

export const ALLOWED_CURRENCIES = ["EGP"] as const;
export const TEMPLATE_PLACEHOLDERS = ["name", "mag_code", "plan_name", "price"] as const;

export const MAX_TEMPLATE_LENGTH = 500;
export const MAX_DURATIONS = 6;

export type SiteSettingsInput = {
  whatsappNumber: string;
  whatsappTemplate: string;
  defaultCurrency: string;
  /** مدخلات الأدمن: "30,90,365" أو JSON قديم "[30, 90, 365]". */
  subscriptionDurations: string;
};

export type SiteSettingsNormalized = {
  whatsapp_number: string;
  whatsapp_template: string;
  default_currency: string;
  /** تُخزَّن بصيغة JSON array — نفس صيغة الصفوف الموجودة. */
  subscription_durations: string;
};

export type SiteSettingsValidation =
  | { ok: true; normalized: SiteSettingsNormalized }
  | { ok: false; errors: string[] };

/** رقم واتساب مصري بصيغة دولية: +20 ثم 10 أرقام. */
export function validateWhatsappNumber(value: string): boolean {
  return typeof value === "string" && /^\+20\d{10}$/.test(value.trim());
}

/** يحوّل "30,90" أو "[30, 90]" إلى أعداد صحيحة موجبة مرتّبة بلا تكرار. */
export function parseDurations(
  raw: string
): { ok: true; days: number[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "المدد مطلوبة (مثال: 30,90,365)" };
  }
  const trimmed = raw.trim();

  let parts: string[];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return { ok: false, error: "صيغة المدد غير صالحة" };
      parts = parsed.map((value) => String(value).trim());
    } catch {
      return { ok: false, error: "JSON المدد غير صالح" };
    }
  } else {
    parts = trimmed.split(",").map((part) => part.trim());
  }

  const days: number[] = [];
  for (const part of parts) {
    if (part === "") continue;
    if (!/^\d+$/.test(part)) {
      return { ok: false, error: `مدة غير رقمية: "${part}"` };
    }
    const value = Number(part);
    if (!Number.isSafeInteger(value) || value <= 0) {
      return { ok: false, error: `المدة لازم تكون عددًا صحيحًا > 0 (وجدنا ${part})` };
    }
    days.push(value);
  }

  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  if (unique.length === 0) return { ok: false, error: "لازم مدة واحدة على الأقل" };
  if (unique.length > MAX_DURATIONS) {
    return { ok: false, error: `أقصى عدد مدد ${MAX_DURATIONS}` };
  }
  return { ok: true, days: unique };
}

/** يستخرج كل الـ placeholders المستخدمة في القالب. */
export function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{([a-z_]+)\}/g)) found.add(match[1]);
  return Array.from(found);
}

/**
 * يتحقق من كل الإعدادات ويعيد القيم **المطبّعة** جاهزة للكتابة.
 * يعيد كل الأخطاء مجتمعة (لا يتوقف عند الأول).
 */
export function validateSiteSettings(input: SiteSettingsInput): SiteSettingsValidation {
  const errors: string[] = [];

  const whatsapp = typeof input?.whatsappNumber === "string" ? input.whatsappNumber.trim() : "";
  if (!validateWhatsappNumber(whatsapp)) {
    errors.push("whatsapp_number: الصيغة المطلوبة +20 متبوعة بـ10 أرقام");
  }

  const template = typeof input?.whatsappTemplate === "string" ? input.whatsappTemplate.trim() : "";
  if (template === "") {
    errors.push("whatsapp_template: مطلوب");
  } else if (template.length > MAX_TEMPLATE_LENGTH) {
    errors.push(`whatsapp_template: أقصى ${MAX_TEMPLATE_LENGTH} حرفًا`);
  } else {
    const unknown = extractPlaceholders(template).filter(
      (name) => !(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name)
    );
    if (unknown.length > 0) {
      errors.push(
        `whatsapp_template: متغيّرات غير معروفة (${unknown.join(", ")}) — المسموح: ${TEMPLATE_PLACEHOLDERS.join(", ")}`
      );
    }
  }

  const currency = typeof input?.defaultCurrency === "string" ? input.defaultCurrency.trim().toUpperCase() : "";
  if (!(ALLOWED_CURRENCIES as readonly string[]).includes(currency)) {
    errors.push(`default_currency: العملات المسموحة حاليًا: ${ALLOWED_CURRENCIES.join(", ")}`);
  }

  const durations = parseDurations(input?.subscriptionDurations ?? "");

  if (errors.length > 0 || !durations.ok) {
    if (!durations.ok) errors.push(`subscription_durations: ${durations.error}`);
    return { ok: false, errors };
  }

  return {
    ok: true,
    normalized: {
      whatsapp_number: whatsapp,
      whatsapp_template: template,
      default_currency: currency,
      subscription_durations: JSON.stringify(durations.days),
    },
  };
}

/** يستبدل المتغيّرات في القالب — تُستخدم في المعاينة الحيّة بالـ UI. */
export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole
  );
}
