/**
 * أساس المخرجات المنظمة: استخراج JSON من ردود الموديلات والتحقق منها
 * قبل ما توصل لكود التطبيق. الوكلاء المستقبلية (كويزات، خرائط ذهنية،
 * خطط مذاكرة، فلاش كاردز) كلها هتبني على الدوال دي.
 *
 * القاعدة: أي JSON جاي من موديل = بيانات غير موثوقة لحد ما يعدّي validator.
 */

/** يستخرج أول كائن/مصفوفة JSON من نص الموديل حتى لو محاط بنص أو ```json fences. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // ١) المحاولة المباشرة.
  try {
    return JSON.parse(trimmed);
  } catch {
    // نكمل بالطرق الأخرى.
  }

  // ٢) داخل code fence: ```json ...``` أو ``` ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // نكمل.
    }
  }

  // ٣) أول {…} أو […] متوازن في النص (بيدغدغ الـ nesting والـ strings الصح).
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = trimmed.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (inString) {
        if (escaped) escaped = false; // الحرف الحالي مهرَّب — تجاهله
        else if (char === "\\") escaped = true; // بداية تهريب
        else if (char === '"') inString = false; // إغلاق الـ string
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth++;
      else if (char === close && --depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          break; // الجسم ده مش JSON صالح — نوقف البحث عن هذا الشكل.
        }
      }
    }
  }

  throw new AiStructuredOutputError("No valid JSON found in model response");
}

export class AiStructuredOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiStructuredOutputError";
  }
}

/** وصف بسيط لمُحقِّق (validator): دالة ترجّع القيمة المصحّحة أو ترمي. */
export type Validator<T> = (value: unknown) => T;

/** يشغّل validator على قيمة مستخرجة ويرجّع نتيجة بدل الرمي. */
export function validateStructured<T>(
  textOrValue: string | unknown,
  validate: Validator<T>
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const value = typeof textOrValue === "string" ? extractJson(textOrValue) : textOrValue;
    return { ok: true, value: validate(value) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown validation failure",
    };
  }
}

/* ------------------------------------------------------------------ */
/* أدوات تحقق صغيرة (بدون مكتبات خارجية)                              */
/* ------------------------------------------------------------------ */

export function expectObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AiStructuredOutputError("Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

export function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new AiStructuredOutputError("Expected a JSON array");
  return value;
}

export function expectString(value: unknown, field = "value"): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AiStructuredOutputError(`Expected "${field}" to be a non-empty string`);
  }
  return value.trim();
}

export function expectNumber(value: unknown, field = "value"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AiStructuredOutputError(`Expected "${field}" to be a finite number`);
  }
  return value;
}

export function optionalString(value: Record<string, unknown>, field: string, max = 2000): string | undefined {
  const raw = value[field];
  return typeof raw === "string" ? raw.slice(0, max) : undefined;
}

/** يرفض أي شيء غير معروف بدل تجاهله — الفشل المبكر أفضل من بيانات مشوّهة. */
export function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  context = "object"
): void {
  const known = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      throw new AiStructuredOutputError(`Unexpected key "${key}" in ${context}`);
    }
  }
}
