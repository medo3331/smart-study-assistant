import type { Surah, Ayah, QuranProgress } from "./types";

/**
 * Quran Service Layer
 * 
 * In production, integrate with a reliable Quran API like:
 * - Alquran.cloud API
 * - Quran.com API
 * - Tanzil.net
 * - Or use a local verified dataset
 * 
 * Never generate Quran text using AI.
 */

const QURAN_API_BASE = "https://api.alquran.cloud/v1";

export async function getAllSurahs(): Promise<Surah[]> {
  try {
    const response = await fetch(`${QURAN_API_BASE}/surah`);
    if (!response.ok) throw new Error("Failed to fetch surahs");
    const data = await response.json();
    return data.data.map((s: { number: number; englishName: string; name: string; revelationType: string; numberOfAyahs: number }) => ({
      id: s.number,
      name: s.englishName,
      arabicName: s.name,
      englishName: s.englishName,
      revelationType: s.revelationType,
      ayahCount: s.numberOfAyahs,
      juzNumber: 1, // Would need additional API call
    }));
  } catch (error) {
    console.error("Error fetching surahs:", error);
    // Fallback to mock data
    const { mockSurahs } = await import("./mock-data");
    return mockSurahs;
  }
}

export async function getSurah(surahId: number): Promise<Surah | null> {
  try {
    const response = await fetch(`${QURAN_API_BASE}/surah/${surahId}`);
    if (!response.ok) throw new Error("Failed to fetch surah");
    const data = await response.json();
    const s = data.data;
    return {
      id: s.number,
      name: s.englishName,
      arabicName: s.name,
      englishName: s.englishName,
      revelationType: s.revelationType,
      ayahCount: s.numberOfAyahs,
      juzNumber: 1,
    };
  } catch (error) {
    console.error("Error fetching surah:", error);
    const { mockSurahs } = await import("./mock-data");
    return mockSurahs.find(s => s.id === surahId) || null;
  }
}

export async function getAyahs(surahId: number): Promise<Ayah[]> {
  try {
    // Using Arabic text with simple edition
    const response = await fetch(`${QURAN_API_BASE}/surah/${surahId}/ar.alafasy`);
    if (!response.ok) throw new Error("Failed to fetch ayahs");
    const data = await response.json();
    return data.data.ayahs.map((a: { numberInSurah: number; text: string; juz: number; page: number }) => ({
      number: a.numberInSurah,
      text: a.text,
      surahId: surahId,
      juzNumber: a.juz,
      pageNumber: a.page,
    }));
  } catch (error) {
    console.error("Error fetching ayahs:", error);
    const { mockAyahs } = await import("./mock-data");
    return mockAyahs.filter(a => a.surahId === surahId);
  }
}

export async function getAyah(surahId: number, ayahNumber: number): Promise<Ayah | null> {
  try {
    const response = await fetch(`${QURAN_API_BASE}/ayah/${surahId}:${ayahNumber}/ar.alafasy`);
    if (!response.ok) throw new Error("Failed to fetch ayah");
    const data = await response.json();
    const a = data.data;
    return {
      number: a.numberInSurah,
      text: a.text,
      surahId: surahId,
      juzNumber: a.juz,
      pageNumber: a.page,
    };
  } catch (error) {
    console.error("Error fetching ayah:", error);
    const { mockAyahs } = await import("./mock-data");
    return mockAyahs.find(a => a.surahId === surahId && a.number === ayahNumber) || null;
  }
}

export async function searchQuran(_query: string): Promise<Ayah[]> {
  void _query;
  // Alquran.cloud doesn't have search, would need a different API
  // For now return empty - implement with a search-capable API in production
  return [];
}

/**
 * Get Quran reading progress for a user
 * In production, this would come from your database
 */
export async function getQuranProgress(_userId: string): Promise<QuranProgress> {
  void _userId;
  // Mock implementation - replace with database call
  const { mockQuranProgress } = await import("./mock-data");
  return mockQuranProgress;
}

/**
 * Update Quran reading progress
 */
export async function updateQuranProgress(
  userId: string,
  progress: Partial<QuranProgress>
): Promise<QuranProgress> {
  // Mock implementation - replace with database call
  const { mockQuranProgress } = await import("./mock-data");
  return { ...mockQuranProgress, ...progress };
}