import type {
  AvatarProgress,
  DashboardStats,
  ExplanationMode,
  Lesson,
  LessonSection,
  LessonState,
  LessonSummary,
  NavItem,
  QuickAction,
  StatCardData,
  User,
} from "@/lib/types";
import {
  Flame,
  GraduationCap,
  Sparkles,
  Clock,
  Home,
  BookOpen,
  Trophy,
  Settings,
  Compass,
  Layers,
  Route,
  Coffee,
  Plus,
  Landmark,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Helpers — small pure functions reused by the UI                     */
/* ------------------------------------------------------------------ */

/** Map a completion percentage to a correct action-button state. */
export function lessonStateFromPct(pct: number): LessonState {
  if (pct <= 0) return "start";
  if (pct >= 100) return "review";
  return "continue";
}

/** Arabic label + icon for each lesson state. */
export const LESSON_STATE_META: Record<
  LessonState,
  { label: string; cta: string }
> = {
  start: { label: "جديد", cta: "ابدأ" },
  continue: { label: "قيد التقدم", cta: "تابع" },
  review: { label: "مكتمل", cta: "راجع" },
};

/** Arabic labels for the three explanation modes. */
export const EXPLANATION_MODE_LABELS: Record<ExplanationMode, string> = {
  academic: "أكاديمي",
  visual: "بصري",
  practical: "تطبيقي",
};

/* ------------------------------------------------------------------ */
/* Mock data — replace with a real API that returns the same `types`.   */
/* ------------------------------------------------------------------ */

export const mockUser: User = {
  id: "u_01",
  name: "ليلى أحمد",
  // No avatarUrl -> the component renders the initial-letter fallback.
  // Drop in a real photo URL to use the image variant.
  initials: "ل",
  level: 12,
  lessonIndex: 1,
  lessonTotal: 3,
  subject: "الرياضيات",
};

/**
 * Avatar progress: dots == streak length, glow == today's completion.
 * These two numbers are independent real readouts.
 */
export const mockAvatarProgress: AvatarProgress = {
  streakDays: 12,
  todayCompletionPct: 68,
};

export const mockStats: DashboardStats = {
  xp: 4820,
  streakDays: 12,
  completedLessons: 37,
  weeklyLearningMinutes: 215,
};

/** Derive the 4 stat cards from the stats object. */
export function buildStatCards(stats: DashboardStats): StatCardData[] {
  return [
    {
      key: "xp",
      label: "نقاط الخبرة",
      value: stats.xp,
      unit: "نقطة",
      icon: Sparkles,
      accent: "text-[#B69CFF]",
      accentSolid: "bg-[#7C5CFF]",
    },
    {
      key: "streak",
      label: "سلسلة التعلّم",
      value: stats.streakDays,
      unit: "يوم",
      icon: Flame,
      accent: "text-[#FB923C]",
      accentSolid: "bg-[#FB923C]",
    },
    {
      key: "completed",
      label: "دروس مكتملة",
      value: stats.completedLessons,
      unit: "درس",
      icon: GraduationCap,
      accent: "text-[#2DD4BF]",
      accentSolid: "bg-[#2DD4BF]",
    },
    {
      key: "weekly",
      label: "تعلّم هذا الأسبوع",
      value: stats.weeklyLearningMinutes,
      unit: "دقيقة",
      icon: Clock,
      accent: "text-[#7C5CFF]",
      accentSolid: "bg-[#7C5CFF]",
    },
  ];
}

export const mockNavItems: NavItem[] = [
  { label: "لوحة التحكم", href: "/dashboard", icon: Home, active: true },
  { label: "استكشف", href: "/dashboard", icon: Compass },
  { label: "دروسي", href: "/dashboard", icon: BookOpen },
  { label: "الإنجازات", href: "/dashboard", icon: Trophy },
  { label: "عباداتي", href: "/worship", icon: Landmark },
  { label: "الإعدادات", href: "/dashboard", icon: Settings },
];

/** Quick-action pills in the dashboard hero (أكاديمي/مرئي/عملي replaced by real actions). */
export const mockQuickActions: QuickAction[] = [
  { label: "الكورسات", icon: Layers, href: "/dashboard" },
  { label: "تابع خطتك", icon: Route, href: "/dashboard" },
  { label: "استراحة", icon: Coffee, href: "/dashboard" },
  { label: "خطة جديدة", icon: Plus, href: "/dashboard" },
];

/** The "Next Lesson" hero card — the most prominent element after the avatar. */
export const mockNextLesson: LessonSummary = {
  id: "les_204",
  title: "الدوال المثلثية للمبتدئين",
  category: "رياضيات",
  completionPct: 71,
  durationMinutes: 20,
};

export const mockLessons: LessonSummary[] = [
  mockNextLesson,
  {
    id: "les_198",
    title: "المشتقات والاتجاهات", category: "رياضيات", completionPct: 100,
    durationMinutes: 22,
  },
  {
    id: "les_177",
    title: "الاحتمالات الأساسية", category: "رياضيات", completionPct: 72,
    durationMinutes: 15,
  },
  {
    id: "les_165",
    title: "المتجهات في الفضاء", category: "فيزياء", completionPct: 0,
    durationMinutes: 20,
  },
  {
    id: "les_150",
    title: "المعادلات التفاضلية", category: "رياضيات", completionPct: 48,
    durationMinutes: 26,
  },
];

/** Full lesson payload for /lesson/[id]. */
export const mockLesson: Lesson = {
  id: "les_204",
  title: "الدوال المثلثية للمبتدئين",
  category: "رياضيات",
  completionPct: 33,
  durationMinutes: 20,
  xpReward: 100,
  lessonType: "عملي",
  description:
    "مدخل بصري وأكاديمي وتطبيقي للدوال المثلثية sine و cosine و tangent.",
  unitLessons: [
    { id: "les_204", title: "الدوال المثلثية للمبتدئين" },
    { id: "les_205", title: "الهويات المثلثية" },
    { id: "les_206", title: "المعادلات المثلثية" },
  ],
  sections: [
    {
      heading: "ما هي الدوال المثلثية؟",
      body: "تربط الدوال المثلثية زوايا المثلث القائم بأطوال أضلاعه، وهي أساس الموجات والدوران في الفيزياء والهندسة.",
    },
    {
      heading: "لماذا تهم؟",
      body: "تُستخدم في الصوت والضوء وحركة البندول والدوائر، ولذا فهي مهارة أساسية قبل الدخول في التفاضل والتكامل.",
    },
  ],
};

/** Explanation content per mode for the unified Tabs component. */
export const mockExplanation: Record<ExplanationMode, LessonSection[]> = {
  academic: [
    {
      heading: "التعريف الأكاديمي",
      body: "للمثلث القائم بزاوية θ:‎ sin θ = الضلع المقابل ÷ الوتر،‎ cos θ = الضلع المجاور ÷ الوتر،‎ tan θ = المقابل ÷ المجاور. هذه النسب ثابتة لأي مثلث متشابه.",
    },
    {
      heading: "الهوية الأساسية",
      body: "sin²θ + cos²θ = 1 لكل قيم θ، وهي حجر الزاوية في إثبات كل المتطابقات الأخرى.",
    },
  ],
  visual: [
    {
      heading: "تمثّلها بصريًا",
      body: "تخيّل نقطة تدور على دائرة نصف قطرها 1: إحداثيّها الرأسي هو sin θ والأفقي هو cos θ. بهذا يتحول الزمن إلى موجة ناعمة.",
    },
    {
      heading: "الدورة",
      body: "كل 360° (أو 2π راديان) تعود النقطة لنقطة البداية — لذا كل الدوال المثلثية دورية.",
    },
  ],
  practical: [
    {
      heading: "تطبيق عملي",
      body: "لحساب ارتفاع برج من بُعد 50م وزاوية رؤية 30°:‎ الارتفاع = 50 × tan(30°) ≈ 28.9م.",
    },
    {
      heading: "تمرين سريع",
      body: "إذا كان cos θ = 0.6، فما قيمة sin θ؟ (تلميح: استخدم المتطابقة الأساسية).",
    },
  ],
};

/* =========================================================================
 * Dashboard redesign payloads (premium SaaS restyle)
 * Demo/mock data only — swap with real API payloads later.
 * ========================================================================= */

/** One badge in the dashboard achievements strip. */
export interface Achievement {
  id: string;
  name: string;
  unlocked: boolean;
  /** Unlocked badges get the gold accent. */
  gold?: boolean;
  /** For locked badges: progress toward unlocking. */
  progress?: { current: number; target: number };
}

export const mockAchievements: Achievement[] = [
  { id: "streak-7", name: "سلسلة ٧ أيام", unlocked: true, gold: true },
  { id: "lessons-10", name: "١٠ دروس مكتملة", unlocked: true, gold: false },
  {
    id: "xp-2500",
    name: "٢٥٠٠ نقطة",
    unlocked: false,
    progress: { current: 2450, target: 2500 },
  },
];

/** Study minutes per weekday (oldest → newest, RTL display right→left). */
export const mockWeeklyStudy = [
  { day: "السبت", minutes: 45 },
  { day: "الأحد", minutes: 30 },
  { day: "الاثنين", minutes: 60 },
  { day: "الثلاثاء", minutes: 20 },
  { day: "الأربعاء", minutes: 55 },
  { day: "الخميس", minutes: 80 },
  { day: "الجمعة", minutes: 35 },
];

/**
 * Worship preview readout for the dashboard shortcut card.
 * Mirrors what the /worship page shows; the card itself is navigation-only.
 */
export const mockWorshipPreview = { quranWirdRead: 6, quranWirdTarget: 10 };
