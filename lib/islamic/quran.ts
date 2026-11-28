import type { Surah, Ayah, QuranProgress } from "./types";

/** Quran text is fetched verbatim from AlQuran Cloud's Uthmani edition. */
const QURAN_API_BASE = "https://api.alquran.cloud/v1";
const QURAN_EDITION = "quran-uthmani";

interface ApiResponse<T> {
  code: number;
  status: string;
  data: T;
}

interface ApiSurah {
  number: number;
  englishName: string;
  name: string;
  revelationType: string;
  numberOfAyahs: number;
}

interface ApiAyah {
  numberInSurah: number;
  text: string;
  juz: number;
  page: number;
}

const surahAyahCounts = new Map<number, number>();

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${QURAN_API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Quran source returned HTTP ${response.status}`);

  const result = (await response.json()) as ApiResponse<T>;
  if (result.code !== 200 || result.status !== "OK" || result.data == null) {
    throw new Error("Quran source returned an invalid response");
  }
  return result.data;
}

function toSurah(s: ApiSurah): Surah {
  if (
    !Number.isInteger(s.number) || s.number < 1 || s.number > 114 ||
    !Number.isInteger(s.numberOfAyahs) || s.numberOfAyahs < 1 ||
    typeof s.name !== "string" || !s.name.trim() ||
    typeof s.englishName !== "string" || !s.englishName.trim() ||
    (s.revelationType !== "Meccan" && s.revelationType !== "Medinan")
  ) {
    throw new Error("Quran source returned invalid surah metadata");
  }

  return {
    id: s.number,
    name: s.englishName,
    arabicName: s.name,
    englishName: s.englishName,
    revelationType: s.revelationType,
    ayahCount: s.numberOfAyahs,
    // The surah list API does not include the starting juz; do not invent it.
    juzNumber: 0,
  };
}

export async function getAllSurahs(): Promise<Surah[]> {
  const raw = await fetchJson<ApiSurah[]>("/surah");
  if (!Array.isArray(raw) || raw.length !== 114) {
    throw new Error("Quran source did not return the complete surah list");
  }

  const surahs = raw.map(toSurah);
  if (surahs.some((surah, index) => surah.id !== index + 1)) {
    throw new Error("Quran source returned an incomplete or unordered surah list");
  }

  surahAyahCounts.clear();
  for (const surah of surahs) surahAyahCounts.set(surah.id, surah.ayahCount);
  return surahs;
}

export async function getSurah(surahId: number): Promise<Surah | null> {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) return null;
  const surah = toSurah(await fetchJson<ApiSurah>(`/surah/${surahId}`));
  if (surah.id !== surahId) throw new Error("Quran source returned a different surah");
  surahAyahCounts.set(surah.id, surah.ayahCount);
  return surah;
}

export async function getAyahs(surahId: number): Promise<Ayah[]> {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) {
    throw new Error("Invalid surah number");
  }

  const data = await fetchJson<{ number: number; ayahs: ApiAyah[] }>(
    `/surah/${surahId}/${QURAN_EDITION}`,
  );
  if (data.number !== surahId || !Array.isArray(data.ayahs) || data.ayahs.length === 0) {
    throw new Error("Quran source returned no complete ayah list");
  }

  const ayahs = data.ayahs.map((ayah, index) => {
    if (
      ayah.numberInSurah !== index + 1 ||
      typeof ayah.text !== "string" || !ayah.text.trim() ||
      !Number.isInteger(ayah.juz) || !Number.isInteger(ayah.page)
    ) {
      throw new Error("Quran source returned an incomplete ayah list");
    }
    return {
      number: ayah.numberInSurah,
      text: ayah.text,
      surahId,
      juzNumber: ayah.juz,
      pageNumber: ayah.page,
    };
  });

  let expectedCount = surahAyahCounts.get(surahId);
  if (expectedCount === undefined) {
    const surah = await getSurah(surahId);
    expectedCount = surah?.ayahCount;
  }
  if (expectedCount === undefined || ayahs.length !== expectedCount) {
    throw new Error("Quran source returned a truncated surah");
  }
  return ayahs;
}

export async function getAyah(surahId: number, ayahNumber: number): Promise<Ayah | null> {
  const ayahs = await getAyahs(surahId);
  return ayahs.find((ayah) => ayah.number === ayahNumber) ?? null;
}

export async function searchQuran(_query: string): Promise<Ayah[]> {
  void _query;
  return [];
}

/** Legacy data APIs retained for existing callers; Quran text never falls back to mock data. */
export async function getQuranProgress(_userId: string): Promise<QuranProgress> {
  void _userId;
  const { mockQuranProgress } = await import("./mock-data");
  return mockQuranProgress;
}

export async function updateQuranProgress(
  userId: string,
  progress: Partial<QuranProgress>,
): Promise<QuranProgress> {
  void userId;
  const { mockQuranProgress } = await import("./mock-data");
  return { ...mockQuranProgress, ...progress };
}
