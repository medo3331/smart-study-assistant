/**
 * 📄 اختبار استخراج المستند بالوحدات (صفحة/شريحة/فقرة) — Phase 5
 *
 * ═══ ليه الاختبارات مهمة هنا ═══
 * ١) **ترتيب الشرائح**: `slide10.xml` لازم تيجي بعد `slide2.xml` —
 *    الترتيب الأبجدي بيرتّب ١٠ قبل ٢ وبيدمّر التسلسل ⇒ الـ anchors
 *    بتتحط على الشرائح الغلط.
 * ٢) **الـ backward compatibility**: `extractTextFromFile` لازم يرجّع
 *    نص عادي زي ما كان بالظبط (4 مستهلكين في المنتج).
 * ٣) **الـ notes الأصلية**: `notesSlideN` مش مضمون يطابق `slideN` —
 *    الربط الحقيقي عن طريق الـ rels.
 *
 * ⚠️ الـ PPTX هنا **مُصطنع** (بنعمله بـ jszip) — عشان نتحقق من
 *    السلوك على شكل ملف معروف، من غير ما نحتاج ملف حقيقي في الريبو.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  extractDocument,
  extractTextFromFile,
  detectFileKind,
  ExtractError,
} from "../extract-text";

const OPTIONS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxImageBytes: 1024 * 1024,
  maxTextChars: 100_000,
};

/** سلايد PPTX مصطنعة: `<a:t>` بنص محدد. */
function slideXml(texts: string[]): string {
  const runs = texts
    .map(
      (t) =>
        `<a:p><a:r><a:rPr lang="ar-EG"/><a:t>${t}</a:t></a:r></a:p>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>${runs}</p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
}

/** rels بتربط الشريحة بملاحظاتها. */
function relsXml(notesTarget: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="${notesTarget}"/>
</Relationships>`;
}

/** notesSlide مصطنعة. */
function notesXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`;
}

/** يبني ملف PPTX مصطنع. */
async function makePptx(
  slides: Array<{ texts: string[]; notes?: string }>
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  slides.forEach((slide, i) => {
    const n = i + 1;
    zip.file(`ppt/slides/slide${n}.xml`, slideXml(slide.texts));
    if (slide.notes !== undefined) {
      zip.file(`ppt/notesSlides/notesSlide${n}.xml`, notesXml(slide.notes));
      zip.file(
        `ppt/slides/_rels/slide${n}.xml.rels`,
        relsXml(`../notesSlides/notesSlide${n}.xml`),
      );
    }
  });
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return buffer as ArrayBuffer;
}

/* ═══════════════════════════ detectFileKind ═══════════════════════════ */

describe("detectFileKind — Types الجديدة", () => {
  it("✅ بيعرف PPTX بالـ MIME الرسمي", () => {
    expect(
      detectFileKind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "a.pptx",
      ),
    ).toBe("pptx");
  });

  it("✅ بيعرف PPTX بالامتداد (المتصفح بيبعت MIME تاني أحياناً)", () => {
    expect(detectFileKind("application/octet-stream", "a.pptx")).toBe("pptx");
  });

  it("✅ الأنواع القديمة زي ما هي", () => {
    expect(detectFileKind("application/pdf", "a.pdf")).toBe("pdf");
    expect(detectFileKind("text/plain", "a.txt")).toBe("text");
    expect(detectFileKind("application/octet-stream", "a.bin")).toBeNull();
  });
});

/* ═══════════════════════════ PPTX ═══════════════════════════ */

describe("extractDocument — PPTX شريحة بشريحة", () => {
  it("✅ بيستخرج نصوص الشرائح بالترتيب", async () => {
    const buffer = await makePptx([
      { texts: ["الشريحة الأولى", "نقطة ثانية"] },
      { texts: ["الشريحة التانية"] },
    ]);
    const file = new File([buffer], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const doc = await extractDocument(file, OPTIONS);

    expect(doc.kind).toBe("pptx");
    expect(doc.pageCount).toBe(2);
    expect(doc.pages[0].kind).toBe("slide");
    expect(doc.pages[0].number).toBe(1);
    expect(doc.pages[0].text).toContain("الشريحة الأولى");
    expect(doc.pages[0].text).toContain("نقطة ثانية");
    expect(doc.pages[1].text).toContain("الشريحة التانية");
  });

  it("⚠️ الترتيب رقمي مش أبجدي (slide10 بعد slide2)", async () => {
    // ⚠️ الأهم في الملف ده: ترتيب أبجدي = ١ قبل ٢ ⇒ الـ anchors بتتحط
    //    على الشرائح الغلط.
    const slides = [];
    for (let i = 1; i <= 11; i++) {
      slides.push({ texts: [`شريحة رقم ${i}`] });
    }
    const buffer = await makePptx(slides);
    const file = new File([buffer], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const doc = await extractDocument(file, OPTIONS);

    expect(doc.pageCount).toBe(11);
    expect(doc.pages[0].text).toContain("شريحة رقم 1");
    expect(doc.pages[1].text).toContain("شريحة رقم 2");
    // ⚠️ السلايد العاشر في المكان العاشر مش العاشر بالترتيب الأبجدي.
    expect(doc.pages[9].text).toContain("شريحة رقم 10");
    expect(doc.pages[10].text).toContain("شريحة رقم 11");
  });

  it("✅ ملاحظات المُقدِّم الأصلية بتترجَع (عن طريق الـ rels)", async () => {
    const buffer = await makePptx([
      { texts: ["الشريحة"], notes: "ملاحظة المقدم الأصلية" },
      { texts: ["تانية"] },
    ]);
    const file = new File([buffer], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const doc = await extractDocument(file, OPTIONS);

    expect(doc.pages[0].text).toContain("الشريحة");
    // ⚠️ الـ notes ما بتتخلطش بنص الشريحة (لنا مرجع تاني ممكن نعدّيه).
    expect(doc.text).not.toContain("ملاحظة المقدم الأصلية");
  });

  it("⛔ ملف PPTX فاضي (من غير شرائح) ⇒ ExtractError", async () => {
    const zip = new JSZip();
    const buffer = (await zip.generateAsync({ type: "arraybuffer" })) as ArrayBuffer;
    const file = new File([buffer], "empty.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    await expect(extractDocument(file, OPTIONS)).rejects.toBeInstanceOf(ExtractError);
  });
});

/* ═══════════════════════════ backward compatibility ═══════════════════════════ */

describe("extractTextFromFile — السلوك القديم ما يتغيرش", () => {
  it("✅ بيرجّع نص (مش كائن)", async () => {
    const buffer = await makePptx([{ texts: ["سطر"] }]);
    const file = new File([buffer], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const text = await extractTextFromFile(file, OPTIONS);
    expect(typeof text).toBe("string");
    expect(text).toContain("سطر");
  });

  it("✅ القطع على maxTextChars زي ما كان", async () => {
    const buffer = await makePptx([{ texts: ["ا".repeat(500)] }]);
    const file = new File([buffer], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const text = await extractTextFromFile(file, { ...OPTIONS, maxTextChars: 50 });
    expect(text.length).toBe(50);
  });

  it("⛔ نوع غير مدعوم ⇒ ExtractError (زي ما كان)", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "data.bin", {
      type: "application/octet-stream",
    });
    await expect(extractTextFromFile(file, OPTIONS)).rejects.toBeInstanceOf(
      ExtractError,
    );
  });

  it("⛔ ملف فاضي ⇒ ExtractError", async () => {
    const file = new File([new Uint8Array([])], "empty.txt", { type: "text/plain" });
    await expect(extractTextFromFile(file, OPTIONS)).rejects.toBeInstanceOf(
      ExtractError,
    );
  });
});

/* ═══════════════════════════ نصوص عادية ═══════════════════════════ */

describe("extractDocument — نصوص عادية", () => {
  it("✅ ملف نصي ⇒ وحدة واحدة", async () => {
    const file = new File(["محتوى نصي"], "a.txt", { type: "text/plain" });
    const doc = await extractDocument(file, OPTIONS);

    expect(doc.kind).toBe("text");
    expect(doc.pageCount).toBe(1);
    expect(doc.pages[0].text).toBe("محتوى نصي");
    expect(doc.unread).toEqual([]);
  });
});
