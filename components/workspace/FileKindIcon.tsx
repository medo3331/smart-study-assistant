/* ==========================================================================
   📄 كارت ملف المستند —Workspace
   ============================================================================

   ⚠️ **ليه مش الإيموجي؟**: الإيموجي (📕) بيبان رخيص وبيInvoke
   inconsistency. SVG per type + مربع ملوّن بيبان مصمَّم.

   ⚠️ **الكعب (inline-start) = الحالة**:
   - أخضر (جاهز) · أصفر (partial — في صفحات متقراش) · أحمر (فشل).

   ⚠️ **المعاينة**: `documents.thumbnail` (data URL) — بتتولّد وقت الرفع
   بـ `unpdf.renderPageAsImage`. **اختيارية**: من غيرها الكارت بيشتغل
   عادي (أيقونة النوع بدلها).
   ========================================================================== */

import { FileText, FileType, Presentation } from "lucide-react";

/** نوع الملف — بيحدّد الأيقونة واللون. */
export type FileKindUi = "pdf" | "pptx" | "docx" | "image" | "text";

/**
 * ⭐ **نوع الملف** — بيحدّد الأيقونة واللون والوحدة.
 *
 * ⚠️ **بيستنتج من الامتداد كمان** مش من الـ MIME بس — عشان المتصفح
 *    بيبعت أنواع تانية أحياناً (والمخزن في القاعدة ممكن يكون فاضي).
 */
export function fileKindFor(
  fileType: string | null,
  title: string,
): FileKindUi {
  const name = title.toLowerCase();
  if (fileType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    fileType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  ) {
    return "pptx";
  }
  if (
    fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (fileType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) {
    return "image";
  }
  return "text";
}

/** ⭐ **الأيقونة** — SVG مش إيموجي. */
export function FileKindIcon({
  kind,
  size = 18,
}: {
  kind: FileKindUi;
  size?: number;
}) {
  if (kind === "pdf") return <FileText size={size} aria-hidden />;
  if (kind === "pptx") return <Presentation size={size} aria-hidden />;
  if (kind === "docx") return <FileType size={size} aria-hidden />;
  return <FileText size={size} aria-hidden />;
}

/**
 * ⭐ **لون النوع** — كل نوع لون (من التوكنز).
 *
 * ⚠️ ألوان دلالية مش عشوائية: PDF أزرق (المستند)، PPTX بنفسجي
 * (العرض)، DOCX أخضر (المستند القابل للتعديل).
 */
export function fileKindTint(kind: FileKindUi): string {
  if (kind === "pdf") return "var(--hl-blue-fill)";
  if (kind === "pptx") return "var(--hl-purple-fill)";
  if (kind === "docx") return "var(--hl-green-fill)";
  return "var(--rule-strong)";
}

/** ⭐ **كعب الحالة** — لونه بيقول حالة الملف في لمحة. */
export function statusSpine(status: "ready" | "partial" | "failed"): string {
  if (status === "failed") return "var(--hl-red-fill)";
  if (status === "partial") return "var(--hl-yellow-fill)";
  return "var(--hl-green-fill)";
}

/** ⭐ **كعب PDF/PPTX/DOCX** — نفس فكرة `.sheet-card` (هامش أحمر). */
export function fileKindSpine(kind: FileKindUi): string {
  if (kind === "pdf") return "var(--hl-blue-fill)";
  if (kind === "pptx") return "var(--hl-purple-fill)";
  if (kind === "docx") return "var(--hl-green-fill)";
  return "color-mix(in srgb, var(--redpen) 55%, transparent)";
}
