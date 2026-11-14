import { describe, it, expect } from "vitest";

import { cairoDateString } from "@/lib/time/cairo";

/**
 * يوم المستخدم لازم يكون يوم القاهرة — نفس مسطرة `public.cairo_day()` في
 * `db/43-retention-p0-streak.sql`. الاختبار بيقفل الفرق اللي كان بيضيّع
 * سلسلة الطالب اللي بيذاكر بعد نص الليل.
 */
describe("cairoDateString", () => {
  it("بعد نص الليل بالقاهرة = اليوم اللي بعده، مش تاريخ UTC", () => {
    const lateNight = new Date("2026-11-13T22:30:00Z"); // 00:30 في القاهرة (UTC+2)
    expect(cairoDateString(lateNight)).toBe("2026-11-14");
    // ده بالظبط اللي كان بيحصل قبل الإصلاح:
    expect(lateNight.toISOString().slice(0, 10)).toBe("2026-11-13");
  });

  it("قبل نص الليل بالقاهرة بثانية = نفس اليوم", () => {
    expect(cairoDateString(new Date("2026-11-13T21:59:59Z"))).toBe("2026-11-13");
  });

  it("الصيغة دايمًا YYYY-MM-DD", () => {
    expect(cairoDateString(new Date("2026-01-05T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
