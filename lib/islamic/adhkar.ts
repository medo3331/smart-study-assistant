import type { Dhikr, AdhkarCategory } from "./types";

/**
 * Adhkar Service Layer
 * 
 * Uses verified local dataset rather than AI generation.
 * All adhkar are sourced from authentic hadith collections.
 */

export async function getAdhkar(category: AdhkarCategory): Promise<Dhikr[]> {
  const { mockAdhkar } = await import("./mock-data");
  return mockAdhkar[category] || [];
}

export async function getAllAdhkar(): Promise<Record<AdhkarCategory, Dhikr[]>> {
  const { mockAdhkar } = await import("./mock-data");
  return mockAdhkar;
}

export async function getAdhkarById(id: string): Promise<Dhikr | null> {
  const { mockAdhkar } = await import("./mock-data");
  for (const category of Object.values(mockAdhkar)) {
    const found = category.find(d => d.id === id);
    if (found) return found;
  }
  return null;
}

/**
 * Get adhkar progress for a user
 * In production, this would come from your database
 */
export async function getAdhkarProgress(
  userId: string,
  category: AdhkarCategory,
  _date: string
): Promise<{ completed: boolean; currentCount: number }> {
  void _date;
  const { mockAdhkarProgress } = await import("./mock-data");
  return mockAdhkarProgress[category] || { completed: false, currentCount: 0 };
}

/**
 * Update adhkar progress
 */
export async function updateAdhkarProgress(
  userId: string,
  category: AdhkarCategory,
  _date: string,
  progress: { completed?: boolean; currentCount?: number }
): Promise<{ completed: boolean; currentCount: number }> {
  void _date;
  // Mock implementation - replace with database call
  const { mockAdhkarProgress } = await import("./mock-data");
  const current = mockAdhkarProgress[category] || { completed: false, currentCount: 0 };
  return { ...current, ...progress };
}

/**
 * Get category display info
 */
export const ADHKAR_CATEGORY_INFO: Record<AdhkarCategory, { 
  label: string; 
  icon: string; 
  description: string;
  color: string;
}> = {
  morning: {
    label: "أذكار الصباح",
    icon: "sunrise",
    description: "من الفجر إلى الشروق",
    color: "text-[#FB923C]",
  },
  evening: {
    label: "أذكار المساء",
    icon: "sunset",
    description: "من العصر إلى المغرب",
    color: "text-[#F97316]",
  },
  "after-prayer": {
    label: "أذكار بعد الصلاة",
    icon: "repeat",
    description: "بعد كل صلاة مفروضة",
    color: "text-[#2DD4BF]",
  },
  sleep: {
    label: "أذكار النوم",
    icon: "moon",
    description: "عند النوم",
    color: "text-[#7C5CFF]",
  },
  general: {
    label: "أذكار متنوعة",
    icon: "sparkles",
    description: "في أي وقت",
    color: "text-[#B69CFF]",
  },
};