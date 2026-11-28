import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_FORMAT, PAGE_FORMAT_DIMENSIONS, pageDimensions } from "../canvas";
import { validateNotebook } from "../validation";
import type { StorageNotebook } from "../types";

function validNotebook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "nb-1",
    ownerId: "user:abc",
    title: "النوتة",
    pageIds: ["p1"],
    currentPageId: "p1",
    revision: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("pageDimensions", () => {
  it("A4 الطولي هو مقاس النوتات القديمة الافتراضي", () => {
    expect(pageDimensions(undefined)).toEqual({ width: 794, height: 1123 });
    expect(pageDimensions("a4")).toEqual({ width: 794, height: 1123 });
  });

  it("A4 العرضي أوسع: نفس مساحة الورقة معكوسة", () => {
    const dims = pageDimensions("wide");
    expect(dims).toEqual({ width: 1123, height: 794 });
    expect(dims.width).toBeGreaterThan(dims.height);
  });

  it("شاشة العرض 16:9 بمقاس سلايد 1280×720", () => {
    const dims = pageDimensions("slide");
    expect(dims).toEqual({ width: 1280, height: 720 });
    expect(dims.width / dims.height).toBeCloseTo(16 / 9, 5);
  });

  it("المقاس الافتراضي للنوتات الجديدة هو A4 العرضي", () => {
    expect(DEFAULT_PAGE_FORMAT).toBe("wide");
    expect(Object.keys(PAGE_FORMAT_DIMENSIONS)).toEqual(["a4", "wide", "slide"]);
  });
});

describe("validateNotebook — pageFormat", () => {
  const base = validNotebook() as unknown as StorageNotebook;

  it("نوتة من غير pageFormat (قديم) بيتقبل", () => {
    expect(validateNotebook(base).valid).toBe(true);
  });

  it("pageFormat صحيح بيتقبل", () => {
    for (const format of ["a4", "wide", "slide"]) {
      expect(validateNotebook({ ...base, pageFormat: format }).valid).toBe(true);
    }
  });

  it("pageFormat غبيترفض", () => {
    const result = validateNotebook({ ...base, pageFormat: "banner" });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("pageFormat");
  });
});
