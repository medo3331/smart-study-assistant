/* ==========================================================================
   🏷️ ليبلات مراجع العرض — وحدة مستقلة (آمنة للـ client)
   ============================================================================

   ⚠️ **ليه الملف ده منفصل؟**: `slides-generator.tsx` بيستورد
   `lib/lectures/pdf-font.ts` (اللي بيقرأ خطوط من `node:fs`) ⇒ **أي
   client component يستورده بيـ break**:
   ```
   the chunking context does not support external modules (request: node:fs)
   ```
   ⇒ الليبلات (دوال نضيفة، مافيش اعتماديات) في ملف لوحدها، والـ
   generator بيستورد منها.

   ⚠️ **`DeckSlides` (client component)** بيستورد `unitLabel` من هنا.
   ========================================================================== */

import type { DeckSlide, DeckState } from "./slides";

/** نوع الوحدة — بيحدّد الليبل المعروض. */
export type DeckUnit = DeckState["source"]["unit"];

/**
 * ⚠️ **الليبل بتاع الوحدة** — بيختلف حسب نوع الملف:
 *   PDF  → «صفحة ٤»
 *   PPTX → «شريحة ٤»
 *   DOCX → «الفقرة ٤»
 *
 * (قرار: DOCX مالوش صفحات — الـ page count ناتج rendering مش data.)
 *
 * ⚠️ **المحاضرات**: الوحدة = **مقطع** والليبل = **«دقيقة 12:30»** —
 *    وده بييجي من `bullet.label` (مش محسوب من الرقم). فالوظيفة دي
 *    بتستخدمها بس لما مافيش ليبل صريح.
 */
export function unitLabel(unit: DeckUnit, n: number): string {
  if (unit === "slide") return `شريحة ${n}`;
  if (unit === "paragraph") return `الفقرة ${n}`;
  if (unit === "segment") return `مقطع ${n}`;
  return `صفحة ${n}`;
}

/**
 * شارة المصدر لسلايد واحد: «صفحة ٤» أو «صفحتا ٤ و ٧».
 *
 * ⚠️ **الليبل الصريح (`bullet.label`) له الأولوية** — ده بيتعامل مع
 *    المحاضرات («دقيقة 12:30»). ولو مافيش ⇒ بنحسبه من `unit`.
 */
export function sourceBadge(slide: DeckSlide, unit: DeckUnit): string {
  // ⚠️ بنجمع **الليبلات** (مش الأرقام) — عشان كل مرجع يطلع
  //    بالليبل بتاعه (توقيت للمحاضرات، رقم صفحة للمستندات).
  const labels = Array.from(
    new Set(
      slide.bullets
        .filter((bullet) => bullet.page !== null)
        .map((bullet) => bullet.label ?? unitLabel(unit, bullet.page as number)),
    ),
  );
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} و ${labels[labels.length - 1]}`;
}
