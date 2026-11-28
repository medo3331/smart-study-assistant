// lib/lesson/cited-derive.ts
//
// 📖 اشتقاق نصي من الشرح المبني على التفريغ — P2 (الأوضاع الثلاثة فوق التفريغ).
//
// لما الدرس مربوط بمحاضرة عندها تفريغ، التفريغ (cited_explanation) بيبقى
// **المصدر الأساسي** — والأوضاع الثلاثة بتشتغل فوقه:
//   • summary (تلخيصي): derivation نصي **بدون AI** من الشرح الم citied —
//     نفس المعلومات، صياغة مراجعة سريعة (bullets).
//   • general / detailed: توليد AI محكم بالاقتباس فوق نفس التفريغ
//     (في route.ts — بنفس عقود parseCitedExplanation).
//
// الملف نقّي (pure) — قابل للاختبار مباشرة بـ vitest.

import type { LessonCitedExplanation } from "@/lib/lesson/citations";

/** أقصى نقاط لكل قسم في الاشتقاق التلخيصي — الهدف مراجعة سريعة مش نسخة كاملة. */
export const MAX_SUMMARY_BULLETS_PER_SECTION = 4;

/** أقصى حروف للنقطة المشتقة — الجمل المتطوّلة بتتقلّم. */
const MAX_BULLET_CHARS = 220;

/** استخراج نص الشرح من cited explanation — للعرض المبسّط وللمعاينة. */
export function citedToText(cited: LessonCitedExplanation): string {
  if (!cited || !Array.isArray(cited.sections)) return "";
  const lines: string[] = [];
  for (const section of cited.sections) {
    if (!section || !Array.isArray(section.claims) || section.claims.length === 0) continue;
    if (section.heading) lines.push(`## ${section.heading}`);
    for (const claim of section.claims) {
      const text = typeof claim?.text === "string" ? claim.text.trim() : "";
      if (text) lines.push(`- ${text}`);
    }
  }
  return lines.join("\n");
}

/**
 * deriveSummaryFromCited — الشرح التلخيصي مشتق نصيًا من الشرح الم citied
 * (بدون AI): أهم النقاط من كل قسم في bullets مركزة.
 * الاشتقاق deterministic — نفس المدخل بيعطي نفس النص دايمًا.
 */
export function deriveSummaryFromCited(cited: LessonCitedExplanation): string {
  if (!cited || !Array.isArray(cited.sections)) return "";
  const lines: string[] = [];
  for (const section of cited.sections) {
    if (!section || !Array.isArray(section.claims)) continue;
    const bullets = section.claims
      .map((claim) => (typeof claim?.text === "string" ? claim.text.trim() : ""))
      .filter(Boolean)
      .slice(0, MAX_SUMMARY_BULLETS_PER_SECTION)
      .map((text) => `- ${text.length > MAX_BULLET_CHARS ? `${text.slice(0, MAX_BULLET_CHARS)}…` : text}`);
    if (bullets.length === 0) continue;
    if (section.heading) lines.push(`## ${section.heading}`);
    lines.push(...bullets);
  }
  return lines.join("\n");
}

/* ═════════════════ إصدارات الأوضاع الم citied (general/detailed) ═════════════════ */

/** إصدار مخزَّن لوضع citied — الشرح القديم كائن + وقت التوليد. */
export type StoredCitedVersion = { cited: LessonCitedExplanation; generatedAt: string };

/** مفتاح الشرح الم citied لوضع معيّن جوّه `explanation` jsonb. */
export function citedModeKey(mode: "general" | "detailed"): string {
  return `${mode}__cited`;
}

/** مفتاح قائمة إصدارات الشرح الم citied. */
export function citedVersionsKey(mode: "general" | "detailed"): string {
  return `${mode}__cited__versions`;
}

/** قراءة الشرح الم citied المخزَّن لوضع — best-effort: أي شكل تالف ⇒ null. */
export function readCitedMode(
  stored: Record<string, unknown> | null | undefined,
  mode: "general" | "detailed"
): LessonCitedExplanation | null {
  if (!stored) return null;
  const raw = stored[citedModeKey(mode)];
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Array.isArray((raw as { sections?: unknown }).sections)
  ) {
    return raw as LessonCitedExplanation;
  }
  return null;
}

/** قراءة إصدارات وضع citied المخزَّنة — best-effort ⇒ []. */
export function readCitedVersions(
  stored: Record<string, unknown> | null | undefined,
  mode: "general" | "detailed"
): StoredCitedVersion[] {
  if (!stored) return [];
  const raw = stored[citedVersionsKey(mode)];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is StoredCitedVersion =>
      Boolean(v) &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      v.cited !== null &&
      typeof v.cited === "object" &&
      Array.isArray((v.cited as { sections?: unknown }).sections)
  );
}

/** جمع إصدارات الأوضاع الم citied كلها من الصف المخزّن — لرد GET. */
export function collectCitedVersions(
  stored: Record<string, unknown> | null | undefined
): Partial<Record<"general" | "detailed", StoredCitedVersion[]>> {
  const out: Partial<Record<"general" | "detailed", StoredCitedVersion[]>> = {};
  for (const mode of ["general", "detailed"] as const) {
    const versions = readCitedVersions(stored, mode);
    if (versions.length > 0) out[mode] = versions;
  }
  return out;
}
