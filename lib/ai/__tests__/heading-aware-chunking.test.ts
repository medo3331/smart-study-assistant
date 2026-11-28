/**
 * 🧱 التقسيم الوعي بالعناوين + الـ overlap — حزمة (أ)
 *
 * ════ ليه الاختبارات دي مهمة ════
 * التقسيم القديم كان بيقطّع «بالشريط»: أي نص أطول من الحد بيتقطع عند أول
 * فاصل بعد الحد — فموضوعين مختلفين بيدخلوا في قطعة واحدة، وسؤال آخر قطعة
 * بيجاوب عليه الموديل من غير سياقه. التحديثات هنا بتثبّت:
 * 1. القطع عند العناوين (الفصل/الباب/Chapter/…) والعنوان بيفضل مع جسمه.
 * 2. الدمج الجشع للأقسام الصغيرة — ملازمة عناوينها كتير ماتنفجرش عدد قطعها.
 * 3. الـ overlap بين القطع المتتالية **داخل الحد** — مفيش قطعة بتتجاوز max.
 * 4. مافيش نص بيضيع (الـ overlap زيادة مش نقص — شوف عقد `lecture-analysis`).
 */

import { describe, it, expect } from "vitest";

import { chunkTranscript } from "../lecture-prompts";
import {
  isHeadingLine,
  splitHeadingSections,
  unwrapHardWraps,
  sentenceSuffixForOverlap,
} from "../../text-structure";
import { docxHtmlToText } from "../../extract-text";

/* ════════════════════════════ isHeadingLine ═══════════════════════════ */

describe("isHeadingLine — كشف العناوين (محافظ عمداً)", () => {
  it("✅ عناوين واضحة", () => {
    expect(isHeadingLine("# الفصل الأول: الدوائر")).toBe(true);
    expect(isHeadingLine("الفصل الثاني: المكثفات")).toBe(true);
    expect(isHeadingLine("الباب الثالث")).toBe(true);
    expect(isHeadingLine("المحاضرة الخامسة")).toBe(true);
    expect(isHeadingLine("Chapter 3: Limits")).toBe(true);
    expect(isHeadingLine("UNIT 2")).toBe(true);
    expect(isHeadingLine("CARDIOVASCULAR SYSTEM")).toBe(true);
  });

  it("⛔ سطر جملة عادية — حتى لو بيبدأ بكلمة مفتاحية", () => {
    // نفس الكلمة المفتاحية بس سطر جملة كاملة بينتهي بنقطة → مش عنوان.
    expect(isHeadingLine("المحاضرة دي بتبدأ بشرح الدوائر الكهربية.")).toBe(false);
    expect(isHeadingLine("الفصل اللي فات اتكلم عن المقاومات، ودلوقتي هندخل في التفاصيل.")).toBe(false);
  });

  it("⛔ سطور القوائم والسطور الطويلة", () => {
    expect(isHeadingLine("- نقطة من قائمة")).toBe(false);
    expect(isHeadingLine("1. عنصر مرقّم")).toBe(false);
    // كلمة مفتاحية بس السطر أطول من حد العناوين.
    expect(isHeadingLine(`${"الفصل هو".repeat(30)} طويل جداً`)).toBe(false);
    expect(isHeadingLine("الفصل الأول من المحاضرة اللي فاتت وشرحنا فيها كل حاجة بالتفصيل الممل")).toBe(false);
  });
});

/* ════════════════════════════ unwrapHardWraps ═══════════════════════════ */

describe("unwrapHardWraps — فك الكسر البصري لسطور الـ PDF", () => {
  it("✅ بيجمع سطور الجملة المكسورة في سطر واحد", () => {
    const broken = "الخلية هي الوحدة\nالأساسية للحياة. وتحتوي\nالخلية على نواة.";
    expect(unwrapHardWraps(broken)).toBe(
      "الخلية هي الوحدة الأساسية للحياة. وتحتوي الخلية على نواة.",
    );
  });

  it("✅ بيفصل بين الفقرات ومابيلمسش العناوين والقوائم", () => {
    const text = [
      "سطر مش منتهي بعلامة",
      "وكمّل هنا.",
      "",
      "الفصل الأول",
      "نص القسم.",
      "- عنصر قائمة",
      "تاني سطر مش منتهي",
    ].join("\n");

    const result = unwrapHardWraps(text);
    // العنوان والقائمة ماتبقوش ملزوقة في اللي قبلهم/بعدهم.
    expect(result).toContain("\nالفصل الأول\n");
    expect(result).toContain("\n- عنصر قائمة\n");
  });

  it("✅ مافيش تغيير لما النص فقرات سليمة", () => {
    const clean = "جملة كاملة أولى.\n\nجملة كاملة تانية.";
    expect(unwrapHardWraps(clean)).toBe(clean);
  });
});

/* ════════════════════════════ sentenceSuffixForOverlap ═══════════════════════════ */

describe("sentenceSuffixForOverlap — ذيل جمل كاملة داخل الميزانية", () => {
  it("✅ بيرجّع آخر جمل كاملة ≤ الميزانية (ملزوقة بـ `\n` زي الكاسكاد)", () => {
    const text = "الجملة الأولى شرح كافي. الجملة التانية شرح كافي كمان. الأخيرة خلاصة.";
    const suffix = sentenceSuffixForOverlap(text, 50);

    expect(suffix.length).toBeLessThanOrEqual(50);
    expect(suffix).toBe("الجملة التانية شرح كافي كمان.\nالأخيرة خلاصة.");
  });

  it("⛔ ميزانية أصغر من جملة واحدة → فاضي (مابيقصّش جملة في نصها)", () => {
    expect(sentenceSuffixForOverlap("جملة واحدة طويلة نسبياً هنا.", 10)).toBe("");
  });
});

/* ════════════════════════════ chunkTranscript — العناوين ═══════════════════════════ */

/** جسم قسم بحجم محدد — جمل كاملة عشان الـ cascade لو اشتغل مايكسرش حاجة. */
function sectionBody(chars: number, seed: number): string {
  const sentence = `النقطة رقم ${seed} من محاضرة Operations Research مشروحة بالتفصيل. `;
  let body = "";
  while (body.length < chars) body += sentence;
  return body.slice(0, chars);
}

describe("chunkTranscript — التقسيم الوعي بالعناوين", () => {
  it("✅ كل قسم كبير بيبدأ قطعته بعنوانه", () => {
    const headings = ["الفصل الأول: الدوائر", "الفصل الثاني: المكثفات", "الفصل الثالث: الترانزستور"];
    const text = headings
      .map((heading, i) => `${heading}\n${sectionBody(2_600, i)}`)
      .join("\n\n");

    const chunks = chunkTranscript(text, 4_000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4_000);
    }
    // كل قطعة بتبدأ بعنوان (أول عنوانين ممكن يتلزقوا لو الأقسام صغيرة —
    // هنا الأقسام أكبر من نص الحد فمافيش دمج ممكن).
    for (const heading of headings) {
      expect(chunks.some((chunk) => chunk.startsWith(heading))).toBe(true);
    }
  });

  it("✅ الملازمة اللي عناوينها كتير وصغيرة ماتنفجرش عدد قطعها (دمج جشع)", () => {
    // 40 قسم صغير ≈ 2,400 حرف إجمالي — لو كل قسم بقى قطعة كان هنعمل
    // 40 نداء موديل؛ الدمج الجشع لازم يلمهم في قطعة واحدة (≤ الحد).
    const tiny = Array.from(
      { length: 40 },
      (_, i) => `القسم رقم ${i + 1}\nنقطة صغيرة رقم ${i + 1} بتشرح فكرة مستقلة.`,
    ).join("\n\n");

    const chunks = chunkTranscript(tiny, 6_000);

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("القسم رقم 1");
    expect(chunks[0]).toContain("القسم رقم 40");
  });

  it("✅ عنوان مش بيتفرّط عن جسمه — العنوان أول سطر في قطعته حتى مع دمج", () => {
    const text = [
      "المقدمة",
      sectionBody(700, 1),
      "الفصل الأول: الأساسيات",
      sectionBody(700, 2),
      "الفصل الثاني: التطبيقات",
      sectionBody(700, 3),
    ].join("\n\n");

    const chunks = chunkTranscript(text, 2_000);

    // 2,100 حرف إجمالي > الحد ⇒ هيقسم، والقطع بتتبني عند العناوين.
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const firstLine = chunk.split("\n")[0];
      expect(isHeadingLine(firstLine) || chunk === chunks[0]).toBe(true);
    }
  });

  it("✅ تفريغ من غير عناوين بيتقسم بالكاسكاد القديم — أول قطعة بتبدأ بجملة", () => {
    const sentences = Array.from(
      { length: 60 },
      (_, i) => `النقطة رقم ${i} من المحاضرة explained clearly.`,
    );
    const chunks = chunkTranscript(sentences.join(" "), 400);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.trim()).toMatch(/^النقطة/);
      expect(chunk.length).toBeLessThanOrEqual(400);
    }
  });

  it("✅ الـ overlap: كل قطعة (عدا الأولى) بتبدأ بذيل من القطعة اللي قبلها", () => {
    const text = sectionBody(1_800, 1) + "\n\n" + sectionBody(1_800, 2);
    const chunks = chunkTranscript(text, 1_000);

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i += 1) {
      const firstLine = chunks[i].split("\n")[0];
      // الـ overlap = جمل كاملة من آخر القطعة السابقة — موجودة حرفياً فيها.
      expect(chunks[i - 1]).toContain(firstLine);
    }
  });

  it("✅ الـ overlap مابيزودش فوق الحد — القطعة مع سياقها ≤ max", () => {
    const text = sectionBody(1_800, 1) + "\n\n" + sectionBody(1_800, 2);
    const max = 1_000;
    const chunks = chunkTranscript(text, max);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(max);
    }
  });
});

/* ════════════════════════════ splitHeadingSections ═══════════════════════════ */

describe("splitHeadingSections — العنوان بيفضل مع جسمه", () => {
  it("✅ بيقصّ عند العناوين والنص قبل أول عنوان قسم مستقل", () => {
    const text = [
      "جملة تمهيدية قبل أي عنوان.",
      "الفصل الأول: أ",
      "نص القسم الأول.",
      "الفصل الثاني: ب",
      "نص القسم الثاني.",
    ].join("\n");

    const sections = splitHeadingSections(text);

    expect(sections).toHaveLength(3);
    expect(sections[0]).toBe("جملة تمهيدية قبل أي عنوان.");
    expect(sections[1].startsWith("الفصل الأول: أ")).toBe(true);
    expect(sections[2].startsWith("الفصل الثاني: ب")).toBe(true);
  });

  it("✅ نص من غير عناوين = قسم واحد", () => {
    expect(splitHeadingSections("سطر.\nسطر تاني.")).toHaveLength(1);
  });
});

/* ════════════════════════════ docxHtmlToText ═══════════════════════════ */

describe("docxHtmlToText — عناوين DOCX الحقيقية بتفضل موجودة", () => {
  it("✅ العناوين بتتشاور بـ `#` والفقرات بنفس بنية extractRawText", () => {
    const html =
      "<h1>الفصل الأول</h1><p>نص القسم الأول.</p><h2>مقدمة فرعية</h2><p>نص فرعي.</p>";

    expect(docxHtmlToText(html)).toBe(
      "# الفصل الأول\n\nنص القسم الأول.\n\n# مقدمة فرعية\n\nنص فرعي.",
    );
  });

  it("✅ الـ entities بتتفك والتاجات الداخلية (strong/em) بتتشال", () => {
    const html =
      "<p>المقاومة &amp; الجهد &lt;حد أعلى&gt;</p><p><strong>قانون أوم</strong> مهم.</p>";

    expect(docxHtmlToText(html)).toBe(
      "المقاومة & الجهد <حد أعلى>\n\nقانون أوم مهم.",
    );
  });

  it("✅ الفقرات الفاضية بتترمي", () => {
    expect(docxHtmlToText("<p></p><p>نص.</p><p>   </p>")).toBe("نص.");
  });
});
