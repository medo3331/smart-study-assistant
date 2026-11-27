"use client";

/**
 * 📖 عرض الشرح المتطور في الشات — فوق MarkdownRenderer مباشرة.
 *
 * 🚨 **ليه الملف ده:** MarkdownRenderer بيقرّا blockquote كنص رمادي عادي،
 *    والمساعد بيستخدم 💡/⚠️/📌 كتير — فكانت التنبيهات بتضيع في الكلام.
 *    هنا بنحوّل كل blockquote له صندوق ملوّن حسب الرمز، وبنبرز الكلمات
 *    المهمة (`**bold**`) بخلفية الـ accent عشان التعرّف السريع.
 */

import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";

/** نوع الصندوق من أول رمز في أول سطر. */
function calloutKind(firstLine: string): { key: string; label: string; className: string } | null {
  if (!firstLine.includes(">")) return null;
  const text = firstLine.replace(/^\s*>\s?/, "");
  if (/^[💡✨🎯]/u.test(text)) return { key: "tip", label: "فكرة", className: "border-blue-300 bg-blue-50 text-blue-950" };
  if (/^[⚠️❗]/u.test(text)) return { key: "warn", label: "انتبه", className: "border-amber-300 bg-amber-50 text-amber-950" };
  if (/^[📌🔑⭐]/u.test(text)) return { key: "key", label: "مهم", className: "border-purple-300 bg-purple-50 text-purple-950" };
  if (/^✅/u.test(text)) return { key: "ok", label: "صح", className: "border-emerald-300 bg-emerald-50 text-emerald-950" };
  if (/^❌/u.test(text)) return { key: "no", label: "غلط شائع", className: "border-rose-300 bg-rose-50 text-rose-950" };
  if (/^[🧠]/u.test(text)) return { key: "brain", label: "افهمها كده", className: "border-indigo-300 bg-indigo-50 text-indigo-950" };
  if (/^[📖📚]/u.test(text)) return { key: "book", label: "من المحاضرة", className: "border-teal-300 bg-teal-50 text-teal-950" };
  // blockquote بدون رمز معروف — صندوق رمادي محايد.
  return { key: "note", label: "ملاحظة", className: "border-rule bg-paper-3 text-ink" };
}

/** تقسيم المحتوى لمقاطع: blockquote متتالي = صندوق، والباقي ماركداون عادي. */
function splitBlocks(content: string): Array<{ type: "callout"; lines: string[]; kind: NonNullable<ReturnType<typeof calloutKind>> } | { type: "md"; text: string }> {
  const blocks: Array<{ type: "callout"; lines: string[]; kind: NonNullable<ReturnType<typeof calloutKind>> } | { type: "md"; text: string }> = [];
  const lines = content.split("\n");
  let md: string[] = [];

  const flushMd = () => {
    const text = md.join("\n").trim();
    if (text) blocks.push({ type: "md", text });
    md = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*>/.test(line)) {
      const kind = calloutKind(line);
      const collected: string[] = [];
      // ⚠️ الرمز معروف؟ لو لأ والمقطع ده blockquote عادي داخل فقرة — نسيبه
      //    ماركداون عادي عشان ما نبوظش اقتباسات متعددة الأسطر الغريبة.
      if (!kind) {
        md.push(line);
        continue;
      }
      flushMd();
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        collected.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      i--;
      blocks.push({ type: "callout", lines: collected, kind });
    } else {
      md.push(line);
    }
  }
  flushMd();
  return blocks;
}

export function ExplanationView({ content }: { content: string }) {
  const blocks = splitBlocks(content);
  return (
    <div
      dir="rtl"
      className="space-y-3 text-sm leading-relaxed [&_strong]:bg-[var(--accent)]/15 [&_strong]:px-1 [&_strong]:rounded [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pe-5 [&_ol]:list-decimal [&_ol]:pe-5 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold"
    >
      {blocks.map((b, i) => {
        if (b.type === "md") return <MarkdownRenderer key={i}>{b.text}</MarkdownRenderer>;
        return (
          <div key={i} className={`rounded-xl border px-3 py-2 ${b.kind.className}`}>
            <span className="inline-block mb-1 text-[10px] font-bold opacity-80">◉ {b.kind.label}</span>
            <MarkdownRenderer>{b.lines.join("\n")}</MarkdownRenderer>
          </div>
        );
      })}
    </div>
  );
}
