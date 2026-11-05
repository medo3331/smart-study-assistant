import { describe, it, expect } from "vitest";
import {
  parseOrdinal,
  detectSourceFamily,
  parseSourceRequest,
} from "../workspace-source-resolver";

describe("parseOrdinal", () => {
  it("parses Arabic numeral ordinal", () => {
    expect(parseOrdinal("المحاضرة رقم 1")).toBe(1);
    expect(parseOrdinal("رقم 2")).toBe(2);
  });
  it("parses Arabic ordinal words", () => {
    expect(parseOrdinal("الأولى")).toBe(1);
    expect(parseOrdinal("الثانية")).toBe(2);
    expect(parseOrdinal("الثالث")).toBe(3);
  });
  it("parses English ordinals", () => {
    expect(parseOrdinal("first")).toBe(1);
    expect(parseOrdinal("second lecture")).toBe(2);
    expect(parseOrdinal("3rd")).toBe(3);
  });
  it("parses last", () => {
    expect(parseOrdinal("الأخيرة")).toBe("last");
    expect(parseOrdinal("last")).toBe("last");
  });
  it("returns null for previous", () => {
    expect(parseOrdinal("السابقة")).toBeNull();
  });
});

describe("detectSourceFamily", () => {
  it("detects lecture", () => {
    expect(detectSourceFamily("اشرحلي المحاضرة رقم 1")).toBe("lecture");
    expect(detectSourceFamily("explain lecture 2")).toBe("lecture");
  });
  it("detects material", () => {
    expect(detectSourceFamily("افتح ملف PDF")).toBe("material");
    expect(detectSourceFamily("open the pdf file")).toBe("material");
  });
  it("returns both when ambiguous", () => {
    expect(detectSourceFamily("Computer Networks")).toBe("both");
  });
});

describe("parseSourceRequest", () => {
  it("parses lecture ordinal request", () => {
    const r = parseSourceRequest("اشرحلي المحاضرة رقم 1");
    expect(r.family).toBe("lecture");
    expect(r.ordinal).toBe(1);
  });
  it("parses title query", () => {
    const r = parseSourceRequest("اشرح محاضرة Computer Networks");
    expect(r.family).toBe("lecture");
    expect(r.titleQuery.toLowerCase()).toContain("computer");
  });
  it("detects temporal", () => {
    const r = parseSourceRequest("اشرحلي الملف اللي رفعته امس");
    expect(r.temporal).toBe("yesterday");
  });
  it("detects relative previous", () => {
    const r = parseSourceRequest("كمّل شرح المحاضرة السابقة");
    expect(r.relativePrevious).toBe(true);
  });
});
