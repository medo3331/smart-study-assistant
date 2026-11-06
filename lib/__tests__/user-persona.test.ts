/* B4.0.2g-f: مفيش ديفولت صامت لـ "برمجة" — السياق التعليمي يقدّم نفسه أو ما فيش. */
import { describe, expect, it } from "vitest";
import { buildPersonaContext, DEFAULT_FIELD, isField } from "../user-persona";

describe("DEFAULT_FIELD policy (B4.0.2g-f)", () => {
  it("has no silent 'programming' default", () => {
    expect(DEFAULT_FIELD).toBeNull();
    // الـ UI default بتاع الاقتراحات بيتعامل مع null عادي (getField fallback).
    expect(isField("programming")).toBe(true);
  });

  it("buildPersonaContext omits the field line when field is null", () => {
    const context = buildPersonaContext("student", "high", null);
    expect(context).not.toContain("البرمجة");
    expect(context.length).toBeGreaterThan(0); // سطر الشخصية/المستوى موجود
  });

  it("buildPersonaContext keeps the field line only when explicitly chosen", () => {
    const context = buildPersonaContext("student", "high", "programming");
    expect(context).toContain("البرمجة");
  });
});
