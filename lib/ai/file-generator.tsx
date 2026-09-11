/**
 * lib/ai/file-generator.tsx — توليد الملفات القابلة للتحميل
 *
 *   PDF   ← @react-pdf/renderer  (ملخصات + كويزات + خطط مذاكرة + بطاقات)
 *   Word  ← docx                  (أبحاث + تقارير)
 *   Excel ← xlsx                  (جداول بيانات + إحصائيات)
 *   PPT   ← pptxgenjs             (عروض تقديمية)
 *
 * الـ data اللي بتيجي هنا ناتجة من توليد الـ AI (ملخص/كويز/خطة...)،
 * والدور بتاع الملف ده تحويلها لمستند منسّق بالعربية (RTL) جاهز للتحميل.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import {
  Document as DocxDocument,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
} from "docx";
import * as XLSX from "xlsx";

export type FileType = "pdf" | "docx" | "xlsx" | "pptx";
export type FileContent =
  | "summary"
  | "quiz"
  | "study_plan"
  | "report"
  | "flashcards";

export interface GenerateFileOptions {
  type: FileType;
  content: FileContent;
  title: string;
  subject?: string;
  /** البيانات المولدة من الـ AI — شكلها حسب نوع المحتوى. */
  data: Record<string, unknown>;
  studentName?: string;
  language?: "ar" | "en";
}

export interface FileResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

export const FILE_MIME_TYPES: Record<FileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const BRAND_NOTE = "تم التوليد بواسطة ماجيكلي 🧙‍♂️";

// ============================================
// أدوات مساعدة
// ============================================
function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, "")
    .replace(/\s+/g, "_")
    .trim();
  return (cleaned || "magically").slice(0, 80);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : String(v ?? "")))
    .filter(Boolean);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item)
  );
}

// ============================================
// 1. PDF — باستخدام @react-pdf/renderer
// ============================================

/**
 * خط عربي للـ PDF: بنجيب Amiri مرة واحدة وقت التشغيل وبنسجّله كـ data URL
 * عشان الرسم نفسه مايحتاجش نت. لو التحميل فشل نرجع لـ Helvetica.
 */
const ARABIC_FONT_SOURCES = [
  "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.1.1/files/amiri-arabic-400-normal.woff",
  "https://unpkg.com/@fontsource/amiri@5.1.1/files/amiri-arabic-400-normal.woff",
];

let pdfFontPromise: Promise<string> | null = null;

function ensurePdfFont(): Promise<string> {
  if (pdfFontPromise) return pdfFontPromise;
  pdfFontPromise = (async () => {
    for (const src of ARABIC_FONT_SOURCES) {
      try {
        const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const bytes = Buffer.from(await res.arrayBuffer()).toString("base64");
        const dataUrl = `data:font/woff;base64,${bytes}`;
        Font.register({
          family: "Magicly Arabic",
          fonts: [{ src: dataUrl }],
        });
        console.log("[File Gen] Arabic PDF font registered:", src);
        return "Magicly Arabic";
      } catch (err) {
        console.warn("[File Gen] Font source failed:", src, (err as Error).message);
      }
    }
    console.warn("[File Gen] Falling back to Helvetica — Arabic glyphs may render poorly");
    return "Helvetica";
  })();
  return pdfFontPromise;
}

function buildPdfStyles(fontFamily: string) {
  return StyleSheet.create({
    page: { padding: 40, fontFamily, direction: "rtl" },
    title: { fontSize: 22, fontWeight: "bold", marginBottom: 20, color: "#6B21A8", textAlign: "right" },
    subtitle: { fontSize: 14, color: "#64748B", marginBottom: 15, textAlign: "right" },
    section: { marginBottom: 15 },
    heading: { fontSize: 16, fontWeight: "bold", color: "#1E293B", marginBottom: 8, textAlign: "right" },
    text: { fontSize: 12, lineHeight: 1.8, color: "#334155", textAlign: "right" },
    bullet: { fontSize: 12, lineHeight: 1.8, color: "#334155", marginRight: 10, textAlign: "right" },
    table: { width: "100%", borderStyle: "solid", borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 },
    tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
    tableCell: { flex: 1, padding: 8, fontSize: 11, textAlign: "right" },
    header: { backgroundColor: "#F1F5F9", fontWeight: "bold" },
    footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 9, color: "#94A3B8", textAlign: "center" },
  });
}

function PdfFooter() {
  return <Text style={pdfStylesStatic.footer}>تم التوليد بواسطة ماجيكلي — magiclly.com</Text>;
}

// أنماط ثابتة للفوتر (تتبني بخط افتراضي آمن)
const pdfStylesStatic = StyleSheet.create({
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 9, color: "#94A3B8", textAlign: "center" },
});

type PdfProps = {
  data: Record<string, unknown>;
  title: string;
  studentName?: string;
  subject?: string;
  styles: ReturnType<typeof buildPdfStyles>;
};

function SummaryPDF({ data, title, studentName, styles }: PdfProps) {
  const keyPoints = asStringArray(data.key_points);
  const concepts = asRecordArray(data.concepts);
  const sections = asRecordArray(data.sections);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        {studentName && (
          <Text style={styles.subtitle}>إعداد: {studentName} | ماجيكلي 🧙‍♂️</Text>
        )}

        {keyPoints.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>النقاط الرئيسية</Text>
            {keyPoints.map((point, i) => (
              <Text key={i} style={styles.bullet}>• {point}</Text>
            ))}
          </View>
        )}

        {concepts.map((concept, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.heading}>{String(concept.term ?? "")}</Text>
            <Text style={styles.text}>{String(concept.definition ?? "")}</Text>
          </View>
        ))}

        {sections.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.heading}>{String(section.heading ?? section.title ?? "")}</Text>
            <Text style={styles.text}>{String(section.body ?? section.content ?? "")}</Text>
          </View>
        ))}

        <PdfFooter />
      </Page>
    </Document>
  );
}

function QuizPDF({ data, title, styles }: PdfProps) {
  const questions = asRecordArray(data.questions);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>

        {questions.map((q, i) => {
          const options = asStringArray(q.options);
          return (
            <View key={i} style={styles.section}>
              <Text style={styles.heading}>
                {i + 1}. {String(q.question ?? "")}
              </Text>
              {options.map((opt, j) => (
                <Text key={j} style={styles.bullet}>
                  {["أ", "ب", "ج", "د", "هـ", "و"][j] ?? "•"} {opt}
                </Text>
              ))}
              {q.explanation ? (
                <Text style={styles.text}>الشرح: {String(q.explanation)}</Text>
              ) : null}
            </View>
          );
        })}

        {/* مفتاح الإجابات */}
        <View style={styles.section}>
          <Text style={styles.heading}>مفتاح الإجابات</Text>
          <View style={styles.table}>
            {questions.map((q, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 0.25 }]}>{i + 1}</Text>
                <Text style={styles.tableCell}>{String(q.correct_answer ?? "")}</Text>
              </View>
            ))}
          </View>
        </View>

        <PdfFooter />
      </Page>
    </Document>
  );
}

function StudyPlanPDF({ data, title, styles }: PdfProps) {
  const schedule = asRecordArray(data.daily_schedule);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>

        {schedule.map((day, i) => {
          const tasks = asRecordArray(day.tasks);
          return (
            <View key={i} style={styles.section}>
              <Text style={styles.heading}>{String(day.day ?? `اليوم ${i + 1}`)}</Text>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.header]}>
                  <Text style={styles.tableCell}>المادة</Text>
                  <Text style={styles.tableCell}>الموضوع</Text>
                  <Text style={[styles.tableCell, { flex: 0.4 }]}>المدة</Text>
                  <Text style={[styles.tableCell, { flex: 0.4 }]}>الأولوية</Text>
                </View>
                {tasks.map((task, j) => (
                  <View key={j} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{String(task.subject ?? "")}</Text>
                    <Text style={styles.tableCell}>{String(task.topic ?? "")}</Text>
                    <Text style={[styles.tableCell, { flex: 0.4 }]}>
                      {String(task.duration_minutes ?? "")} د
                    </Text>
                    <Text style={[styles.tableCell, { flex: 0.4 }]}>
                      {String(task.priority ?? "")}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <PdfFooter />
      </Page>
    </Document>
  );
}

function FlashcardsPDF({ data, title, styles }: PdfProps) {
  const cards = asRecordArray(data.cards ?? data.flashcards);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        {cards.map((card, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.heading}>بطاقة {i + 1}: {String(card.front ?? card.question ?? "")}</Text>
            <Text style={styles.text}>{String(card.back ?? card.answer ?? "")}</Text>
          </View>
        ))}
        <PdfFooter />
      </Page>
    </Document>
  );
}

async function generatePDF(options: GenerateFileOptions): Promise<FileResult> {
  const { title, data, studentName, subject } = options;
  const fontFamily = await ensurePdfFont();
  const styles = buildPdfStyles(fontFamily);

  const props: PdfProps = { data, title, studentName, subject, styles };

  let doc: React.ReactElement<DocumentProps>;
  switch (options.content) {
    case "quiz":
      doc = <QuizPDF {...props} />;
      break;
    case "study_plan":
      doc = <StudyPlanPDF {...props} />;
      break;
    case "flashcards":
      doc = <FlashcardsPDF {...props} />;
      break;
    case "summary":
    case "report":
    default:
      doc = <SummaryPDF {...props} />;
      break;
  }

  const buffer = await renderToBuffer(doc);

  return {
    buffer: Buffer.from(buffer),
    filename: `${sanitizeFilename(title)}.pdf`,
    mimeType: FILE_MIME_TYPES.pdf,
    size: buffer.length,
  };
}

// ============================================
// 2. Word — باستخدام docx
// ============================================
function rtlParagraph(text: string, opts: { bold?: boolean; size?: number; bullet?: boolean; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] } = {}): Paragraph {
  const run = new TextRun({
    text,
    font: "Arial",
    size: opts.size ?? 24,
    bold: opts.bold,
    rightToLeft: true,
  });
  return new Paragraph({
    children: [run],
    heading: opts.heading,
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    bullet: opts.bullet ? { level: 0 } : undefined,
    spacing: { after: 120 },
  });
}

async function generateDOCX(options: GenerateFileOptions): Promise<FileResult> {
  const { title, data, studentName } = options;

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: title, font: "Arial", rightToLeft: true, bold: true, size: 44 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
    }),
    rtlParagraph(
      studentName ? `${BRAND_NOTE} — إعداد: ${studentName}` : BRAND_NOTE,
      { size: 20 }
    ),
  ];

  const keyPoints = asStringArray(data.key_points);
  if (keyPoints.length) {
    children.push(rtlParagraph("النقاط الرئيسية", { heading: HeadingLevel.HEADING_1, bold: true }));
    keyPoints.forEach((point) => children.push(rtlParagraph(point, { bullet: true })));
  }

  const concepts = asRecordArray(data.concepts);
  if (concepts.length) {
    children.push(rtlParagraph("المفاهيم الأساسية", { heading: HeadingLevel.HEADING_1, bold: true }));
    concepts.forEach((concept) => {
      children.push(rtlParagraph(String(concept.term ?? ""), { bold: true }));
      children.push(rtlParagraph(String(concept.definition ?? "")));
    });
  }

  const sections = asRecordArray(data.sections);
  sections.forEach((section) => {
    children.push(
      rtlParagraph(String(section.heading ?? section.title ?? ""), { heading: HeadingLevel.HEADING_1, bold: true })
    );
    children.push(rtlParagraph(String(section.body ?? section.content ?? "")));
  });

  const questions = asRecordArray(data.questions);
  if (questions.length) {
    children.push(rtlParagraph("الأسئلة", { heading: HeadingLevel.HEADING_1, bold: true }));
    questions.forEach((q, i) => {
      children.push(rtlParagraph(`${i + 1}. ${String(q.question ?? "")}`, { bold: true }));
      asStringArray(q.options).forEach((opt, j) =>
        children.push(rtlParagraph(`     ${["أ", "ب", "ج", "د"][j] ?? "•"} ${opt}`))
      );
      children.push(rtlParagraph(`الإجابة الصحيحة: ${String(q.correct_answer ?? "")}`, { size: 20 }));
    });
  }

  const schedule = asRecordArray(data.daily_schedule);
  if (schedule.length) {
    children.push(rtlParagraph("خطة المذاكرة", { heading: HeadingLevel.HEADING_1, bold: true }));
    schedule.forEach((day) => {
      children.push(rtlParagraph(String(day.day ?? ""), { bold: true }));
      asRecordArray(day.tasks).forEach((task) => {
        children.push(
          rtlParagraph(
            `${String(task.subject ?? "")} — ${String(task.topic ?? "")} (${String(task.duration_minutes ?? "")} دقيقة، أولوية ${String(task.priority ?? "")})`,
            { bullet: true }
          )
        );
      });
    });
  }

  const cards = asRecordArray(data.cards ?? data.flashcards);
  if (cards.length) {
    children.push(rtlParagraph("بطاقات المراجعة", { heading: HeadingLevel.HEADING_1, bold: true }));
    cards.forEach((card, i) => {
      children.push(rtlParagraph(`${i + 1}. ${String(card.front ?? card.question ?? "")}`, { bold: true }));
      children.push(rtlParagraph(String(card.back ?? card.answer ?? ""), { bullet: true }));
    });
  }

  const doc = new DocxDocument({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  return {
    buffer,
    filename: `${sanitizeFilename(title)}.docx`,
    mimeType: FILE_MIME_TYPES.docx,
    size: buffer.length,
  };
}

// ============================================
// 3. Excel — باستخدام SheetJS
// ============================================
async function generateXLSX(options: GenerateFileOptions): Promise<FileResult> {
  const { title, data } = options;

  const wb = XLSX.utils.book_new();
  let hasSheet = false;

  const questions = asRecordArray(data.questions);
  if (questions.length) {
    const rows = questions.map((q, i) => ({
      "#": i + 1,
      "السؤال": q.question,
      "الاختيارات": asStringArray(q.options).join(" | "),
      "الإجابة الصحيحة": q.correct_answer,
      "الشرح": q.explanation ?? "",
      "الصعوبة": q.difficulty ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 50 }, { wch: 45 }, { wch: 20 }, { wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "الأسئلة");
    hasSheet = true;
  }

  const schedule = asRecordArray(data.daily_schedule);
  if (schedule.length) {
    const rows: Record<string, unknown>[] = [];
    schedule.forEach((day) => {
      asRecordArray(day.tasks).forEach((task) => {
        rows.push({
          "اليوم": day.day,
          "المادة": task.subject,
          "الموضوع": task.topic,
          "المدة (دقيقة)": task.duration_minutes,
          "الأولوية": task.priority,
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "خطة المذاكرة");
    hasSheet = true;
  }

  const cards = asRecordArray(data.cards ?? data.flashcards);
  if (cards.length) {
    const rows = cards.map((card, i) => ({
      "#": i + 1,
      "الوجه (السؤال)": card.front ?? card.question,
      "الظهر (الإجابة)": card.back ?? card.answer,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 50 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws, "بطاقات المراجعة");
    hasSheet = true;
  }

  const keyPoints = asStringArray(data.key_points);
  if (!hasSheet && keyPoints.length) {
    const rows = keyPoints.map((point, i) => ({ "#": i + 1, "النقطة": point }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws, "الملخص");
    hasSheet = true;
  }

  if (!hasSheet) {
    // ورقة فارغة مهيكلة بدل الفشل — البيانات المدخلة مالهاش شكل جدول معروف
    const ws = XLSX.utils.aoa_to_sheet([[title], [], ["لا توجد بيانات جدولية في المدخلات"]]);
    XLSX.utils.book_append_sheet(wb, ws, "بيانات");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return {
    buffer,
    filename: `${sanitizeFilename(title)}.xlsx`,
    mimeType: FILE_MIME_TYPES.xlsx,
    size: buffer.length,
  };
}

// ============================================
// 4. PowerPoint — باستخدام pptxgenjs
// ============================================
async function generatePPTX(options: GenerateFileOptions): Promise<FileResult> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const { title, data, studentName, subject } = options;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.rtlMode = true;
  pptx.title = title;

  const DARK_BG = "0F172A";
  const ACCENT = "7C3AED";

  // شريحة العنوان
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: DARK_BG };
  titleSlide.addText(title, {
    x: 0.5, y: 2.2, w: 12.3, h: 1.6,
    fontSize: 36, bold: true, color: "F8FAFC", align: "center",
    rtlMode: true, fontFace: "Arial",
  });
  titleSlide.addText(
    [subject ? `المادة: ${subject}` : "", studentName ? `إعداد: ${studentName}` : "", BRAND_NOTE]
      .filter(Boolean)
      .join("  •  "),
    {
      x: 0.5, y: 4.0, w: 12.3, h: 0.8,
      fontSize: 16, color: "C4B5FD", align: "center", rtlMode: true, fontFace: "Arial",
    }
  );

  const addBulletSlide = (heading: string, bullets: string[]) => {
    if (!bullets.length) return;
    const slide = pptx.addSlide();
    slide.background = { color: DARK_BG };
    slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: ACCENT } });
    slide.addText(heading, {
      x: 0.4, y: 0.15, w: 12.5, h: 0.8,
      fontSize: 24, bold: true, color: "FFFFFF", align: "right", rtlMode: true, fontFace: "Arial",
    });
    slide.addText(
      bullets.map((b) => ({ text: b, options: { bullet: { code: "25CF" }, paraSpaceAfter: 12, rtlMode: true } })),
      {
        x: 0.6, y: 1.4, w: 12.1, h: 5.6,
        fontSize: 18, color: "E2E8F0", align: "right", rtlMode: true, fontFace: "Arial",
        valign: "top",
      }
    );
  };

  const keyPoints = asStringArray(data.key_points);
  if (keyPoints.length) addBulletSlide("النقاط الرئيسية", keyPoints);

  const concepts = asRecordArray(data.concepts);
  if (concepts.length) {
    addBulletSlide(
      "المفاهيم الأساسية",
      concepts.map((c) => `${String(c.term ?? "")}: ${String(c.definition ?? "")}`)
    );
  }

  const sections = asRecordArray(data.sections);
  sections.forEach((section) => {
    const body = String(section.body ?? section.content ?? "");
    addBulletSlide(String(section.heading ?? section.title ?? "قسم"), [body]);
  });

  const questions = asRecordArray(data.questions);
  questions.forEach((q, i) => {
    const options = asStringArray(q.options);
    addBulletSlide(`سؤال ${i + 1}: ${String(q.question ?? "")}`, [
      ...options.map((opt, j) => `${["أ", "ب", "ج", "د"][j] ?? "•"} ${opt}`),
      `الإجابة الصحيحة: ${String(q.correct_answer ?? "")}`,
    ]);
  });

  const schedule = asRecordArray(data.daily_schedule);
  if (schedule.length) {
    addBulletSlide(
      "خطة المذاكرة",
      schedule.map(
        (day) =>
          `${String(day.day ?? "")}: ` +
          asRecordArray(day.tasks)
            .map((t) => `${String(t.subject ?? "")} (${String(t.duration_minutes ?? "")} د)`)
            .join("، ")
      )
    );
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

  return {
    buffer,
    filename: `${sanitizeFilename(title)}.pptx`,
    mimeType: FILE_MIME_TYPES.pptx,
    size: buffer.length,
  };
}

// ============================================
// 5. الدالة الرئيسية
// ============================================
export async function generateFile(options: GenerateFileOptions): Promise<FileResult> {
  switch (options.type) {
    case "pdf":
      return generatePDF(options);
    case "docx":
      return generateDOCX(options);
    case "xlsx":
      return generateXLSX(options);
    case "pptx":
      return generatePPTX(options);
    default:
      throw new Error(`نوع الملف غير مدعوم: ${options.type}`);
  }
}
