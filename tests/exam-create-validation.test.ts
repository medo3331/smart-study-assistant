import { describe, it, expect } from "vitest";

import { validateCreateBody } from "@/app/api/exam-sessions/route";

/**
 * تحقق من جسم طلب إنشاء الامتحان — **قبل** أي تعامل مع القاعدة.
 *
 * ⚠️ **اللي كان**: `body.lectureIds` غير مصفوفة ⇒ `normalizeIds` كان
 *    بيرجّع `[]` ⇒ 400 تافه؛BODY مش object ⇒ TypeError ⇒ **500**.
 *    دلوقتي كل الحالات بتبقى 400 برسالة واضحة.
 */
describe("validateCreateBody — جسم طلب إنشاء الامتحان", () => {
  it("طلب صحيح (محاضرات) ⇒ يمر", () => {
    const result = validateCreateBody({
      mode: "last_minute_review",
      lectureIds: ["a", "b"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.lectureIds).toEqual(["a", "b"]);
      expect(result.body.documentIds).toEqual([]);
      expect(result.body.mode).toBe("last_minute_review");
    }
  });

  it("طلب صحيح (مستندات) ⇒ يمر", () => {
    const result = validateCreateBody({
      mode: "last_minute_review",
      documentIds: ["doc-1"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.documentIds).toEqual(["doc-1"]);
      expect(result.body.lectureIds).toEqual([]);
    }
  });

  it("مصدرين (محاضرة + مستند) ⇒ يمر", () => {
    const result = validateCreateBody({
      mode: "last_minute_review",
      lectureIds: ["l1"],
      documentIds: ["d1"],
    });
    expect(result.ok).toBe(true);
  });

  it("مفيش مصادر ⇒ 400", () => {
    const result = validateCreateBody({ mode: "last_minute_review" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("lectureIds or documentIds required");
  });

  it("أكتر من 3 مصادر ⇒ 400 (مش 500)", () => {
    const result = validateCreateBody({
      mode: "last_minute_review",
      lectureIds: ["1", "2"],
      documentIds: ["3", "4"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("max 3 sources");
  });

  it("mode غلط ⇒ 400", () => {
    const result = validateCreateBody({ mode: "cheat", lectureIds: ["a"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("invalid mode");
  });

  it("body مش object (مصفوفة/نص/null) ⇒ 400 مش exception", () => {
    for (const value of [null, undefined, [], "text", 42]) {
      const result = validateCreateBody(value);
      expect(result.ok).toBe(false);
    }
  });

  it("معرّفات مش نصوص بتتجاهل (مش error) + التكرار بيتشال", () => {
    const result = validateCreateBody({
      mode: "last_minute_review",
      lectureIds: ["a", 3, null, "a", " b "],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.lectureIds).toEqual(["a", "b"]);
  });

  it("spec غلط ⇒ 400 برسالة واضحة", () => {
    const result = validateCreateBody({
      mode: "last_minute_review",
      lectureIds: ["a"],
      spec: { count: -5, types: ["nope"], difficulty: "impossible" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("spec");
  });

  it("العنوان/المادة بيتقصّروا (حماية من الحقن)", () => {
    const result = validateCreateBody({
      mode: "last_minute_review",
      lectureIds: ["a"],
      title: "t".repeat(500),
      subject: { id: "s".repeat(200), name: "n".repeat(400) },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.title.length).toBeLessThanOrEqual(120);
      expect(result.body.subjectName.length).toBeLessThanOrEqual(120);
      expect(result.body.subjectId?.length).toBeLessThanOrEqual(64);
    }
  });
});
