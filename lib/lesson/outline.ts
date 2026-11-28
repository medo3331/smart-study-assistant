// lib/lesson/outline.ts
//
// 🗺️ استخراج أقسام الدرس (outline) — مصدر StudyNavigator.
//
// مصدران محتملان لأقسام الدرس (P1):
//   ١) الشرح المبني على التفريغ: `cited_explanation.sections[].heading`
//   ٢) الشرح العادي بأوضاعه الأربعة: عناوين `##` جوّه markdown كل وضع
//
// الدالة بتشتغل على الشكلين وبتزوّق معرّف ثابت لكل قسم (نفس الـ slug
// بيتحسب من العنوان) عشان الروابط/الـ scroll/resume تستخدمه.

/** أقسام الشرح المبني على التفريغ — نفس شكل lib/lesson/citations.ts (بدون نسخ النوع كله). */
export type OutlineCitedInput = {
  sections?: { heading?: unknown }[] | null;
};

export type OutlineSection = {
  /** معرّف ثابت مشتق من العنوان — يستخدم في الـ anchor و resume. */
  id: string;
  heading: string;
  /** مصدر القسم — للتتبع فقط. */
  source: "cited" | "markdown";
  /** توقيت الفيديو (ثوانٍ) من محاذاة التفريغ (P3) — null = مفيش محاذاة موثوقة. */
  videoT?: number | null;
};

/** slug عربي-آمن: أرقام وحروف (أي لغة) وشرطات — ثابت لنفس العنوان. */
export function outlineSectionId(heading: string, index: number): string {
  const slug = heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `sec-${index}-${slug || "section"}`;
}

/** استخراج العناوين `##` من markdown الأوضاع (أول وضع فيه عناوين يكسب). */
export function extractMarkdownHeadings(markdown: string | null | undefined): string[] {
  if (!markdown || typeof markdown !== "string") return [];
  const headings: string[] = [];
  for (const rawLine of markdown.split("\n")) {
    const match = rawLine.match(/^##\s+(.+?)\s*$/);
    if (match) headings.push(match[1]);
  }
  return headings;
}

/**
 * extractOutline — يبني أقسام الدرس من الشرح المخزّن.
 * الأولوية: الشرح المبني على التفريغ (cited) ⇒ لو مفيش، عناوين `##` من الأوضاع.
 * بيرجّع [] لو مفيش أي مصدر (الدرس لسه متولّدش) — الـ Navigator بيعرض حالة فراغ.
 */
export function extractOutline(input: {
  cited?: OutlineCitedInput | null;
  /** أوضاع الشرح المخزّنة محليًا — نفس شكل lesson_content.explanation. */
  modes?: Partial<Record<string, string>> | null;
}): OutlineSection[] {
  const { cited, modes } = input;

  if (cited && Array.isArray(cited.sections) && cited.sections.length > 0) {
    const out: OutlineSection[] = [];
    const seen = new Set<string>();
    cited.sections.forEach((section, i) => {
      const heading = typeof section?.heading === "string" ? section.heading.trim() : "";
      if (!heading || seen.has(heading)) return;
      seen.add(heading);
      out.push({ id: outlineSectionId(heading, i), heading, source: "cited" });
    });
    if (out.length > 0) return out;
  }

  if (modes) {
    // ترتيب ثابت للأوضاع — الأولوية للشرح الأساسي.
    const order = ["simple", "practical", "visual", "academic"] as const;
    for (const mode of order) {
      const headings = extractMarkdownHeadings(modes[mode]);
      if (headings.length > 0) {
        return headings.map((heading, i) => ({
          id: outlineSectionId(heading, i),
          heading,
          source: "markdown" as const,
        }));
      }
    }
  }

  return [];
}
