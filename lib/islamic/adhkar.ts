import type { Dhikr, AdhkarCategory } from "./types";
import { ADHKAR_BY_CATEGORY } from "./adhkar-data";
import {
  getTodayWorship,
  saveWorshipDay,
} from "./worship-progress";

/**
 * Adhkar Service Layer
 * 
 * Uses verified local dataset rather than AI generation.
 * All adhkar are sourced from authentic hadith collections.
 */

export async function getAdhkar(category: AdhkarCategory): Promise<Dhikr[]> {
  return ADHKAR_BY_CATEGORY[category];
}

export async function getAllAdhkar(): Promise<Record<AdhkarCategory, Dhikr[]>> {
  return ADHKAR_BY_CATEGORY;
}

export async function getAdhkarById(id: string): Promise<Dhikr | null> {
  for (const category of Object.values(ADHKAR_BY_CATEGORY)) {
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
  date: string
): Promise<{ completed: boolean; currentCount: number }> {
  void userId;
  const progress = getTodayWorship(date).adhkar[category];
  return { completed: progress?.completed ?? false, currentCount: progress?.count ?? 0 };
}

/**
 * Update adhkar progress
 */
export async function updateAdhkarProgress(
  userId: string,
  category: AdhkarCategory,
  date: string,
  progress: { completed?: boolean; currentCount?: number }
): Promise<{ completed: boolean; currentCount: number }> {
  void userId;
  const day = getTodayWorship(date);
  const previous = day.adhkar[category] ?? { completed: false, count: 0 };
  const current = {
    completed: progress.completed ?? previous.completed,
    count: progress.currentCount ?? previous.count,
  };
  day.adhkar[category] = current;
  saveWorshipDay(day);
  return { completed: current.completed, currentCount: current.count };
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