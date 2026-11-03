// lib/voice/clean.ts
//
// تنظيف النص للصوت: إزالة Markdown، والحفاظ على المصطلحات الإنجليزية
// والأرقام والمعادلات (لا نقرأ الرموز حرفياً).

export function cleanTextForSpeech(raw: string): string {
  if (!raw) return "";
  let t = raw;

  // بلوكات الكود → إشارة واحدة
  t = t.replace(/```[\s\S]*?```/g, " . فيه بلوك كود هنا، بصّ عليه في الشاشة . ");

  // كود inline: احتفظ بالمحتوى
  t = t.replace(/`([^`]+)`/g, "$1");

  // عناوين
  t = t.replace(/^#{1,6}\s*/gm, "");

  // عريض/مائل
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/_([^_]+)_/g, "$1");

  // قوائم
  t = t.replace(/^\s*[-*+]\s+/gm, " . ");
  t = t.replace(/^\s*\d+\.\s+/gm, " . ");

  // روابط: احتفظ بالنص
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // صور
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // blockquotes
  t = t.replace(/^>\s*/gm, "");

  // horizontal rules
  t = t.replace(/^---+$/gm, "");

  // HTML tags
  t = t.replace(/<[^>]+>/g, "");

  // تقليل الأسطر المتعددة
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]{2,}/g, " ");

  return t.trim();
}
