/**
 * 📄 تحليل Markdown إلى AST للمستندات — Phase 4-B export
 *
 * ⚠️ **ليه ملف منفصل ومش بنستخدم `react-markdown`:** ده للعرض في
 * المتصفح (بيحوّل Markdown لعناصر React). هنا محتاج **تمثيل وسيط**
 * (AST) أقدر أحوّله لـ PDF و DOCX من غير ما أكتب منطق التحليل مرتين —
 * وده بالظبط اللي طلبه الـ prompt: «لو تقدر، اعمل تمثيل مشترك بدل ما
 * تكرر منطق التحليل بين PDF و Word».
 *
 * ⚠️ **ليه مش بنستخدم `unified` / `remark-parse`:** موجودين في
 * `node_modules` بس كـ **transitive dependencies** من react-markdown.
 * الاعتماد على حزمة غير معلنة في `package.json` شغل لحد ما حد يعمل
 * تحديث للاعتماديات فيتكسر من غير سبب واضح. بدل كده: parser صغير
 * ومكتوب هنا، صفر اعتماديات جديدة، ومغطى باختبارات.
 *
 * ═══ النطاق ═══
 * اللازم في مذكرة المحاضرة: عناوين، فقرات، قوائم (مرتبة/غير مرتبة)،
 * blockquotes، كود، فاصل، جداول، وتنسيق inline (غامق/مائل/كود/رابط).
 * ده يغطي ناتج الـ AI الفعلي. أي حاجة برّه ده بتترجم لفقرة نصية عادية
 * (مفيش فقدان محتوى).
 */

export type InlineMark = "bold" | "italic" | "code";

/** جزء نصي واحد مع تنسيقه. */
export type Inline = {
  text: string;
  marks: InlineMark[];
  /** رابط اختياري (http/https فقط). */
  href?: string;
};

export type DocBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; inlines: Inline[] }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "quote"; blocks: DocBlock[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "hr" }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] };

/** روابط خطرة (javascript:, data:) بتتحوّل لنص عادي. */
function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}
/* ═══════════════════════ inline ═══════════════════════ */

/** ترتيب القواعد هنا مقصود: inline code الأول، عشان محتواه مايتحلّلش كـ emphasis. */
const INLINE_RULES: Array<{ re: RegExp; mark: InlineMark; capture: number }> = [
  { re: /`([^`]+)`/, mark: "code", capture: 1 },
  { re: /\*\*([\s\S]+?)\*\*/, mark: "bold", capture: 1 },
  { re: /__([\s\S]+?)__/, mark: "bold", capture: 1 },
  { re: /(?<![*\w])\*([^*\n]+)\*(?!\*)/, mark: "italic", capture: 1 },
  { re: /(?<![_\w])_([^_\n]+)_(?![_\w])/, mark: "italic", capture: 1 },
  { re: /\[([^\]]*)\]\(([^)\s]+)\)/, mark: "link" as never, capture: 0 },
];

/**
 * 🔤 يحوّل نص سطر واحد لـ segments منظّم.
 *
 * ⚠️ **ليه مش regex واحد كبير**: الأنماط المتداخلة (غامق وفيه مائل جوه) بتكسر
 * بتكسر الـ regex النمطية. الحل هنا المسح التدريجي: بناخد أول تطابق
 * وبنكمل في الباقي — فالتنسيق المتداخل بيشتغل طبيعي.
 */
export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    // بندور على أقرب تطابق من كل الأنماط.
    let bestIndex = -1;
    let bestRule: (typeof INLINE_RULES)[number] | null = null;
    let bestMatch: RegExpExecArray | null = null;

    for (const rule of INLINE_RULES) {
      const match = rule.re.exec(rest);
      if (match && (bestIndex === -1 || match.index < bestIndex)) {
        bestIndex = match.index;
        bestRule = rule;
        bestMatch = match;
      }
    }

    if (!bestRule || !bestMatch || bestIndex === -1) {
      // مافيش تنسيق باقي — النص كامل نص عادي.
      if (rest.trim() !== "") result.push({ text: rest, marks: [] });
      break;
    }

    if (bestIndex > 0) {
      const plain = rest.slice(0, bestIndex);
      if (plain.trim() !== "") result.push({ text: plain, marks: [] });
    }

    const whole = bestMatch[0];
    const inner = bestMatch[bestRule.capture];

    if ((bestRule as { mark: string }).mark === "link") {
      const label = bestMatch[1] ?? "";
      const href = bestMatch[2] ?? "";
      // رابط غير آمن (javascript:) بيتحوّل نص عادي.
      if (href && isSafeHref(href)) {
        result.push({ text: label || href, marks: [], href });
      } else {
        result.push({ text: label || whole, marks: [] });
      }
    } else {
      // الت-parser بتاع inner بيحلو التنسيق المتداخل.
      result.push(...parseInline(inner).map((piece) => ({
        ...piece,
        marks: [...piece.marks, bestRule!.mark as InlineMark],
      })));
    }

    rest = rest.slice(bestIndex + whole.length);
  }

  return result;
}

/* ═══════════════════════ blocks ═══════════════════════ */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```(\w*)\s*$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const UL_ITEM_RE = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM_RE = /^\s*(\d+)[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

/** سطر جدول: | a | b | — بشرط إن فيه | على الجنبين. */
function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

/** سطر فاصل جدول: |---|---| */
function isTableDivider(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|$/.test(line.trim());
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * 📄 يحوّل Markdown كامل لـ AST.
 *
 * ⚠️ **قرار التصميم**: أي صيغة مش معروفة بتترجم لفقرة نصية، **مش بتترمي**.
 * السبب إن ده بيغيّر على محاضرة الطالب: لو الـ parser رفض سطر واحد، الطالب
 * بيفقد جزء من مذكرته. الأحسن نعرض النص كما هو.
 */
export function parseMarkdown(markdown: string): DocBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // سطر فاضي.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // كود مشفّر.
    const fence = FENCE_RE.exec(line.trim());
    if (fence) {
      const language = fence[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // قفل الـ fence
      blocks.push({ kind: "code", language, text: body.join("\n") });
      continue;
    }

    // فاصل.
    if (HR_RE.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    // عنوان.
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ kind: "heading", level, inlines: parseInline(heading[2].trim()) });
      i += 1;
      continue;
    }

    // blockquote — بيتجمع لحد ما يخلص.
    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const m = QUOTE_RE.exec(lines[i]);
        if (!m) break;
        inner.push(m[1]);
        i += 1;
      }
      blocks.push({ kind: "quote", blocks: parseMarkdown(inner.join("\n")) });
      continue;
    }

    // جدول — لازم صف فاصل بعد صف الهيدر.
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitTableRow(line).map((cell) => parseInline(cell));
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]).map((cell) => parseInline(cell)));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // قوائم متتالية.
    const isUl = UL_ITEM_RE.test(line);
    const isOl = OL_ITEM_RE.test(line);
    if (isUl || isOl) {
      const ordered = isOl;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = ordered ? OL_ITEM_RE.exec(lines[i]) : UL_ITEM_RE.exec(lines[i]);
        if (!m) break;
        items.push(parseInline((m[2] ?? m[1] ?? "").trim()));
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // فقرة: كل السطور لحد سطر فاضي أو بداية بلوك جديد.
    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i];
      if (
        current.trim() === "" ||
        HEADING_RE.test(current) ||
        FENCE_RE.test(current.trim()) ||
        HR_RE.test(current.trim()) ||
        QUOTE_RE.test(current) ||
        UL_ITEM_RE.test(current) ||
        OL_ITEM_RE.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      i += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", inlines: parseInline(paragraph.join(" ")) });
    }
  }

  return blocks;
}

/** نص بحت من AST — بيتستخدم في الاختبارات وقياس الحجم. */
export function blocksToPlainText(blocks: DocBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === "heading" || block.kind === "paragraph") {
      parts.push(block.inlines.map((i) => i.text).join(""));
    } else if (block.kind === "list") {
      for (const item of block.items) parts.push(item.map((i) => i.text).join(""));
    } else if (block.kind === "quote") {
      parts.push(blocksToPlainText(block.blocks));
    } else if (block.kind === "code") {
      parts.push(block.text);
    } else if (block.kind === "table") {
      for (const row of [block.header, ...block.rows]) {
        parts.push(row.map((c) => c.map((i) => i.text).join("")).join(" "));
      }
    }
  }
  return parts.filter(Boolean).join("\n");
}
