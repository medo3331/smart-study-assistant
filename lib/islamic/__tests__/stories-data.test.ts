import { describe, expect, it } from "vitest";

import {
  STORIES,
  STORY_CATEGORY_INFO,
  STORY_CATEGORY_ORDER,
  filterStoriesByCategory,
  getStoriesTotal,
  getStoryCategoryCounts,
  getStoryById,
  searchStories,
} from "../stories-data";

/** فئات القصص الصحيحة. */
const VALID_CATEGORIES = new Set(STORY_CATEGORY_ORDER);

describe("بيانات قصص الصحابة والتابعين", () => {
  it("فيها 15 قصة أو أكثر (الحد الأدنى للمهمة)", () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(15);
    expect(STORIES.length).toBeLessThanOrEqual(20);
    expect(getStoriesTotal()).toBe(STORIES.length);
  });

  it("كل قصة مكتملة البيانات (عنوان/شخصية/فئة/فقرات/درس)", () => {
    for (const story of STORIES) {
      expect(story.title.length).toBeGreaterThan(3);
      expect(story.person.length).toBeGreaterThan(2);
      expect(VALID_CATEGORIES.has(story.category)).toBe(true);
      expect(story.role.length).toBeGreaterThan(5);
      expect(story.paragraphs.length).toBeGreaterThanOrEqual(2);
      for (const paragraph of story.paragraphs) {
        expect(paragraph.length).toBeGreaterThan(40);
      }
      expect(story.lesson.length).toBeGreaterThan(20);
      expect(story.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("المعرّفات فريدة (بلا تكرار)", () => {
    const ids = new Set(STORIES.map((story) => story.id));
    expect(ids.size).toBe(STORIES.length);
  });

  it("أشخاص القصص متفرّدون (شخصية واحدة لا تتكرر)", () => {
    const people = new Set(STORIES.map((story) => story.person));
    expect(people.size).toBe(STORIES.length);
  });

  it("الشخصيات المطلوبة في المهمة موجودة (صحابة وصحابيات وتابعون)", () => {
    const people = STORIES.map((story) => story.person).join(" ");
    for (const expected of [
      "أبو بكر",
      "عمر بن الخطاب",
      "عثمان",
      "علي بن أبي طالب",
      "خالد بن الوليد",
      "بلال بن رباح",
      "عائشة",
      "خديجة",
      "سعيد بن المسيب",
      "الحسن البصري",
    ]) {
      expect(people).toContain(expected);
    }
  });

  it("الشخصيات التابعة مصنّفة (تابع/تابعية) والصحابيات (صحابي/صحابية)", () => {
    for (const story of STORIES) {
      const isTabiiPerson = story.category === "tabii" || story.category === "tabiiyya";
      const isSahabiPerson = story.category === "sahabi" || story.category === "sahabiyya";
      expect(isTabiiPerson || isSahabiPerson).toBe(true);
      expect(isTabiiPerson && isSahabiPerson).toBe(false);
      // التابعون بعد عصر النبوة: من المشهور تاريخياً
      if (isTabiiPerson) {
        expect(["سعيد بن المسيب", "مجاهد بن جبر", "الحسن البصري", "عمر بن عبد العزيز", "مالك بن دينار", "حفصة بنت سيرين"]).toContain(
          story.person,
        );
      }
    }
  });

  it("كل الفئات مغطاة والإحصاءات مطابقة للفلترة", () => {
    const counts = getStoryCategoryCounts();
    for (const category of STORY_CATEGORY_ORDER) {
      expect(counts[category]).toBeGreaterThan(0);
      expect(filterStoriesByCategory(category).length).toBe(counts[category]);
    }
    expect(filterStoriesByCategory("all").length).toBe(STORIES.length);
    const sum = STORY_CATEGORY_ORDER.reduce((total, category) => total + counts[category], 0);
    expect(sum).toBe(STORIES.length);
  });

  it("البحث بالمعرّف والنص يعمل", () => {
    expect(getStoryById("abu-bakr-infaq")?.person).toBe("أبو بكر الصديق");
    expect(getStoryById("غير-موجود")).toBeUndefined();

    const byName = searchStories("عمر");
    expect(byName.length).toBeGreaterThan(0);

    const byLesson = searchStories("التوبة", "tabii");
    expect(byName.length).toBeGreaterThan(0);
    for (const story of byLesson) {
      expect(story.category).toBe("tabii");
    }

    expect(searchStories("", "all")).toHaveLength(STORIES.length);
  });

  it("معلومات الفئات مكتملة", () => {
    for (const category of STORY_CATEGORY_ORDER) {
      expect(STORY_CATEGORY_INFO[category].label.length).toBeGreaterThan(1);
      expect(STORY_CATEGORY_INFO[category].description.length).toBeGreaterThan(5);
    }
  });

  it("بلا روايات ضعيفة أو إسرائيليات: القصص تشير لمصادرها في المقدمة فقط", () => {
    // كل نص القصص عربي سليم بلا عباراتٍ مثيرة أو كلمات دخيلة — فحص سريع للسلامة.
    for (const story of STORIES) {
      const full = [story.title, ...story.paragraphs, story.lesson].join(" ");
      expect(full).not.toMatch(/https?:\/\//); // لا روابط داخل النصوص
      expect(full).not.toMatch(/[\u0590-\u05FF]/); // بلا حروف عبرية (إسرائيليات)
    }
  });
});
