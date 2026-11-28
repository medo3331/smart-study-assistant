import { describe, expect, it } from "vitest";
import {
  isLabVerdict,
  parseLabPlan,
  parseLabVerdict,
  readLabs,
  readLatestLab,
  upsertLabSession,
  type LabSession,
} from "@/lib/lesson/lab";
import { isQuantitativeSubject } from "@/lib/education/specialization";

/* ═════════════════ parseLabPlan ═════════════════ */

describe("parseLabPlan", () => {
  it("بيعمل parse لخطة صالحة (٣ خطوات)", () => {
    const raw = JSON.stringify({
      understanding: "المعطيات: دالة — المطلوب: إثبات الاتصال",
      steps: [
        { title: "اكتب التعريف", guidance: "ابدأ بتعريف الاتصال بـ epsilon-delta." },
        { title: "عوّض بالنقطة", guidance: "عوّض x=2 وشوف بتحصل على إيه." },
        { title: "اختار epsilon", guidance: "اربط epsilon بالفرق اللي حصلت عليه." },
      ],
    });
    const plan = parseLabPlan(raw);
    expect(plan?.steps.length).toBe(3);
    expect(plan?.understanding).toContain("المعطيات");
  });

  it("JSON متغلف بنص بيشتغل برضه", () => {
    const raw = 'خطة الحل:\n{"understanding":"u","steps":[{"title":"أ","guidance":"ج"},{"title":"ب","guidance":"د"}]}';
    expect(parseLabPlan(raw)?.steps.length).toBe(2);
  });

  it("خطوات أقل من الحد الأدنى أو شكل تالف ⇒ null", () => {
    expect(parseLabPlan('{"steps":[{"title":"واحدة","guidance":"ج"}]}')).toBeNull();
    expect(parseLabPlan("مش JSON")).toBeNull();
    expect(parseLabPlan('{"steps":[]}')).toBeNull();
  });
});

/* ═════════════════ parseLabVerdict ═════════════════ */

describe("parseLabVerdict", () => {
  it("verdict صالح + فيدباك", () => {
    expect(parseLabVerdict('{"verdict":"partial","feedback":"الفكرة صح بس ناقص تعويض"}')).toEqual({
      verdict: "partial",
      feedback: "الفكرة صح بس ناقص تعويض",
    });
  });

  it("verdict غريب أو فيدباك فاضي ⇒ null", () => {
    expect(parseLabVerdict('{"verdict":"maybe","feedback":"نص"}')).toBeNull();
    expect(parseLabVerdict('{"verdict":"correct","feedback":""}')).toBeNull();
    expect(parseLabVerdict("نص عادي")).toBeNull();
  });

  it("isLabVerdict", () => {
    expect(isLabVerdict("correct")).toBe(true);
    expect(isLabVerdict("perfect")).toBe(false);
  });
});

/* ═════════════════ readLabs / upsert ═════════════════ */

const session = (id: string): LabSession => ({
  id,
  problem: "أثبت أن f متصلة عند x=2",
  understanding: "u",
  steps: [
    { title: "التعريف", guidance: "ابدأ بالتعريف" },
    { title: "التعويض", guidance: "عوّض بالنقطة" },
  ],
  attempts: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("readLabs / upsertLabSession", () => {
  it("بيقرا الجلسات الصالحة فقط وبالحد الأقصى", () => {
    const stored = [session("a"), session("b"), "تالف"];
    const labs = readLabs(stored);
    expect(labs.length).toBe(2);
    expect(readLatestLab(stored)?.id).toBe("a");
    expect(readLatestLab(null)).toBeNull();
    expect(readLatestLab("مش مصفوفة")).toBeNull();
  });

  it("التحديث بيرفع الجلسة للأول من غير تكرار — والحد ٣", () => {
    let stored: unknown = [session("a"), session("b"), session("c")];
    const updated = { ...session("b"), updatedAt: "2026-02-02T00:00:00Z" };
    stored = upsertLabSession(stored, updated);
    const labs = readLabs(stored);
    expect(labs.map((l) => l.id)).toEqual(["b", "a", "c"]);
    expect(readLabs(stored).length).toBeLessThanOrEqual(3);
  });
});

/* ═════════════════ isQuantitativeSubject ═════════════════ */

describe("isQuantitativeSubject", () => {
  it("بيعرف المواد الحسابية عربي وإنجليزي", () => {
    expect(isQuantitativeSubject("رياضيات")).toBe(true);
    expect(isQuantitativeSubject("تفاضل وتكامل")).toBe(true);
    expect(isQuantitativeSubject("إحصاء")).toBe(true);
    expect(isQuantitativeSubject("Physics")).toBe(true);
    expect(isQuantitativeSubject("Linear Algebra")).toBe(true);
    expect(isQuantitativeSubject("برمجة")).toBe(false); // بتتغطي من فحص البرمجة المش روح ده
  });

  it("المواد التانية ⇒ false", () => {
    expect(isQuantitativeSubject("التاريخ")).toBe(false);
    expect(isQuantitativeSubject("")).toBe(false);
  });
});
