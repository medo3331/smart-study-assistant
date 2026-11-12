/**
 * 🎬 اختبار ليبلات مراجع العرض (وحدة segment) — 2026-11-12
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🎯 **الادعاء اللي الملف ده بياثبته:**
 *
 *   ① **المحاضرة**: المرجع المعروض = **توقيت** («دقيقة 12:30») مش رقم
 *      مقطع — والـ `page` اللي بيرجعه الموديل بيفضل رقم.
 *   ② **المستند**: بيفضل زي ما هو («صفحة ٤») — من غير ليبل صريح.
 *   ③ الـ prompt بينادي الوحدة بالاسم الصح («المقطع» مش «الصفحة»).
 *
 * ⚠️ **ليه الملف ده مهم**: لو الـ label ضاع ⇒ المرجع في العرض بيقول
 *    «مقطع ٤» — والطالب مش هيعرف يدوّر على الدقيقة 12:30 في المحاضرة.
 */

import { describe, it, expect } from "vitest";

import { sourceBadge, unitLabel } from "../slides-labels";
import { buildSlidesMessages } from "../slides-prompts";
import type { DeckSlide } from "../slides";

const SEGMENT_SLIDE: DeckSlide = {
  heading: "التصنيف السريري",
  bullets: [
    { text: "التصنيف له ثلاث فئات", page: 7, label: "دقيقة 3:29", quote: "ق" },
    { text: "الفئة الأولى Keratotic", page: 7, label: "دقيقة 3:29", quote: "ق" },
    { text: "الفئة الثانية proliferative", page: 12, label: "دقيقة 5:10", quote: "ق" },
  ],
};

describe("unitLabel — ليبل الوحدة", () => {
  it("✅ المستند: صفحة / شريحة / فقرة", () => {
    expect(unitLabel("page", 4)).toBe("صفحة 4");
    expect(unitLabel("slide", 4)).toBe("شريحة 4");
    expect(unitLabel("paragraph", 4)).toBe("الفقرة 4");
  });

  it("✅ المحاضرة: مقطع", () => {
    expect(unitLabel("segment", 7)).toBe("مقطع 7");
  });
});

describe("sourceBadge — شارة المصدر", () => {
  it("✅ ليبل صريح (محاضرة) ⇒ التوقيت", () => {
    expect(sourceBadge(SEGMENT_SLIDE, "segment")).toBe("دقيقة 3:29 و دقيقة 5:10");
  });

  it("✅ مرجع واحد ⇒ ليبل واحد", () => {
    const one: DeckSlide = {
      heading: "x",
      bullets: [{ text: "ن", page: 3, label: "دقيقة 1:00", quote: "ق" }],
    };
    expect(sourceBadge(one, "segment")).toBe("دقيقة 1:00");
  });

  it("✅ من غير ليبل ⇒ بنحسبه من الـ unit (مستند)", () => {
    const doc: DeckSlide = {
      heading: "x",
      bullets: [
        { text: "ن", page: 4, quote: "ق" },
        { text: "ن", page: 9, quote: "ق" },
      ],
    };
    expect(sourceBadge(doc, "page")).toBe("صفحة 4 و صفحة 9");
  });

  it("✅ نقطة من غير مرجع ⇒ شارة فاضية", () => {
    const none: DeckSlide = {
      heading: "x",
      bullets: [{ text: "ن", page: null, quote: "ق" }],
    };
    expect(sourceBadge(none, "page")).toBe("");
  });
});

describe("buildSlidesMessages — اسم الوحدة في البرومبت", () => {
  const pages = [{ number: 3, text: "نص المقطع", label: "دقيقة 1:30" }];

  it("✅ المحاضرة: البرومبت يقول «المقطع»", () => {
    const [system, user] = buildSlidesMessages({
      pages,
      partIndex: 0,
      totalParts: 1,
      unitLabel: "مقطع",
    });
    expect(system.content).toContain("المقطع");
    expect(system.content).not.toContain("الصفحة اللي الجملة");
    expect(user.content).toContain("رقم المقطع");
  });

  it("✅ المستند: البرومبت يقول «الصفحة»", () => {
    const [system, user] = buildSlidesMessages({
      pages: [{ number: 3, text: "نص الصفحة" }],
      partIndex: 0,
      totalParts: 1,
      unitLabel: "صفحة",
    });
    expect(system.content).toContain("الصفحة");
    expect(user.content).toContain("رقم الصفحة");
  });

  it("✅ الـ anchor-format ثابت (P<n>) في الحالتين", () => {
    for (const label of ["صفحة", "مقطع"]) {
      const [, user] = buildSlidesMessages({
        pages,
        partIndex: 0,
        totalParts: 1,
        unitLabel: label,
      });
      expect(user.content).toContain("[P3]");
    }
  });
});
