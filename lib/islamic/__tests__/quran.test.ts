import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllSurahs, getAyah, getAyahs } from "../quran";

afterEach(() => vi.unstubAllGlobals());

const response = (data: unknown, code = 200, status = "OK") => ({
  ok: code === 200,
  status: code === 200 ? 200 : 503,
  json: async () => ({ code, status, data }),
});

describe("Quran source integrity", () => {
  it("loads and validates the complete surah index", async () => {
    const surahs = Array.from({ length: 114 }, (_, index) => ({
      number: index + 1,
      englishName: `Surah ${index + 1}`,
      name: `سورة ${index + 1}`,
      revelationType: index === 0 ? "Meccan" : "Medinan",
      numberOfAyahs: index === 1 ? 2 : 1,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(surahs)));
    expect(await getAllSurahs()).toHaveLength(114);
  });

  it("rejects incomplete surah indexes and does not substitute sample content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([])));
    await expect(getAllSurahs()).rejects.toThrow("complete surah list");
  });

  it("fetches metadata and rejects a truncated surah even when the index was not loaded first", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ number: 2, ayahs: [
        { numberInSurah: 1, text: "آية واحدة", juz: 1, page: 1 },
      ] }))
      .mockResolvedValueOnce(response({
        number: 2,
        englishName: "Al-Baqarah",
        name: "البقرة",
        revelationType: "Medinan",
        numberOfAyahs: 2,
      })));
    await expect(getAyahs(2)).rejects.toThrow("truncated surah");
  });

  it("returns every verbatim ayah in source order with page and juz metadata", async () => {
    const ayahs = [
      { numberInSurah: 1, text: "آية موثقة أولى", juz: 1, page: 1 },
      { numberInSurah: 2, text: "آية موثقة ثانية", juz: 1, page: 1 },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ number: 2, ayahs })));
    await expect(getAyahs(2)).resolves.toEqual([
      { number: 1, text: "آية موثقة أولى", surahId: 2, juzNumber: 1, pageNumber: 1 },
      { number: 2, text: "آية موثقة ثانية", surahId: 2, juzNumber: 1, pageNumber: 1 },
    ]);
  });

  it("rejects truncated, out-of-order and failed source data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ number: 2, ayahs: [
      { numberInSurah: 2, text: "آية ثانية", juz: 1, page: 1 },
    ] })));
    await expect(getAyahs(2)).rejects.toThrow("incomplete ayah list");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(getAyahs(2)).rejects.toThrow("HTTP 503");
    await expect(getAyah(2, 1)).rejects.toThrow("HTTP 503");
  });
});
