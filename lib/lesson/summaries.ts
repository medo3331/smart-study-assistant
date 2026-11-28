// lib/lesson/summaries.ts
//
// 📋 الملخصات بأشكالها الأربعة — P4 (Summaries & Notebook).
//
// تتولّد **في نداء AI واحد مجمّع** وتتخزّن مرة واحدة في `lesson_content.summaries`
// (jsonb) — «ولّد مرة وخزّن». العقود مشتركة بين الراوت والـ UI.

export const SUMMARY_KINDS = ["quick", "detailed", "academic", "exam_revision"] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

export const SUMMARY_KIND_LABELS: Record<SummaryKind, string> = {
  quick: "سريع",
  detailed: "تفصيلي",
  academic: "أكاديمي",
  exam_revision: "مراجعة الامتحان",
};

export function isSummaryKind(value: unknown): value is SummaryKind {
  return typeof value === "string" && (SUMMARY_KINDS as readonly string[]).includes(value);
}

export type LessonSummaries = Partial<Record<SummaryKind, string>>;
