import { describe, expect, it } from "vitest";
import {
  AYAHS_PER_PAGE,
  PAGES_PER_HIZB,
  PAGES_PER_JUZ,
  PAGES_PER_QUARTER,
  QURAN_TOTAL_PAGES,
  ayahsToWordAmount,
  computeQuranWordProgress,
  defaultAmountForUnit,
  formatWordAmount,
  isQuranWordUnit,
  wordAmountToAyahs,
} from "../worship-progress";

describe("وحدات ورد القرآن — التحويلات النقية", () => {
  it("ثوابت المصحف متوافقة مع المواصفات (٦٠٤ صفحة: جزء ≈ ٢٠، حزب ≈ ١٠، ربع ≈ ٢٫٥)", () => {
    expect(QURAN_TOTAL_PAGES).toBe(604);
    expect(PAGES_PER_JUZ).toBeCloseTo(604 / 30, 10);
    expect(PAGES_PER_JUZ).toBeGreaterThan(20);
    expect(PAGES_PER_JUZ).toBeLessThan(20.2);
    expect(PAGES_PER_HIZB).toBeCloseTo(10.07, 1);
    expect(PAGES_PER_QUARTER).toBeCloseTo(2.5, 1);
  });

  it("وحدة الآيات تعدي العدد كما هو (العدّاد الأصلي untouched)", () => {
    expect(ayahsToWordAmount(0, "ayat")).toBe(0);
    expect(ayahsToWordAmount(10, "ayat")).toBe(10);
    expect(wordAmountToAyahs(25, "ayat")).toBe(25);
  });

  it("التحويل آيات ← صفحات يستخدم متوسط الآيات للصفحة", () => {
    expect(ayahsToWordAmount(AYAHS_PER_PAGE, "pages")).toBeCloseTo(1, 6);
    // قراءة نصف المصحف (٣١١٨ آية) ≈ ٣٠٢ صفحة
    expect(ayahsToWordAmount(3118, "pages")).toBeCloseTo(302, 0);
  });

  it("الجزء ≈ ٢٠ صفحة: ٢٠ صفحة مقروءة ≈ جزء", () => {
    const pagesOfOneAyahPage = AYAHS_PER_PAGE;
    // ٢٠ صفحة مصحف = ٢٠ × متوسط الآيات للصفحة
    const ayahsFor20Pages = 20 * AYAHS_PER_PAGE;
    expect(ayahsToWordAmount(ayahsFor20Pages, "ajzaa")).toBeCloseTo(20 / PAGES_PER_JUZ, 6);
    expect(ayahsToWordAmount(ayahsFor20Pages, "ajzaa")).toBeGreaterThan(0.99);
    expect(ayahsToWordAmount(ayahsFor20Pages, "ajzaa")).toBeLessThan(1.01);
    void pagesOfOneAyahPage;
  });

  it("الحزب ≈ ١٠ صفحات والربع ≈ ٢٫٥ صفحة", () => {
    const ayahsFor10Pages = 10 * AYAHS_PER_PAGE;
    // ١٠ صفحات = ١٠/١٠٫٠٧ حزب ≈ حزب (فرق أقل من ١٪ من المواصفة التقريبية)
    expect(ayahsToWordAmount(ayahsFor10Pages, "ahzab")).toBeCloseTo(10 / PAGES_PER_HIZB, 6);
    expect(ayahsToWordAmount(ayahsFor10Pages, "ahzab")).toBeGreaterThan(0.99);
    expect(ayahsToWordAmount(ayahsFor10Pages, "ahzab")).toBeLessThan(1.01);
    // ٢٫٥ صفحة = ٢٫٥/٢٫٥١٧ ربع ≈ ربع (فرق أقل من ١٪ من المواصفة التقريبية)
    expect(ayahsToWordAmount(2.5 * AYAHS_PER_PAGE, "quarters")).toBeCloseTo(2.5 / PAGES_PER_QUARTER, 6);
    expect(ayahsToWordAmount(2.5 * AYAHS_PER_PAGE, "quarters")).toBeGreaterThan(0.99);
    expect(ayahsToWordAmount(2.5 * AYAHS_PER_PAGE, "quarters")).toBeLessThan(1.01);
  });

  it("التقدم الكلي (٦٢٣٦ آية) يساوي ٣٠ جزءاً / ٦٠ حزباً / ٢٤٠ ربعاً / ٦٠٤ صفحات", () => {
    expect(ayahsToWordAmount(6236, "ajzaa")).toBeCloseTo(30, 6);
    expect(ayahsToWordAmount(6236, "ahzab")).toBeCloseTo(60, 6);
    expect(ayahsToWordAmount(6236, "quarters")).toBeCloseTo(240, 6);
    expect(ayahsToWordAmount(6236, "pages")).toBeCloseTo(604, 6);
  });

  it("القيم السالبة والصفر آمنة", () => {
    expect(ayahsToWordAmount(-5, "ajzaa")).toBe(0);
    expect(wordAmountToAyahs(-2, "pages")).toBe(0);
    expect(ayahsToWordAmount(0, "quarters")).toBe(0);
  });

  it("التحويل العكسي كرة-كرة يرجع للأصل", () => {
    for (const unit of ["pages", "quarters", "ahzab", "ajzaa"] as const) {
      const ayahs = 173;
      const back = wordAmountToAyahs(ayahsToWordAmount(ayahs, unit), unit);
      expect(back).toBeCloseTo(ayahs, 6);
    }
  });
});

describe("computeQuranWordProgress — تقدم الورد للعرض", () => {
  it("هدف جزء واحد: ١٠ صفحات مقروءة ≈ نصف جزء ≈ ٥٠٪", () => {
    const progress = computeQuranWordProgress(10 * AYAHS_PER_PAGE, "ajzaa", 1);
    expect(progress.completedAmount).toBeCloseTo(10 / PAGES_PER_JUZ, 6);
    expect(progress.percent).toBeCloseTo((10 / PAGES_PER_JUZ) * 100, 1);
    expect(progress.ayahsEquivalent).toBeGreaterThan(200); // جزء ≈ ٢٠٨ آية بالمتوسط
    expect(progress.completedLabel).toContain("جزء");
  });

  it("هدف جزئين: تجاوز الهدف يقفل النسبة عند ١٠٠٪", () => {
    const progress = computeQuranWordProgress(6236, "ajzaa", 2);
    expect(progress.percent).toBe(100);
  });

  it("هدف صفر لا يقسم على صفر", () => {
    const progress = computeQuranWordProgress(50, "pages", 0);
    expect(progress.percent).toBe(0);
    expect(progress.targetAmount).toBe(0);
  });

  it("وحدة الآيات تطلع نفس أرقام العدّاد القديم (التوافق مع مكافأة worship_quran)", () => {
    const progress = computeQuranWordProgress(7, "ayat", 10);
    expect(progress.completedAmount).toBe(7);
    expect(progress.percent).toBe(70);
  });
});

describe("أدوات العرض والتحقق", () => {
  it("isQuranWordUnit يرفض القيم الغريبة", () => {
    expect(isQuranWordUnit("ajzaa")).toBe(true);
    expect(isQuranWordUnit("juz")).toBe(false);
    expect(isQuranWordUnit(null)).toBe(false);
    expect(isQuranWordUnit(42)).toBe(false);
  });

  it("formatWordAmount يصرف الصيغ العربية (مفرد/مثنى/جمع)", () => {
    expect(formatWordAmount("ajzaa", 1)).toBe("جزء");
    expect(formatWordAmount("ajzaa", 2)).toBe("جزئين");
    expect(formatWordAmount("ajzaa", 3)).toBe("3 أجزاء");
    expect(formatWordAmount("ahzab", 1)).toBe("حِزب");
    expect(formatWordAmount("ahzab", 2)).toBe("حزبين");
    expect(formatWordAmount("pages", 5)).toBe("5 صفحات");
    expect(formatWordAmount("pages", 0.5)).toBe("0.5 صفحة");
  });

  it("defaultAmountForUnit يرجع افتراضيات معقولة لكل وحدة", () => {
    expect(defaultAmountForUnit("ajzaa")).toBe(1);
    expect(defaultAmountForUnit("ahzab")).toBe(2);
    expect(defaultAmountForUnit("quarters")).toBe(4);
    expect(defaultAmountForUnit("pages")).toBe(1);
  });
});
