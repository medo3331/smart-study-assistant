import type { LucideIcon } from "lucide-react";

/** Islamic/Worship domain types */
export interface PrayerTime {
  name: string;
  arabicName: string;
  time: string; // "05:30"
  timestamp: number; // Unix timestamp
  isNext: boolean;
  isCurrent: boolean;
}

export interface PrayerTimesData {
  date: string; // ISO date string
  hijriDate: string;
  location: string;
  calculationMethod: string;
  madhab: string;
  times: PrayerTime[];
  nextPrayer: PrayerTime | null;
}

export interface Surah {
  id: number;
  name: string;
  arabicName: string;
  englishName: string;
  revelationType: "Meccan" | "Medinan";
  ayahCount: number;
  juzNumber: number;
}

export interface Ayah {
  number: number;
  text: string;
  surahId: number;
  juzNumber: number;
  pageNumber: number;
}

export interface QuranProgress {
  surahId: number;
  ayahId: number;
  dailyTarget: number;
  currentCount: number;
  lastReadAt: string;
}

export type AdhkarCategory = "morning" | "evening" | "after-prayer" | "sleep" | "general";

export interface Dhikr {
  id: string;
  category: AdhkarCategory;
  text: string;
  source?: string;
  repeatCount: number;
  transliteration?: string;
}

export interface AdhkarProgress {
  category: AdhkarCategory;
  date: string; // ISO date string
  completed: boolean;
  currentCount: number;
}

export interface UserIslamicSettings {
  userId: string;
  location: {
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  calculationMethod: string; // e.g., "Muslim World League"
  madhab: "shafi" | "hanafi";
  prayerNotifications: boolean;
  adhanEnabled: boolean;
  reminderMinutes: number; // minutes before prayer
  morningAdhkarReminder: boolean;
  eveningAdhkarReminder: boolean;
  sleepAdhkarReminder: boolean;
  quranDailyTarget: number; // ayahs per day
}

/* =========================================================================
 * Magicly domain types
 * These describe the SHAPE of data the UI expects. Today they are fed by
 * mock data (see lib/mock-data.ts); swapping in a real API later only requires
 * replacing the mock with a fetch that returns these same types.
 * ========================================================================= */

/** A signed-in learner. */
export interface User {
  id: string;
  name: string;
  /** URL to the avatar photo. `undefined` falls back to the initial letter. */
  avatarUrl?: string;
  /** First letter shown as fallback when there is no photo. */
  initials: string;
  /** Learner level, shown in the amber LV badge next to the avatar. */
  level: number;
  /** Current lesson index + total for the greeting subtitle, e.g. "الدرس 1 من 3". */
  lessonIndex: number;
  lessonTotal: number;
  /** Subject of the current lesson, used in the greeting subtitle. */
  subject: string;
}

/** The four retention stats shown across the top of the dashboard. */
export interface DashboardStats {
  xp: number;
  /** Current consecutive-day learning streak. */
  streakDays: number;
  completedLessons: number;
  /** Minutes learned in the last 7 days. */
  weeklyLearningMinutes: number;
}

/** Progress readout for the orbiting-avatar signature element. */
export interface AvatarProgress {
  /** Days of the current streak — drives the number of orbiting dots. */
  streakDays: number;
  /**
   * Today's actual completion percentage (0–100). Drives the orbit glow
   * intensity. This is a REAL readout, not decoration.
   */
  todayCompletionPct: number;
}

/** State machine for a lesson's primary action button. */
export type LessonState = "start" | "continue" | "review";

/** One row in the "your lessons" list. */
export interface LessonSummary {
  id: string;
  title: string;
  /** Short category / track label, e.g. "رياضيات". */
  category: string;
  /** Completion percentage 0–100. Drives Start/Continue/Review logic. */
  completionPct: number;
  /** Estimated length in minutes (shown as a stat). */
  durationMinutes: number;
}

/** Full lesson payload used by the lesson page. */
export interface Lesson {
  id: string;
  title: string;
  category: string;
  completionPct: number;
  durationMinutes: number;
  /** Short blurb shown under the title. */
  description: string;
  /** Section headers + body for each explanation mode. */
  sections: LessonSection[];
  /** How many XP this lesson awards (shown as "XP +N" badge / reward line). */
  xpReward: number;
  /** Lesson type badge, e.g. "عملي" (practical) / "نظري" (theory). */
  lessonType: string;
  /** Lessons in this unit, for the segmented progress bar (1 = current). */
  unitLessons: { id: string; title: string }[];
}

/** A quick-action pill in the dashboard hero. */
export interface QuickAction {
  label: string;
  icon: LucideIcon;
  href: string;
}

/** A breadcrumb segment. */
export interface Crumb {
  label: string;
  href?: string;
}

/** One explanation section for a given mode (Academic / Visual / Practical). */
export interface LessonSection {
  heading: string;
  body: string;
}

/** The three explanation modes selectable via the unified Tabs component. */
export type ExplanationMode = "academic" | "visual" | "practical";

/** Static descriptor for a nav item in the sidebar. */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Marks the active route. */
  active?: boolean;
}

/** Descriptor for a single stat card. */
export interface StatCardData {
  key: string;
  label: string;
  value: number;
  /** Unit suffix, e.g. "نقطة", "دقيقة", or "" for plain counts. */
  unit?: string;
  icon: LucideIcon;
  /** Accent color (arbitrary Tailwind value), e.g. "text-[#FB923C]". */
  accent: string;
  /** Glow/accent ring color in arbitrary form, e.g. "bg-[#FB923C]". */
  accentSolid: string;
}
