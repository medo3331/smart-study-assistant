// lib/lesson/explanations.ts
//
// 📖 محرك الشرح — P2 (AI Teaching Engine).
//
// أوضاع الشرح الثلاثة المعتمدة من المستخدم (بديل خطة المستويات الخمسة §3.2):
//   general  — شرح عام: فهم أساسي مختصر.
//   summary  — شرح تلخيصي: أهم النقاط للمراجعة.
//   detailed — شرح تفصيلي: شرح كامل بعمق.
//
// التخزين: مفاتيح نصية جوّه `lesson_content.explanation` (jsonb — بدون
// migration) بجانب الأوضاع القديمة (simple/academic/visual/practical).
// إعادة التوليد بتحفظ **إصدار جديد**: النص القديم بيتنفد لقائمة إصدارات
// تحت المفتاح `<mode>__versions` (مصفوفة objects — readStoredContent
// بيتجاهلها لأنها مش strings) — القديمة مش بتتمسح.

export const EXPLANATION_MODES = ["general", "summary", "detailed"] as const;
export type ExplanationMode = (typeof EXPLANATION_MODES)[number];

export function isExplanationMode(value: unknown): value is ExplanationMode {
  return typeof value === "string" && (EXPLANATION_MODES as readonly string[]).includes(value);
}

/** الاسم العربي للوضع — للـ UI وسياق الـ Tutor. */
export const EXPLANATION_MODE_LABELS: Record<ExplanationMode, string> = {
  general: "شرح عام",
  summary: "شرح تلخيصي",
  detailed: "شرح تفصيلي",
};

/** مفتاح قائمة الإصدارات لكل وضع جوّه `explanation` jsonb. */
export function explanationVersionsKey(mode: ExplanationMode): string {
  return `${mode}__versions`;
}

export type ExplanationVersion = {
  text: string;
  generatedAt: string;
  model: string | null;
};

/** أقصى عدد إصدارات قديمة محفوظة لكل وضع — الأقدم بيتشال (الحد ده مقصود صغير). */
export const MAX_EXPLANATION_VERSIONS = 5;

export type ExplanationVersionResult = {
  /** الأوضاع بعد التحديث — النص الجديد في `[mode]` والإصدارات في `<mode>__versions`. */
  modes: Record<string, unknown>;
  /** النص القديم اللي اتنفد (null لو مفيش). */
  replaced: ExplanationVersion | null;
  /** رقم الإصدار الجديد (١ = أول صياغة). */
  version: number;
};

/**
 * withExplanationVersion — دمج صياغة جديدة لوضع من الأوضاع الثلاثة.
 * النص الجديد بياخد المفتاح الأساسي، والقديم (لو موجود) بيتنفد أول القائمة.
 * الدالة نقية — بتتاخد بالنسخ مش بالتعديل في مكانها.
 */
export function withExplanationVersion(
  stored: Record<string, unknown>,
  mode: ExplanationMode,
  newText: string,
  meta: { generatedAt: string; model?: string | null }
): ExplanationVersionResult {
  const versionsKey = explanationVersionsKey(mode);
  const previousText = typeof stored[mode] === "string" && (stored[mode] as string).trim() ? (stored[mode] as string) : null;
  const existingVersions = readExplanationVersions(stored, mode);

  const replaced = previousText
    ? { text: previousText, generatedAt: meta.generatedAt, model: meta.model ?? null }
    : null;
  const nextVersions = replaced ? [replaced, ...existingVersions].slice(0, MAX_EXPLANATION_VERSIONS) : existingVersions;

  return {
    modes: { ...stored, [mode]: newText, [versionsKey]: nextVersions },
    replaced,
    version: existingVersions.length + (previousText ? 2 : 1),
  };
}

/** قراءة إصدارات وضع معيّن — best-effort: أي شكل تالف ⇒ []. */
export function readExplanationVersions(stored: Record<string, unknown> | null | undefined, mode: ExplanationMode): ExplanationVersion[] {
  if (!stored) return [];
  const raw = stored[explanationVersionsKey(mode)];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is ExplanationVersion =>
      Boolean(v) && typeof v === "object" && typeof (v as ExplanationVersion).text === "string" && (v as ExplanationVersion).text.trim().length > 0
    )
    .map((v) => ({
      text: v.text,
      generatedAt: typeof v.generatedAt === "string" ? v.generatedAt : "",
      model: typeof v.model === "string" ? v.model : null,
    }));
}

/** جمع كل قوائم الإصدارات من الصف المخزّن — لرد GET (مفاتيحها مش modes عادية). */
export function collectExplanationVersions(stored: Record<string, unknown> | null | undefined): Partial<Record<ExplanationMode, ExplanationVersion[]>> {
  const out: Partial<Record<ExplanationMode, ExplanationVersion[]>> = {};
  if (!stored) return out;
  for (const mode of EXPLANATION_MODES) {
    const versions = readExplanationVersions(stored, mode);
    if (versions.length > 0) out[mode] = versions;
  }
  return out;
}
