import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MUSHAF_AYAHS_PER_PAGE_ESTIMATE,
  MUSHAF_PAGE_COUNT,
  clampMushafPage,
  countMushafAyahsForward,
  getCachedMushafPage,
  getMushafPage,
  mushafPageImageUrl,
} from "../quran";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const response = (data: unknown, code = 200, status = "OK") => ({
  ok: code === 200,
  status: code === 200 ? 200 : 503,
  json: async () => ({ code, status, data }),
});

/** صفحة مصحف بالشكل اللي بيرجعه /page/{N}/quran-uthmani. */
const pageResponse = (
  pageNumber: number,
  ayahs: { surah: number; numberInSurah: number }[],
) =>
  response({
    number: pageNumber,
    ayahs: ayahs.map((a) => ({
      numberInSurah: a.numberInSurah,
      text: "آية",
      juz: 1,
      page: pageNumber,
      surah: { number: a.surah },
    })),
  });

describe("روابط صور صفحات المصحف", () => {
  it("يبني رابط CDN صحيحًا للنسختين الفاتحة والغامقة", () => {
    expect(mushafPageImageUrl(2, "dark")).toBe(
      "https://cdn.jsdelivr.net/gh/SakinaDevGroup/mushaf-madani-cdn@main/dark/p2.png",
    );
    expect(mushafPageImageUrl(604, "light")).toBe(
      "https://cdn.jsdelivr.net/gh/SakinaDevGroup/mushaf-madani-cdn@main/light/p604.png",
    );
  });

  it("يحصر أرقام الصفحات داخل 1..604", () => {
    expect(clampMushafPage(0)).toBe(1);
    expect(clampMushafPage(-5)).toBe(1);
    expect(clampMushafPage(1)).toBe(1);
    expect(clampMushafPage(604)).toBe(604);
    expect(clampMushafPage(605)).toBe(604);
    expect(clampMushafPage(9999)).toBe(MUSHAF_PAGE_COUNT);
    expect(clampMushafPage(2.6)).toBe(3);
    expect(clampMushafPage(Number.NaN)).toBe(1);
  });
});

describe("ربط صفحة المصحف ↔ الآيات", () => {
  it("يجلب أول وآخر آية في الصفحة ويحصّنها في الكاش", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(pageResponse(2, [
        { surah: 2, numberInSurah: 1 },
        { surah: 2, numberInSurah: 5 },
      ]));
    vi.stubGlobal("fetch", fetchMock);

    const ref = await getMushafPage(2);
    expect(ref).toEqual({
      pageNumber: 2,
      ayahCount: 2,
      firstAyah: { surahId: 2, ayahNumber: 1 },
      lastAyah: { surahId: 2, ayahNumber: 5 },
    });
    // النداء الثاني من الكاش — بدون شبكة تانية.
    expect(await getMushafPage(2)).toBe(ref);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedMushafPage(2)).toBe(ref);
  });

  it("يرجع null عند فشل الشبكة (التقليب لا يتعطل) ولا يخزّن الفشل", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await getMushafPage(300)).toBeNull();
    expect(getCachedMushafPage(300)).toBeNull();

    // نداء لاحق يعيد المحاولة.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pageResponse(300, [
      { surah: 18, numberInSurah: 54 },
      { surah: 18, numberInSurah: 61 },
    ])));
    const ref = await getMushafPage(300);
    expect(ref?.firstAyah).toEqual({ surahId: 18, ayahNumber: 54 });
    expect(ref?.lastAyah).toEqual({ surahId: 18, ayahNumber: 61 });
  });

  it("يرفض صفحة تالفة (بلا آيات أو برقم مختلف)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pageResponse(7, [])));
    expect(await getMushafPage(7)).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ number: 8, ayahs: [] })),
    );
    expect(await getMushafPage(7)).toBeNull();
  });
});

describe("عدّ آيات ورد اليوم عند التقليب للأمام", () => {
  it("يعدّ آيات الصفحات المتقاطعة من الكاش بالضبط", async () => {
    // نزرع الصفحات 10..12 في الكاش الحقيقي عبر getMushafPage (شبكة محاكاة).
    const pages = new Map<number, number>([
      [10, 3],
      [11, 5],
      [12, 2],
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string | URL) => {
        const page = Number(String(_url).match(/\/page\/(\d+)\//)?.[1] ?? 0);
        const count = pages.get(page);
        if (count === undefined) throw new Error("unmocked page");
        const ayahs = Array.from({ length: count }, (_, i) => ({
          surah: 2,
          numberInSurah: i + 1,
        }));
        return pageResponse(page, ayahs);
      }),
    );
    for (const page of pages.keys()) await getMushafPage(page);

    expect(countMushafAyahsForward(9, 12)).toBe(10);
    expect(countMushafAyahsForward(12, 9)).toBe(0); // للخلف لا يُعدّ شيء
    expect(countMushafAyahsForward(5, 5)).toBe(0);
  });

  it("يقدّر 20 آية للصفحة غير المعروفة بعد (تقدير مذكور في الواجهة)", () => {
    // صفحات غير مذكورة في أي اختبار آخر — الكاش بين الاختبارات مشترك.
    expect(countMushafAyahsForward(101, 103)).toBe(MUSHAF_AYAHS_PER_PAGE_ESTIMATE * 2);
    expect(countMushafAyahsForward(603, 604)).toBe(MUSHAF_AYAHS_PER_PAGE_ESTIMATE);
  });
});
