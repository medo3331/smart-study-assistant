import { describe, it, expect } from "vitest";
import { toDisplayString, durationsToInput } from "@/lib/settings/display";

describe("toDisplayString", () => {
  it("يمرّر النص كما هو", () => {
    expect(toDisplayString("EGP")).toBe("EGP");
    expect(toDisplayString("+201234567890")).toBe("+201234567890");
  });

  it("يحوّل null/undefined إلى نص فارغ", () => {
    expect(toDisplayString(null)).toBe("");
    expect(toDisplayString(undefined)).toBe("");
  });

  it("يحوّل المصفوفة إلى نص مفصول بفواصل (سبب React error 31 سابقًا)", () => {
    expect(toDisplayString([30, 90, 365])).toBe("30, 90, 365");
    expect(toDisplayString(["pdf", "image"])).toBe("pdf, image");
  });

  it("يحوّل الكائن إلى JSON بدل رميه كـ child", () => {
    const out = toDisplayString({ a: 1 });
    expect(typeof out).toBe("string");
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it("يحوّل الأرقام والمنطقيات", () => {
    expect(toDisplayString(199)).toBe("199");
    expect(toDisplayString(true)).toBe("true");
  });

  it("لا يرمي مع مصفوفة متداخلة", () => {
    expect(() => toDisplayString([[1], [2]])).not.toThrow();
    expect(toDisplayString([[1], [2]])).toBe("1, 2");
  });
});

describe("durationsToInput", () => {
  it("يفكّ JSON array نصّي إلى صيغة الإدخال", () => {
    expect(durationsToInput("[30, 90, 365]")).toBe("30,90,365");
  });

  it("يمرّر صيغة الفاصلة كما هي", () => {
    expect(durationsToInput("30,90")).toBe("30,90");
  });

  it("يقبل مصفوفة فعلية", () => {
    expect(durationsToInput([30, 90])).toBe("30,90");
  });

  it("يعيد نصًا فارغًا للقيم الفارغة", () => {
    expect(durationsToInput("")).toBe("");
    expect(durationsToInput(null)).toBe("");
    expect(durationsToInput(undefined)).toBe("");
  });

  it("لا يرمي مع JSON ناقص ويعيد النص الخام", () => {
    expect(durationsToInput("[30,90")).toBe("[30,90");
  });

  it("يتعامل مع كائن غير مصفوفة بلا انفجار", () => {
    expect(() => durationsToInput({ x: 1 })).not.toThrow();
  });
});
