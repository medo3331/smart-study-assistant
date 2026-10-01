/**
 * 📄 اختبار تحليل Markdown للمستندات + التصدير
 *
 * ⚠️ مافيش أي نداء شبكة ولا AI. الـ PDF بيستخدم خط من CDN وقت التشغيل،
 *    فاختبارات PDF هنا بتتحقق من **الـ AST** و**السلوك**، ومن الـ DOCX
 *    (بينتج 100% محليًا) بيتحقق من إنه ملف OOXML صالح فعلاً.
 */

import { describe, it, expect } from "vitest";

import { blocksToPlainText, parseInline, parseMarkdown } from "../markdown-doc";
import { safeExportFilename } from "../lecture-document";

/* ═══════════════ inline ═══════════════ */

describe("parseInline", () => {
  it("يفصل الغامق", () => {
    const [first, second] = parseInline("الهدف **تعظيم الربح** بدقة");
    expect(first.text).toContain("الهدف");
    expect(second.text).toBe("تعظيم الربح");
    expect(second.marks).toContain("bold");
  });

  it("يفصل المائل", () => {
    const parts = parseInline("نص *مائل* هنا");
    expect(parts.some((p) => p.marks.includes("italic"))).toBe(true);
  });

  it("يفصل الكود_INLINE عن التنسيق", () => {
    const parts = parseInline("خوارزمية `O(n log n)` مهمة");
    const code = parts.find((p) => p.marks.includes("code"));
    expect(code?.text).toBe("O(n log n)");
  });

  it("التنسيق المتداخل بيشتغل", () => {
    // ⚠️ ده اللي بيفشل لو استعملنا regex واحدة كبيرة.
    const parts = parseInline("**غامق فيه *مائل* جوه**");
    // ⬇️ لازم ندوّر على القطعة اللي فيها **الاتنين**، مش أول قطعة غامق
    //    (اللي ممكن تكون مجرد نص غامق عادي من غير تنسيق متداخل).
    const nested = parts.find((p) => p.marks.includes("bold") && p.marks.includes("italic"));
    expect(nested?.text).toBe("مائل");
  });

  it("الرابط الآمن بيتسجل", () => {
    const link = parseInline("[المصدر](https://example.com)").find((p) => p.href);
    expect(link?.href).toBe("https://example.com");
  });

  it("⛔ رابط javascript: بيتحوّل نص عادي", () => {
    const parts = parseInline("[اضغط](javascript:alert(1))");
    expect(parts.some((p) => p.href)).toBe(false);
  });

  it("النص العادي مابيتكسرش", () => {
    expect(parseInline("نص عادي").map((p) => p.text).join("")).toBe("نص عادي");
  });
});

/* ═══════════════ blocks ═══════════════ */

describe("parseMarkdown", () => {
  it("⛔ مافيش علامة Markdown ظاهرة في الناتج", () => {
    // ⚠️ الاختبار الأهم في الملف: الـ PDF/Word لازم يعرضوا «عنوان» مش «## عنوان».
    const md = "## مفهوم مهم\n\n**الخوارزمية** هي طريقة.\n\n- نقطة 1\n- نقطة 2";
    const text = blocksToPlainText(parseMarkdown(md));

    expect(text).toContain("مفهوم مهم");
    expect(text).toContain("الخوارزمية");
    expect(text).toContain("نقطة 1");
    // مافيش أي محرف تنسيق متبقّي.
    expect(text).not.toContain("##");
    expect(text).not.toContain("**");
  });

  it("العناوين بتبقى بعناوين حقيقية بمستويات", () => {
    const blocks = parseMarkdown("# كبير\n## متوسط");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ kind: "heading", level: 2 });
  });

  it("القائمة غير المرتبة", () => {
    const list = parseMarkdown("- أ\n- ب").find((b) => b.kind === "list");
    expect(list).toMatchObject({ kind: "list", ordered: false });
    if (list?.kind === "list") expect(list.items).toHaveLength(2);
  });

  it("القائمة المرتبة", () => {
    const list = parseMarkdown("1. أول\n2. ثاني").find((b) => b.kind === "list");
    expect(list).toMatchObject({ kind: "list", ordered: true });
    if (list?.kind === "list") expect(list.items).toHaveLength(2);
  });

  it("blockquote بيتجمّع لحد ما يخلص", () => {
    const quote = parseMarkdown("> سطر أول\n> سطر تاني\n\nنص عادي").find(
      (b) => b.kind === "quote",
    );
    expect(quote).toBeDefined();
    if (quote?.kind === "quote") expect(quote.blocks.length).toBeGreaterThan(0);
  });

  it("كود مشفّر بيتقرا كـ code مش فقرة", () => {
    const code = parseMarkdown("```ts\nconst x = 1;\n```").find((b) => b.kind === "code");
    expect(code).toMatchObject({ kind: "code", language: "ts" });
    if (code?.kind === "code") expect(code.text).toContain("const x = 1;");
  });

  it("محتوى الكود ما بيتفسّرش كـ Markdown", () => {
    // ⚠️ `# عنوان` جوه كود لازم يفضل حرفي.
    const code = parseMarkdown("```\n# ليس عنوانا\n```").find((b) => b.kind === "code");
    if (code?.kind === "code") expect(code.text).toContain("# ليس عنوانا");
  });

  it("الفاصل", () => {
    expect(parseMarkdown("أ\n\n---\n\nب").some((b) => b.kind === "hr")).toBe(true);
  });

  it("الجدول بيتقرا صفوف", () => {
    const table = parseMarkdown("| اسم | قيمة |\n|---|---|\n| أ | 1 |").find(
      (b) => b.kind === "table",
    );
    expect(table).toBeDefined();
    if (table?.kind === "table") {
      expect(table.header).toHaveLength(2);
      expect(table.rows).toHaveLength(1);
    }
  });

  it("⚠️ صيغة غير معروفة بتترجم لفقرة (مفيش فقدان محتوى)", () => {
    // أهم ضمانة للطالب: مفقدناش سطر من مذكرته.
    const blocks = parseMarkdown("سطر بصيغة غريبة ~~~ بس مهم");
    expect(blocksToPlainText(blocks)).toContain("مهم");
  });

  it("Markdown فاضي بيرجّع مصفوفة فاضية", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});
/* ═══════════════ أسماء الملفات ═══════════════ */

describe("safeExportFilename", () => {
  it("بيصطاف رموز مسار الملفات", () => {
    const name = safeExportFilename("../../etc/passwd", "pdf");
    expect(name).toBe("Magicly-etcpasswd-explanation.pdf");
  });

  it("بيشيل المحارف الخطرة في الاسم", () => {
    const name = safeExportFilename('محاضرة: "A/B"*?', "docx");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(name.endsWith(".docx")).toBe(true);
  });

  it("بيستخدم اسم احتياطي لو العنوان فاضي", () => {
    expect(safeExportFilename("", "pdf")).toBe("Magicly-lecture-explanation.pdf");
    expect(safeExportFilename("   ", "pdf")).toBe("Magicly-lecture-explanation.pdf");
    expect(safeExportFilename("...", "pdf")).toBe("Magicly-lecture-explanation.pdf");
  });
});

/* ═══════════════ DOCX حقيقي ═══════════════ */

describe("generateLectureDocx — ملف OOXML حقيقي", () => {
  it("بيرجّع buffer يبدأ بتوقيع ZIP (DD���", async () => {
    const { generateLectureDocx } = await import("../lecture-document");
    const result = await generateLectureDocx({
      title: "محاضرة الاختبار",
      explanation: "## عنوان\n\nمحتوى **غامق**.\n\n- نقطة",
    });

    // ⬇️ ملفات docx عبارة عن ZIP، والتوقيع أول 4 بايت: PK\x03\x04.
    expect(result.buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(result.buffer.length).toBeGreaterThan(500);
  });

  it("الـ mime type صح والامتداد صح", async () => {
    const { generateLectureDocx } = await import("../lecture-document");
    const result = await generateLectureDocx({ title: "x", explanation: "نص" });
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.filename.endsWith(".docx")).toBe(true);
  });

  it("الملف فيه مستند Word فعلي", async () => {
    const { generateLectureDocx } = await import("../lecture-document");
    const result = await generateLectureDocx({
      title: "محاضرة العمليات",
      explanation: "المتغير F(x) هو الافتراضي في التحسين.",
    });
    // ⬇️ أسماء المدخلات جوه ZIP بتتخزّن **من غير ضغط** في الـ header،
    // فبنلاقيها كنص. المحتوى نفسه مضغوط — وده سبب Reliance على
    // `unzip` في الاختبارات.
    const asLatin = result.buffer.toString("latin1");
    expect(asLatin).toContain("word/document.xml");
    expect(asLatin).toContain("[Content_Types].xml");
  });
});

/* ═══════════════ PDF ═══════════════ */

describe("generateLecturePdf", () => {
  it("مpections التوقيع: %PDF", async () => {
    const { generateLecturePdf } = await import("../lecture-document");
    const result = await generateLecturePdf({ title: "عنوان", explanation: "محتوى" });
    // ⬇️ لازم يبدأ بـ %PDF- — ده اللي بيخلّي المتصفح يفتحه كـ PDF.
    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filename.endsWith(".pdf")).toBe(true);
  });
});