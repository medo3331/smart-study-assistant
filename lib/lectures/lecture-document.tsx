/**
 * 📄 توليد مستندات المحاضرة — PDF و DOCX (سيرفر بس)
 *
 * ⚠️ **ليه `renderToBuffer` من `@react-pdf/renderer`:** بيولّد PDF على
 * السيرفر بدون متصفح. المشروع عنده نفس المكتبة مستخدمة في
 * `lib/ai/file-generator.tsx` — فمافيش اعتماديات جديدة.
 *
 * ⚠️ **مشكلة العربية في PDF (حقيقية و معروفة):** خطوط PDF القياسية
 * (Helvetica) **ما فيها** تشكيل عربي ولا ربط حروف ولا RTL. الحل هو
 * تسجيل خط عربي حقيقي — المشروع بيعمل كده في `file-generator.tsx`
 * بجلب خط Amiri وقت التشغيل. بنتبع نفس الأسلوب بالظبط عشان النتيجة
 * متسقة مع باقي ملفات Magicly.
 *
 * ═══ لماذا AST واحد للاثنين ═══
 * `markdown-doc.ts` بيحوّل Markdown لـ AST مرة واحدة، و renderer
 * الـ PDF والـ DOCX بيستهلكوا نفس الـ AST. فمافيش منطق تحليل مكرر،
 * ومافيش احتمال إن الـ PDF والـ Word يختلفوا في الفهم.
 */

import React from "react";
import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import {
  Document as DocxDocument,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  BorderStyle,
} from "docx";

import { parseMarkdown, type DocBlock, type Inline } from "./markdown-doc";

export type ExportFormat = "pdf" | "docx";

export type LectureDocument = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * 🧼 اسم ملف آمن.
 *
 * ⚠️ مش للزخرفة: أي `../` أو `/` في اسم الملف من اللي بنحطه في
 * `Content-Disposition` ممكن يوصّل الكتابة لمسار تاني على بعض الأنظمة.
 * بنشيل المحارف الخطرة وكل اللي مش اسم ملف معقول.
 */
export function safeExportFilename(title: string, format: ExportFormat): string {
  const cleaned = (title ?? "")
    .replace(/[\\/:*?"<>|#%&{}$!@+=`^~\[\]]/g, "")
    .replace(/\s+/g, "-")
    // ⬇️ الشرطات في الأول والآخر بتفضي `base` فاضية وتطلع اسم زي
    //   `Magicly---explanation.pdf`. بنشيلها مع النقاط.
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "")
    .slice(0, 60)
    .trim();
  const base = cleaned === "" ? "lecture" : cleaned;
  return `Magicly-${base}-explanation.${format}`;
}
/* ═══════════════════════ الخط العربي ═══════════════════════ */

/**
 * ⚠️ مصادر الخط من CDN زي `file-generator.tsx` بالظبط — عشان النتيجة
 * متسقة مع باقي ملفات Magicly ومن غير ملف خط كبير في المستوديو.
 * لو التحميل فشل بنرجع لـ Helvetica (عربي هيبان وحش، بس المستند بيطلع).
 */
const ARABIC_FONT_SOURCES = [
  "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.1.1/files/amiri-arabic-400-normal.woff",
  "https://unpkg.com/@fontsource/amiri@5.1.1/files/amiri-arabic-400-normal.woff",
];

let fontPromise: Promise<string> | null = null;

/** يسجّل خط عربي ويج اسمه. النتيجة بتتخزّن وقت العملية الواحدة. */
export function ensureArabicFont(): Promise<string> {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    for (const src of ARABIC_FONT_SOURCES) {
      try {
        const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const bytes = Buffer.from(await res.arrayBuffer()).toString("base64");
        Font.register({ family: "MagiclyArabic", fonts: [{ src: `data:font/woff;base64,${bytes}` }] });
        return "MagiclyArabic";
      } catch (error) {
        console.warn("[lecture-doc] Arabic font source failed:", src, (error as Error).message);
      }
    }
    console.warn("[lecture-doc] falling back to Helvetica; Arabic glyphs may render poorly");
    return "Helvetica";
  })();
  return fontPromise;
}

/* ═══════════════════════ PDF ═══════════════════════ */

function pdfStyles(font: string) {
  return StyleSheet.create({
    page: { paddingTop: 44, paddingBottom: 48, paddingHorizontal: 44, fontFamily: font, direction: "rtl" },
    brand: { fontSize: 9, color: "#9ca3af", marginBottom: 2, textAlign: "right" },
    title: { fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 4, textAlign: "right" },
    meta: { fontSize: 9, color: "#6b7280", marginBottom: 16, textAlign: "right" },
    rule: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginBottom: 16 },
    h1: { fontSize: 15, fontWeight: 700, color: "#111827", marginTop: 14, marginBottom: 6, textAlign: "right" },
    h2: { fontSize: 13, fontWeight: 700, color: "#1f2937", marginTop: 12, marginBottom: 5, textAlign: "right" },
    h3: { fontSize: 11.5, fontWeight: 700, color: "#374151", marginTop: 10, marginBottom: 4, textAlign: "right" },
    p: { fontSize: 10.5, lineHeight: 1.75, color: "#1f2937", marginBottom: 8, textAlign: "right" },
    li: { fontSize: 10.5, lineHeight: 1.7, color: "#1f2937", marginBottom: 4, marginRight: 12, textAlign: "right" },
    quoteBox: { backgroundColor: "#f9fafb", borderRightWidth: 3, borderRightColor: "#6366f1", padding: 8, marginBottom: 8 },
    quoteText: { fontSize: 10.5, lineHeight: 1.7, color: "#374151", textAlign: "right" },
    codeBox: { backgroundColor: "#111827", padding: 8, borderRadius: 4, marginBottom: 8, direction: "ltr" },
    codeText: { fontFamily: "Courier", fontSize: 9, color: "#e5e7eb" },
    inlineCode: { fontFamily: "Courier", fontSize: 9.5, color: "#4338ca" },
    tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
    cell: { flex: 1, padding: 5, fontSize: 9.5, color: "#1f2937" },
  });
}
/** ⬇️ `<Text>` جوه `<Text>` بيورّث التنسيق — وده اللي بيخلّي **غامق** يبان غامق فعلاً. */
function pdfInlines(inlines: Inline[], s: ReturnType<typeof pdfStyles>, base?: { fontSize?: number; color?: string }) {
  return inlines.map((piece, index) => {
    const isCode = piece.marks.includes("code");
    return (
      <Text
        key={index}
        style={
          isCode
            ? s.inlineCode
            : {
                fontWeight: piece.marks.includes("bold") ? 700 : undefined,
                fontStyle: piece.marks.includes("italic") ? "italic" : undefined,
                color: base?.color,
                fontSize: base?.fontSize,
              }
        }
      >
        {piece.text}
      </Text>
    );
  });
}

function pdfBlocks(blocks: DocBlock[], s: ReturnType<typeof pdfStyles>, font: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  let key = 0;

  for (const block of blocks) {
    switch (block.kind) {
      case "heading": {
        const style = block.level <= 1 ? s.h1 : block.level === 2 ? s.h2 : s.h3;
        out.push(<Text key={key++} style={style}>{pdfInlines(block.inlines, s)}</Text>);
        break;
      }
      case "paragraph":
        out.push(<Text key={key++} style={s.p}>{pdfInlines(block.inlines, s)}</Text>);
        break;
      case "list":
        for (const item of block.items) {
          // ⚠️ العلامة بتتحط كنص مش bullet محاذاة — ده أضمن مع RTL.
          const marker = block.ordered ? "• " : "• ";
          out.push(
            <Text key={key++} style={s.li}>
              {marker}
              {pdfInlines(item, s)}
            </Text>,
          );
        }
        break;
      case "quote":
        out.push(
          <View key={key++} style={s.quoteBox}>
            {pdfBlocks(block.blocks, s, font)}
          </View>,
        );
        break;
      case "code":
        out.push(
          <View key={key++} style={s.codeBox}>
            <Text style={s.codeText}>{block.text}</Text>
          </View>,
        );
        break;
      case "hr":
        out.push(<View key={key++} style={s.rule} />);
        break;
      case "table": {
        out.push(
          <View key={key++} style={s.tableRow}>
            {block.header.map((cell, ci) => (
              <View key={ci} style={[s.cell, { backgroundColor: "#f3f4f6" }]}>
                <Text style={{ fontWeight: 700 }}>{pdfInlines(cell, s)}</Text>
              </View>
            ))}
          </View>,
        );
        for (const row of block.rows) {
          out.push(
            <View key={key++} style={s.tableRow}>
              {row.map((cell, ci) => (
                <View key={ci} style={s.cell}>{pdfInlines(cell, s)}</View>
              ))}
            </View>,
          );
        }
        break;
      }
    }
  }
  return out;
}

/** 📄 يولّد PDF من الشرح. */
export async function generateLecturePdf(input: {
  title: string;
  explanation: string;
  generatedAt?: Date;
}): Promise<LectureDocument> {
  const font = await ensureArabicFont();
  const s = pdfStyles(font);
  const blocks = parseMarkdown(input.explanation);
  const date = (input.generatedAt ?? new Date()).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const doc = (
    <Document title={input.title} author="Magicly">
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>Magicly — مذكرة المحاضرة</Text>
        <Text style={s.title}>{input.title}</Text>
        <Text style={s.meta}>تاريخ التوليد: {date}</Text>
        <View style={s.rule} />
        {pdfBlocks(blocks, s, font)}
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return {
    buffer: Buffer.from(buffer),
    filename: safeExportFilename(input.title, "pdf"),
    mimeType: EXPORT_MIME_TYPES.pdf,
  };
}
/* ═══════════════════════ DOCX ═══════════════════════ */

const HEADING_FOR_LEVEL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_4,
  6: HeadingLevel.HEADING_4,
};

/**
 * ⬇️ `bidirectional: true` + `rightToLeft: true` على الـ run هما اللي بيخلّوا
 * Word يرتّب النص عربي صح. من غيرهم النص بيطلع كله LTR أو مقطّع.
 * نفس النمط المستخدم في `file-generator.tsx`.
 */
function docxRuns(inlines: Inline[]): TextRun[] {
  return inlines.map(
    (piece) =>
      new TextRun({
        text: piece.text,
        rightToLeft: true,
        bold: piece.marks.includes("bold"),
        italics: piece.marks.includes("italic"),
        font: piece.marks.includes("code") ? "Courier New" : "Arial",
        ...(piece.href ? { underline: {} } : {}),
      }),
  );
}

function docxParagraph(
  inlines: Inline[],
  opts: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; indent?: boolean } = {},
): Paragraph {
  return new Paragraph({
    children: docxRuns(inlines),
    ...(opts.heading ? { heading: opts.heading } : {}),
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    spacing: { after: 140, line: 320 },
    ...(opts.indent ? { indent: { right: 360 } } : {}),
  });
}

function docxBlocks(blocks: DocBlock[]): Paragraph[] {
  const out: Paragraph[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        out.push(docxParagraph(block.inlines, { heading: HEADING_FOR_LEVEL[block.level] }));
        break;
      case "paragraph":
        out.push(docxParagraph(block.inlines));
        break;
      case "list":
        for (const item of block.items) {
          out.push(
            new Paragraph({
              children: docxRuns(item),
              alignment: AlignmentType.RIGHT,
              bidirectional: true,
              bullet: { level: 0 },
              spacing: { after: 90, line: 300 },
            }),
          );
        }
        break;
      case "quote":
        // 💡 ملاحظة على كفاية: `docx` مافيش callout جاهز، فنمثّلها
        //    فقرة بحدّ أيسر + خلفية رمادية خفيفة — أقرب حاجة متاحة.
        for (const [index, inner] of docxBlocks(block.blocks).entries()) {
          out.push(
            new Paragraph({
              ...(inner as unknown as Record<string, unknown>),
              border: {
                left: { style: BorderStyle.SINGLE, size: 12, color: "6366F1", space: 8 },
              },
              shading: { fill: "F9FAFB" },
              spacing: { after: index === 0 ? 140 : 90, line: 300 },
            }),
          );
        }
        break;
      case "code":
        out.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, font: "Courier New", size: 19, rightToLeft: false })],
            alignment: AlignmentType.LEFT,
            bidirectional: false,
            shading: { fill: "F3F4F6" },
            spacing: { before: 80, after: 140 },
          }),
        );
        break;
      case "hr":
        out.push(
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E5E7EB", space: 1 } },
            spacing: { before: 120, after: 160 },
          }),
        );
        break;
      case "table":
        for (const row of [block.header, ...block.rows]) {
          out.push(
            new Paragraph({
              children: row.flatMap((cell) => [
                new TextRun({ text: " | ", color: "9CA3AF" }),
                ...docxRuns(cell),
              ]),
              alignment: AlignmentType.RIGHT,
              bidirectional: true,
              spacing: { after: 60 },
            }),
          );
        }
        out.push(docxParagraph([{ text: "", marks: [] }]));
        break;
    }
  }
  return out;
}

/** 📝 يولّد DOCX حقيقي من الشرح. */
export async function generateLectureDocx(input: {
  title: string;
  explanation: string;
  generatedAt?: Date;
}): Promise<LectureDocument> {
  const date = (input.generatedAt ?? new Date()).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const blocks = parseMarkdown(input.explanation);

  const doc = new DocxDocument({
    creator: "Magicly",
    title: input.title,
    description: "مذكرة المحاضرة",
    sections: [
      {
        properties: {},
        children: [
          docxParagraph([{ text: "Magicly — مذكرة المحاضرة", marks: [] }]),
          docxParagraph([{ text: input.title, marks: ["bold"] }], { heading: HeadingLevel.HEADING_1 }),
          docxParagraph([{ text: `تاريخ التوليد: ${date}`, marks: [] }]),
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E5E7EB", space: 1 } },
            spacing: { after: 240 },
          }),
          ...docxBlocks(blocks),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return {
    buffer: Buffer.from(buffer),
    filename: safeExportFilename(input.title, "docx"),
    mimeType: EXPORT_MIME_TYPES.docx,
  };
}

/** 🎯 نقطة دخول واحدة — الراوت بيختار Format وبياخد نفس النتيجة. */
export async function generateLectureDocument(
  format: ExportFormat,
  input: { title: string; explanation: string },
): Promise<LectureDocument> {
  return format === "pdf" ? generateLecturePdf(input) : generateLectureDocx(input);
}