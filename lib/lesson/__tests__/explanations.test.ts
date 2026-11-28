// اختبار محرك الشرح (P2) — الأوضاع الثلاثة + نظام الإصدارات.
import { describe, it, expect } from "vitest";
import {
  EXPLANATION_MODES,
  EXPLANATION_MODE_LABELS,
  isExplanationMode,
  withExplanationVersion,
  readExplanationVersions,
  collectExplanationVersions,
  explanationVersionsKey,
  MAX_EXPLANATION_VERSIONS,
} from "@/lib/lesson/explanations";

describe("أوضاع الشرح الثلاثة", () => {
  it("الأوضاع بالظبط: general / summary / detailed", () => {
    expect(EXPLANATION_MODES).toEqual(["general", "summary", "detailed"]);
    expect(EXPLANATION_MODE_LABELS.general).toBe("شرح عام");
    expect(EXPLANATION_MODE_LABELS.summary).toBe("شرح تلخيصي");
    expect(EXPLANATION_MODE_LABELS.detailed).toBe("شرح تفصيلي");
  });

  it("isExplanationMode بيرفض الأوضاع القديمة والقيم التالفة", () => {
    for (const mode of EXPLANATION_MODES) expect(isExplanationMode(mode)).toBe(true);
    expect(isExplanationMode("simple")).toBe(false);
    expect(isExplanationMode("academic")).toBe(false);
    expect(isExplanationMode(42)).toBe(false);
    expect(isExplanationMode(null)).toBe(false);
  });
});

describe("withExplanationVersion — إعادة التوليد بتحفظ إصدار جديد مش بتمسح القديم", () => {
  const meta = { generatedAt: "2025-01-01T00:00:00.000Z", model: "test-model" };

  it("أول توليد: مفيش إصدارات سابقة والإصدار = ١", () => {
    const result = withExplanationVersion({}, "general", "الشرح الأول", meta);
    expect(result.modes.general).toBe("الشرح الأول");
    expect(result.version).toBe(1);
    expect(result.replaced).toBeNull();
    expect(readExplanationVersions(result.modes, "general")).toEqual([]);
  });

  it("إعادة التوليد: القديم بيتنفد لقائمة الإصدارات + إصدار جديد = ٢", () => {
    let modes = withExplanationVersion({}, "summary", "الصياغة الأولى", meta).modes;
    const second = withExplanationVersion(modes, "summary", "الصياغة التانية", meta);
    modes = second.modes;
    expect(second.version).toBe(2);
    expect(modes.summary).toBe("الصياغة التانية");
    const versions = readExplanationVersions(modes, "summary");
    expect(versions).toHaveLength(1);
    expect(versions[0].text).toBe("الصياغة الأولى");
  });

  it("الوضعين مستقلين — إصدارات general ما تلمسش detailed", () => {
    let modes = withExplanationVersion({}, "general", "شرح عام ١", meta).modes;
    modes = withExplanationVersion(modes, "detailed", "تفصيلي ١", meta).modes;
    expect(readExplanationVersions(modes, "general")).toEqual([]);
    expect(modes.detailed).toBe("تفصيلي ١");
  });

  it("حد الإصدارات (MAX_EXPLANATION_VERSIONS) — الأقدم بيتشال", () => {
    let modes: Record<string, unknown> = {};
    for (let i = 1; i <= MAX_EXPLANATION_VERSIONS + 3; i++) {
      modes = withExplanationVersion(modes, "detailed", `صياغة ${i}`, meta).modes;
    }
    const versions = readExplanationVersions(modes, "detailed");
    expect(versions).toHaveLength(MAX_EXPLANATION_VERSIONS);
    // الأحدث أول القائمة — وأقدم ٣ صياغات اتشالت.
    expect(versions[0].text).toBe(`صياغة ${MAX_EXPLANATION_VERSIONS + 2}`);
    expect(versions[versions.length - 1].text).toBe("صياغة 3");
    expect(modes.detailed).toBe(`صياغة ${MAX_EXPLANATION_VERSIONS + 3}`);
  });

  it("النص القديم الفاضي مش بيتنفد كإصدار", () => {
    const result = withExplanationVersion({ general: "   " }, "general", "جديد", meta);
    expect(result.replaced).toBeNull();
    expect(result.version).toBe(1);
  });
});

describe("collectExplanationVersions — لرد GET", () => {
  it("بيجمع إصدارات الأوضاع الثلاثة وبيتجاهل الأوضاع النصية", () => {
    const meta = { generatedAt: "2025-01-01T00:00:00.000Z" };
    let modes = withExplanationVersion({ simple: "شرح قديم" }, "general", "عام", meta).modes;
    modes = withExplanationVersion(modes, "general", "عام ٢", meta).modes;
    const collected = collectExplanationVersions(modes);
    expect(collected.general).toHaveLength(1);
    expect(collected.general?.[0].text).toBe("عام");
    expect(collected.summary).toBeUndefined();
    expect(collected.detailed).toBeUndefined();
  });

  it("مدخلات تالفة/فاضية ⇒ أمان (فوقاي/فاضي)", () => {
    expect(collectExplanationVersions(null)).toEqual({});
    expect(collectExplanationVersions({ general__versions: "مش مصفوفة" })).toEqual({});
    expect(collectExplanationVersions({ summary__versions: [{ text: "  " }] })).toEqual({});
  });

  it("explanationVersionsKey بالمفتاح المتوقع", () => {
    expect(explanationVersionsKey("general")).toBe("general__versions");
  });
});
