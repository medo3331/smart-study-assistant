// اختبار extractOutline — تشتغل على المصدرين: cited_explanation و markdown الأوضاع.
import { describe, it, expect } from "vitest";
import { extractOutline, extractMarkdownHeadings, outlineSectionId } from "@/lib/lesson/outline";

describe("extractMarkdownHeadings", () => {
  it("بيستخرج عناوين ## بس (مش ### ولا نص عادي)", () => {
    const md = "مقدمة\n## القسم الأول\nنص\n### فرعي\n## القسم الثاني\n- نقطة";
    expect(extractMarkdownHeadings(md)).toEqual(["القسم الأول", "القسم الثاني"]);
  });

  it("بيرجّع [] لمدخلات فاضية/غير نصية", () => {
    expect(extractMarkdownHeadings(null)).toEqual([]);
    expect(extractMarkdownHeadings("")).toEqual([]);
    expect(extractMarkdownHeadings("لا توجد عناوين هنا")).toEqual([]);
  });
});

describe("outlineSectionId", () => {
  it("ثابت لنفس العنوان وبيطبّع المسافات والترقيم", () => {
    expect(outlineSectionId("طبقة النقل", 2)).toBe(outlineSectionId("طبقة النقل", 2));
    expect(outlineSectionId("  طبقة  النقل! ", 0)).toBe(outlineSectionId("طبقة-النقل", 0));
    expect(outlineSectionId("###", 3)).toBe("sec-3-section");
  });
});

describe("extractOutline", () => {
  it("بيرجّع أقسام الشرح المبني على التفريغ الأول", () => {
    const out = extractOutline({
      cited: { sections: [{ heading: "المقدمة" }, { heading: "طبقة النقل" }] },
      modes: { simple: "## من الماركداون" },
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ heading: "المقدمة", source: "cited" });
    expect(out[1].source).toBe("cited");
  });

  it("بيتجاهل العناوين المكررة والفاضية في cited", () => {
    const out = extractOutline({
      cited: { sections: [{ heading: "المقدمة" }, { heading: "المقدمة" }, { heading: "  " }] },
    });
    expect(out).toHaveLength(1);
  });

  it("بيرجّع عناوين ## من الأوضاع لما مفيش cited — بأولوية simple", () => {
    const out = extractOutline({
      modes: {
        simple: "## الشرح الأساسي\nنص",
        academic: "## الأكاديمي",
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ heading: "الشرح الأساسي", source: "markdown" });
  });

  it("بيرجّع [] لو مفيش أي مصدر", () => {
    expect(extractOutline({})).toEqual([]);
    expect(extractOutline({ cited: { sections: [] }, modes: { simple: "نص بدون عناوين" } })).toEqual([]);
  });
});
