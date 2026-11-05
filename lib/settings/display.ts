/**
 * تطبيع قيم `site_settings` إلى نص قبل العرض.
 *
 * ⚠️ السبب: العمود `value` نصّي في المخطط، لكن أي تغيير مستقبلي (jsonb)
 * أو صفّ قديم بصيغة مختلفة يجعل القيمة كائنًا/مصفوفة. تمرير كائن إلى
 * React child يرمي **React error #31** ويُسقط الصفحة بالكامل — لذا كل قيمة
 * تمرّ من هنا قبل أن تصل إلى أي JSX أو input.
 */

/** أي قيمة → نص آمن للعرض. */
export function toDisplayString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => toDisplayString(item)).join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

/**
 * قيمة `subscription_durations` → صيغة الإدخال "30,90,365".
 * تقبل: نص بفواصل، JSON array نصّي، مصفوفة فعلية، أو كائن.
 */
export function durationsToInput(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => toDisplayString(item)).join(",");
  }
  const raw = toDisplayString(value).trim();
  if (raw === "") return "";
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => toDisplayString(item)).join(",");
      }
    } catch {
      return raw;
    }
  }
  return raw;
}
