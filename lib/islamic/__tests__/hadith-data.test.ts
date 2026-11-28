import { describe, expect, it } from "vitest";

import {
  EXTRA_HADITH_REFS,
  HADITHS,
  HADITH_API_EDITIONS,
  HADITH_CATEGORY_INFO,
  HADITH_CATEGORY_ORDER,
  getHadithOfTheDay,
  getHadithTotal,
  groupHadithsByCategory,
  normalizeArabicText,
  searchHadiths,
} from "../hadith-data";

/** الكتب الستة المعتمدة — الداتا هنا من الصحيحين فقط (أمان أعلى). */
const SIX_BOOKS = new Set(["bukhari", "muslim"]);

describe("بيانات الأحاديث الشريفة", () => {
  it("فيها 30 حديثاً أو أكثر (الحد الأدنى للمهمة)", () => {
    expect(HADITHS.length).toBeGreaterThanOrEqual(30);
    expect(getHadithTotal()).toBe(HADITHS.length);
  });

  it("كل حديث له مصدر من الصحيحين ورابط تحقق صحيح", () => {
    for (const hadith of HADITHS) {
      expect(SIX_BOOKS.has(hadith.collection)).toBe(true);
      expect(hadith.source).toContain(
        hadith.collection === "bukhari" ? "صحيح البخاري" : "صحيح مسلم",
      );
      expect(hadith.source).toContain(String(hadith.hadithNumber));
      expect(hadith.sourceUrl).toMatch(/^https:\/\/sunnah\.com\/(bukhari|muslim):\d+$/);
    }
  });

  it("كل حديث له نص عربي طويل وراوي معروف", () => {
    for (const hadith of HADITHS) {
      expect(hadith.text.length).toBeGreaterThanOrEqual(40);
      // نصّ الصحيحين المُشكَّل يحتوي حروف عربية وفيرة
      const arabic = (hadith.text.match(/[\u0600-\u06FF]/g) ?? []).length;
      expect(arabic / hadith.text.length).toBeGreaterThan(0.5);
      expect(hadith.narrator.length).toBeGreaterThan(2);
      expect(hadith.id).toBe(`${hadith.collection}-${hadith.hadithNumber}`);
    }
  });

  it("المعرّفات فريدة (بلا تكرار)", () => {
    const ids = new Set(HADITHS.map((hadith) => hadith.id));
    expect(ids.size).toBe(HADITHS.length);
  });

  it("كل حديث لتصنيف معلوم، وكل التصنيفات مغطاة", () => {
    for (const hadith of HADITHS) {
      expect(HADITH_CATEGORY_ORDER).toContain(hadith.category);
      expect(HADITH_CATEGORY_INFO[hadith.category].label.length).toBeGreaterThan(1);
    }
    const grouped = groupHadithsByCategory();
    for (const category of HADITH_CATEGORY_ORDER) {
      expect(grouped[category].length).toBeGreaterThan(0);
    }
  });

  it("حديث اليوم ثابت خلال اليوم ويتغير بتغير التاريخ", () => {
    const day1 = new Date(2030, 3, 10, 8, 0, 0);
    const day1Later = new Date(2030, 3, 10, 23, 30, 0);
    const day2 = new Date(2030, 3, 11, 9, 0, 0);

    const morning = getHadithOfTheDay(day1);
    expect(getHadithOfTheDay(day1Later)).toBe(morning); // نفس اليوم → نفس الحديث
    expect(getHadithOfTheDay(day2)).not.toBe(morning); // يوم جديد → حديث مختلف
    expect(HADITHS).toContain(morning);
  });

  it("البحث النصي يعمل مع التشكيل (يتجاهل التشكيل في المطابقة)", () => {
    const results = searchHadiths("الاعمال بالنيات");
    expect(results.length).toBeGreaterThan(0);
    // حديث النيات هو أول حديث في الصحيحين
    expect(results[0].id).toBe("bukhari-1");

    const byCategory = searchHadiths("الاعمال بالنيات", "akhlaq");
    expect(byCategory).toHaveLength(0);

    const all = searchHadiths("", "all");
    expect(all).toHaveLength(HADITHS.length);
  });

  it("تطبيع النص العربي يزيل التشكيل ويوحّد الهمزات", () => {
    expect(normalizeArabicText("الأَعْمَالُ")).toBe("الاعمال");
    expect(normalizeArabicText("  الإيمانُ  ")).toBe("الايمان");
  });

  it("مراجع البروكسي الإضافية من الصحيحين ومكتملة البيانات", () => {
    expect(EXTRA_HADITH_REFS.length).toBeGreaterThanOrEqual(5);
    for (const ref of EXTRA_HADITH_REFS) {
      expect(SIX_BOOKS.has(ref.collection)).toBe(true);
      expect(ref.hadithNumber).toBeGreaterThan(0);
      expect(HADITH_CATEGORY_ORDER).toContain(ref.category);
      expect(ref.narrator.length).toBeGreaterThan(2);
    }
    // بلا تعارض مع الداتا الثابتة (نفس المرجع لا يتكرر مصدرين)
    const staticKeys = new Set(HADITHS.map((h) => `${h.collection}:${h.hadithNumber}`));
    for (const ref of EXTRA_HADITH_REFS) {
      expect(staticKeys.has(`${ref.collection}:${ref.hadithNumber}`)).toBe(false);
    }
  });

  it("روابط الـ API الخارجية للبروكسي صحيحة", () => {
    expect(HADITH_API_EDITIONS.bukhari).toContain("ara-bukhari");
    expect(HADITH_API_EDITIONS.muslim).toContain("ara-muslim");
    for (const url of Object.values(HADITH_API_EDITIONS)) {
      expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\//);
    }
  });
});
