/* ==========================================================================
   🎨 مولّد العرض التقديمي — Phase 5
   ============================================================================

   **سيرفر بس.** الدخول من الراوت بس.

   ═══ ٣ صيغ، نفس الـ JSON ═══
   - **PPTX** (`pptxgenjs`) — سلايد لكل شريحة + **Speaker Notes** + **footer**
     صغير مرئي بالمصدر.
   - **PDF** (`@react-pdf/renderer`) — `<Page>` لكل شريحة + سطر المصدر.
   - **DOCX** (`docx`) — heading + نقاط + **footnote حقيقي** (مش نص عادي).

   ═══ ليه الـ notes + الـ footer مع بعض ═══
   الـ Speaker Notes **مش بتظهر على السلايد** — لازم المستخدم يفتح Notes
   pane. فلو المصدر لازم يكون **مرئي** (قرار: «الاتنين»)، بنعمل كمان
   footer صغير في زاوية السلايد.

   ⚠️ **ليه مش بنعدّل `file-generator.tsx`**: فيه ٥ أنواع محتوى × ٤ صيغ
   = ٢٠ مسار. أي تعديل بيمسّ الـ ٢٠. ⇒ **شقيق جديد** بيستورد بس
   ٣ helpers مشتركة (اسم الملف + نوع الـ MIME + باراجراف RTL).
   ========================================================================== */

import React from "react";
import {
  Document,
  Page,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  Document as DocxDocument,
  Paragraph,
  TextRun,
  HeadingLevel,
  FootnoteReferenceRun,
  Packer,
  AlignmentType,
} from "docx";

import { FILE_MIME_TYPES, sanitizeFilename } from "./file-generator";
import { ensurePdfFont as registerPdfFont } from "@/lib/lectures/pdf-font";
import type { DeckSlide, DeckState } from "./slides";

/* ═══════════════════════════ الأنواع ═══════════════════════════ */

export type DeckFormat = "pptx" | "pdf" | "docx";

export const DECK_MIME_TYPES: Record<DeckFormat, string> = {
  pptx: FILE_MIME_TYPES.pptx,
  pdf: FILE_MIME_TYPES.pdf,
  docx: FILE_MIME_TYPES.docx,
};

export type DeckFileResult = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

/* ═══════════════════════════ أدوات المصدر ═══════════════════════════ */

/**
 * ⚠️ **الليبل بتاع الوحدة** — بيختلف حسب نوع الملف:
 *   PDF  → «صفحة ٤»
 *   PPTX → «شريحة ٤»
 *   DOCX → «الفقرة ٤»
 *
 * (قرار: DOCX مالوش صفحات — الـ page count ناتج rendering مش data.)
 */
export function unitLabel(unit: DeckState["source"]["unit"], n: number): string {
  if (unit === "slide") return `شريحة ${n}`;
  if (unit === "paragraph") return `الفقرة ${n}`;
  return `صفحة ${n}`;
}

/** شارة المصدر لسلايد واحد: «صفحة ٤» أو «صفحتا ٤ و ٧». */
export function sourceBadge(
  slide: DeckSlide,
  unit: DeckState["source"]["unit"],
): string {
  const pages = Array.from(
    new Set(
      slide.bullets
        .map((bullet) => bullet.page)
        .filter((page): page is number => page !== null),
    ),
  );
  if (pages.length === 0) return "";
  if (pages.length === 1) return unitLabel(unit, pages[0]);
  const first = unitLabel(unit, pages[0]);
  const last = unitLabel(unit, pages[pages.length - 1]);
  return `${first} و ${last}`;
}

/* ═══════════════════════════ ١) PowerPoint ═══════════════════════════ */

/**
 * ⚠️ **الـ RTL**: `pptx.rtlMode = true` + `align: "right"` + `rtlMode: true`
 * على كل نص (نفس نمط `generatePPTX` القائم في `file-generator.tsx`).
 */
async function generateDeckPPTX(input: {
  state: DeckState;
  slides: DeckSlide[];
  studentName?: string;
}): Promise<DeckFileResult> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const { state, slides } = input;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.rtlMode = true;
  pptx.title = state.title;

  const DARK_BG = "0F172A";
  const ACCENT = "7C3AED";

  // شريحة العنوان
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: DARK_BG };
  titleSlide.addText(state.title, {
    x: 0.5, y: 2.2, w: 12.3, h: 1.6,
    fontSize: 36, bold: true, color: "F8FAFC", align: "center",
    rtlMode: true, fontFace: "Arial",
  });
  titleSlide.addText(
    [
      state.subtitle ?? "",
      input.studentName ? `إعداد: ${input.studentName}` : "",
      state.source.file_name ? `المصدر: ${state.source.file_name}` : "",
    ]
      .filter(Boolean)
      .join("  •  "),
    {
      x: 0.5, y: 4.0, w: 12.3, h: 0.8,
      fontSize: 16, color: "C4B5FD", align: "center", rtlMode: true, fontFace: "Arial",
    }
  );

  for (const slide of slides) {
    const s = pptx.addSlide();
    s.background = { color: DARK_BG };
    s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: ACCENT } });
    s.addText(slide.heading, {
      x: 0.4, y: 0.15, w: 12.5, h: 0.8,
      fontSize: 24, bold: true, color: "FFFFFF", align: "right",
      rtlMode: true, fontFace: "Arial",
    });
    s.addText(
      slide.bullets.map((b) => ({
        text: b.text,
        options: { bullet: { code: "25CF" }, paraSpaceAfter: 12, rtlMode: true },
      })),
      {
        x: 0.6, y: 1.4, w: 12.1, h: 5.2,
        fontSize: 18, color: "E2E8F0", align: "right", rtlMode: true,
        fontFace: "Arial", valign: "top",
      },
    );

    const badge = sourceBadge(slide, state.source.unit);

    // ⚠️ **الـ footer الصغير المرئي** — المصدر لازم يكون مرئي على
    //    السلايد نفسه (قرار «الاتنين»)، مش بس في الـ Notes.
    if (badge) {
      s.addText(badge, {
        x: 11.9, y: 6.85, w: 1.1, h: 0.3,
        fontSize: 9, color: "94A3B8", align: "left", rtlMode: true, fontFace: "Arial",
      });
    }

    // ⚠️ **الـ Speaker Notes** — المصدر كامل + الاقتباسات الحرفية.
    if (badge) {
      const quotes = slide.bullets
        .filter((b) => b.quote)
        .map((b) => `• ${b.quote}`)
        .join("\n");
      s.addNotes(
        [
          `المصدر: ${badge} من "${state.source.file_name}"`,
          quotes,
          slide.notes ?? "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

  return {
    buffer,
    filename: `${sanitizeFilename(state.title)}.pptx`,
    mimeType: DECK_MIME_TYPES.pptx,
    size: buffer.length,
  };
}

/* ═══════════════════════════ ٢) PDF ═══════════════════════════ */

function buildDeckPdfStyles(fontFamily: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 56,
      paddingBottom: 64,
      paddingHorizontal: 44,
      fontFamily,
      fontSize: 11,
      color: "#0F172A",
    },
    title: { fontSize: 20, fontWeight: 700, marginBottom: 6, textAlign: "right" },
    subtitle: { fontSize: 11, color: "#64748B", marginBottom: 14, textAlign: "right" },
    heading: { fontSize: 15, fontWeight: 700, marginBottom: 8, textAlign: "right" },
    bullet: { fontSize: 11, lineHeight: 1.7, marginBottom: 6, textAlign: "right" },
    source: { fontSize: 9, color: "#64748B", marginTop: 10, textAlign: "right" },
    footer: {
      position: "absolute", bottom: 30, left: 44, right: 44,
      fontSize: 9, color: "#94A3B8", textAlign: "center",
    },
  });
}

function DeckPdf({
  state,
  slides,
  styles,
  studentName,
}: {
  state: DeckState;
  slides: DeckSlide[];
  styles: ReturnType<typeof buildDeckPdfStyles>;
  studentName?: string;
}) {
  return (
    <Document>
      {/* ⚠️ صفحة العنوان */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{state.title}</Text>
        {state.subtitle && <Text style={styles.subtitle}>{state.subtitle}</Text>}
        <Text style={styles.subtitle}>
          {studentName ? `إعداد: ${studentName}` : ""}
          {state.source.file_name ? `  •  المصدر: ${state.source.file_name}` : ""}
        </Text>
        <Text style={styles.footer}>تم التوليد بواسطة ماجيكلي 🧙‍♂️</Text>
      </Page>

      {/* ⚠️ صفحة لكل شريحة — زي الـ PPT (deck مش تقرير) */}
      {slides.map((slide, index) => {
        const badge = sourceBadge(slide, state.source.unit);
        return (
          <Page key={`${index}-${slide.heading.slice(0, 12)}`} size="A4" style={styles.page}>
            <Text style={styles.title}>
              {index + 1}. {slide.heading}
            </Text>
            {slide.bullets.map((bullet, i) => (
              <Text key={`${i}-${bullet.text.slice(0, 12)}`} style={styles.bullet}>
                • {bullet.text}
              </Text>
            ))}
            {slide.notes && <Text style={styles.subtitle}>{slide.notes}</Text>}
            {badge && (
              <Text style={styles.source}>
                {`المصدر: ${badge} من «${state.source.file_name}»`}
              </Text>
            )}
            <Text style={styles.footer}>تم التوليد بواسطة ماجيكلي 🧙‍♂️</Text>
          </Page>
        );
      })}
    </Document>
  );
}

async function generateDeckPDF(input: {
  state: DeckState;
  slides: DeckSlide[];
  studentName?: string;
}): Promise<DeckFileResult> {
  const fontFamily = await registerPdfFont();
  const styles = buildDeckPdfStyles(fontFamily);

  const buffer = await renderToBuffer(
    <DeckPdf
      state={input.state}
      slides={input.slides}
      styles={styles}
      studentName={input.studentName}
    />,
  );

  return {
    buffer,
    filename: `${sanitizeFilename(input.state.title)}.pdf`,
    mimeType: DECK_MIME_TYPES.pdf,
    size: buffer.length,
  };
}

/* ═══════════════════════════ ٣) Word ═══════════════════════════ */

/** باراجراف RTL — نفس نمط `file-generator.tsx`. */
function rtlParagraph(
  text: string,
  opts: { bold?: boolean; size?: number; bullet?: boolean } = {},
): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 120 },
    ...(opts.bullet ? { bullet: { level: 0 } } : {}),
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 22,
        font: "Arial",
        rightToLeft: true,
      }),
    ],
  });
}

async function generateDeckDOCX(input: {
  state: DeckState;
  slides: DeckSlide[];
  studentName?: string;
}): Promise<DeckFileResult> {
  const { state, slides } = input;

  /** ⚠️ الـ footnotes بتترقّم من 1 — وكل footnote ليها رقم. */
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  let footnoteId = 1;

  const children: Paragraph[] = [
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: state.title,
          bold: true,
          size: 36,
          font: "Arial",
          rightToLeft: true,
        }),
      ],
    }),
  ];

  if (state.subtitle) {
    children.push(rtlParagraph(state.subtitle, { size: 24 }));
  }
  children.push(
    rtlParagraph(
      [
        input.studentName ? `إعداد: ${input.studentName}` : "",
        state.source.file_name ? `المصدر: ${state.source.file_name}` : "",
      ]
        .filter(Boolean)
        .join("  •  "),
      { size: 20 },
    ),
  );

  for (const slide of slides) {
    const badge = sourceBadge(slide, state.source.unit);

    // ⚠️ **footnote حقيقي** — الـ Word بيعرضها تحت الصفحة. ده أظهر من
    //    الـ notes في PowerPoint (أفخم بكتير).
    const headingChildren = [
      new TextRun({
        text: slide.heading,
        bold: true,
        size: 28,
        font: "Arial",
        rightToLeft: true,
      }),
    ];
    if (badge) {
      const id = footnoteId;
      footnoteId += 1;
      footnotes[String(id)] = {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `المصدر: ${badge} من "${state.source.file_name}"`,
                size: 16,
                font: "Arial",
              }),
            ],
          }),
        ],
      };
      headingChildren.push(new FootnoteReferenceRun(id));
    }

    children.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { before: 240, after: 120 },
        heading: HeadingLevel.HEADING_1,
        children: headingChildren,
      }),
    );

    for (const bullet of slide.bullets) {
      children.push(rtlParagraph(bullet.text, { bullet: true }));
    }
  }

  const doc = new DocxDocument({
    footnotes,
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);

  return {
    buffer,
    filename: `${sanitizeFilename(state.title)}.docx`,
    mimeType: DECK_MIME_TYPES.docx,
    size: buffer.length,
  };
}

/* ═══════════════════════════ التصدير ═══════════════════════════ */

/** يولّد الملف بالصيغة المطلوبة. */
export async function generateDeckFile(input: {
  format: DeckFormat;
  state: DeckState;
  slides: DeckSlide[];
  studentName?: string;
}): Promise<DeckFileResult> {
  if (input.format === "pptx") return generateDeckPPTX(input);
  if (input.format === "docx") return generateDeckDOCX(input);
  return generateDeckPDF(input);
}
