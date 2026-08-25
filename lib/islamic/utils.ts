import type { DailyProgressItem } from "@/lib/islamic/types";

/**
 * Generate default daily progress items based on prayer times
 * This is a shared utility function that can be used by both server and client components
 */
export function generateDailyProgressItems(
  prayerTimes: string[],
  nextPrayerIndex: number,
  completedPrayers: Set<string>,
  completedAdhkar: Set<string>
): DailyProgressItem[] {
  const prayerNames = [
    { id: "fajr", label: "Fajr", arabicLabel: "الفجر", iconName: "Sun", time: prayerTimes[0] },
    { id: "sunrise", label: "Sunrise", arabicLabel: "الشروق", iconName: "Sun", time: prayerTimes[1] },
    { id: "dhuhr", label: "Dhuhr", arabicLabel: "الظهر", iconName: "Sun", time: prayerTimes[2] },
    { id: "asr", label: "Asr", arabicLabel: "العصر", iconName: "Sun", time: prayerTimes[3] },
    { id: "maghrib", label: "Maghrib", arabicLabel: "المغرب", iconName: "Moon", time: prayerTimes[4] },
    { id: "isha", label: "Isha", arabicLabel: "العشاء", iconName: "Moon", time: prayerTimes[5] },
  ];

  const items: DailyProgressItem[] = [
    // Morning Adhkar
    {
      id: "morning_adhkar",
      label: "Morning Adhkar",
      arabicLabel: "أذكار الصباح",
      iconName: "Sparkles",
      completed: completedAdhkar.has("morning"),
      current: !completedAdhkar.has("morning") && nextPrayerIndex >= 1 && nextPrayerIndex <= 2,
      time: "بعد الفجر",
    },
    // Fajr
    {
      ...prayerNames[0],
      completed: completedPrayers.has("fajr"),
      current: nextPrayerIndex === 0,
    },
    // Sunrise
    {
      ...prayerNames[1],
      completed: completedPrayers.has("sunrise"),
      current: nextPrayerIndex === 1,
    },
    // Dhuhr
    {
      ...prayerNames[2],
      completed: completedPrayers.has("dhuhr"),
      current: nextPrayerIndex === 2,
    },
    // Asr
    {
      ...prayerNames[3],
      completed: completedPrayers.has("asr"),
      current: nextPrayerIndex === 3,
    },
    // Evening Adhkar
    {
      id: "evening_adhkar",
      label: "Evening Adhkar",
      arabicLabel: "أذكار المساء",
      iconName: "Sparkles",
      completed: completedAdhkar.has("evening"),
      current: !completedAdhkar.has("evening") && nextPrayerIndex >= 3 && nextPrayerIndex <= 4,
      time: "بعد العصر",
    },
    // Maghrib
    {
      ...prayerNames[4],
      completed: completedPrayers.has("maghrib"),
      current: nextPrayerIndex === 4,
    },
    // Quran Wird
    {
      id: "quran_wird",
      label: "Quran Daily Wird",
      arabicLabel: "ورد القرآن",
      iconName: "BookOpen",
      completed: completedAdhkar.has("quran"),
      current: !completedAdhkar.has("quran"),
      time: "أي وقت",
    },
    // Isha
    {
      ...prayerNames[5],
      completed: completedPrayers.has("isha"),
      current: nextPrayerIndex === 5,
    },
    // Sleep Adhkar
    {
      id: "sleep_adhkar",
      label: "Sleep Adhkar",
      arabicLabel: "أذكار النوم",
      iconName: "Moon",
      completed: completedAdhkar.has("sleep"),
      current: !completedAdhkar.has("sleep") && nextPrayerIndex === 5,
      time: "قبل النوم",
    },
  ];

  return items;
}