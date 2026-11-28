import type { DailyProgressItem } from "@/lib/islamic/types";

/**
 * Generate default daily progress items based on prayer times
 * This is a shared utility function that can be used by both server and client components
 */
export function generateDailyProgressItems(
  prayerTimes: string[],
  nextPrayerIndex: number,
  completedPrayers: Set<string>,
  completedAdhkar: Set<string>,
  quranCompleted = false,
  quranProgressLabel = "",
): DailyProgressItem[] {
  const prayerNames = [
    { id: "fajr", label: "Fajr", arabicLabel: "الفجر", iconName: "Sun", time: prayerTimes[0], href: "/worship/prayer-times" },
    { id: "dhuhr", label: "Dhuhr", arabicLabel: "الظهر", iconName: "Sun", time: prayerTimes[1], href: "/worship/prayer-times" },
    { id: "asr", label: "Asr", arabicLabel: "العصر", iconName: "Sun", time: prayerTimes[2], href: "/worship/prayer-times" },
    { id: "maghrib", label: "Maghrib", arabicLabel: "المغرب", iconName: "Moon", time: prayerTimes[3], href: "/worship/prayer-times" },
    { id: "isha", label: "Isha", arabicLabel: "العشاء", iconName: "Moon", time: prayerTimes[4], href: "/worship/prayer-times" },
  ];

  const items: DailyProgressItem[] = [
    // Morning Adhkar
    {
      id: "morning_adhkar",
      label: "Morning Adhkar",
      arabicLabel: "أذكار الصباح",
      iconName: "Sparkles",
      completed: completedAdhkar.has("morning"),
      current: !completedAdhkar.has("morning") && nextPrayerIndex <= 1,
      time: "بعد الفجر",
      href: "/worship/adhkar",
    },
    // Fajr
    {
      ...prayerNames[0],
      completed: completedPrayers.has("fajr"),
      current: nextPrayerIndex === 0,
    },
    // Dhuhr
    {
      ...prayerNames[1],
      completed: completedPrayers.has("dhuhr"),
      current: nextPrayerIndex === 1,
    },
    // Asr
    {
      ...prayerNames[2],
      completed: completedPrayers.has("asr"),
      current: nextPrayerIndex === 2,
    },
    // Evening Adhkar
    {
      id: "evening_adhkar",
      label: "Evening Adhkar",
      arabicLabel: "أذكار المساء",
      iconName: "Sparkles",
      completed: completedAdhkar.has("evening"),
      current: !completedAdhkar.has("evening") && nextPrayerIndex >= 2 && nextPrayerIndex <= 3,
      time: "بعد العصر",
      href: "/worship/adhkar",
    },
    // Maghrib
    {
      ...prayerNames[3],
      completed: completedPrayers.has("maghrib"),
      current: nextPrayerIndex === 3,
    },
    // Quran Wird
    {
      id: "quran_wird",
      label: "Quran Daily Wird",
      arabicLabel: "ورد القرآن",
      iconName: "BookOpen",
      completed: quranCompleted,
      current: !quranCompleted,
      time: quranProgressLabel || "أي وقت",
      href: "/worship/quran",
    },
    // Isha
    {
      ...prayerNames[4],
      completed: completedPrayers.has("isha"),
      current: nextPrayerIndex === 4,
    },
    // Sleep Adhkar
    {
      id: "sleep_adhkar",
      label: "Sleep Adhkar",
      arabicLabel: "أذكار النوم",
      iconName: "Moon",
      completed: completedAdhkar.has("sleep"),
      current: !completedAdhkar.has("sleep") && nextPrayerIndex === 4,
      time: "قبل النوم",
      href: "/worship/adhkar",
    },
  ];

  return items;
}