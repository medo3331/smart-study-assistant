// lib/magic/greeting.ts
//
// Magic Greeting — أول لقاء في اليوم (Phase 4: Magic في الداشبورد).
// منطق pure بدون أي نداء AI — الترحيب والاقتراحات من بيانات حقيقية، والكلفة صفر.
// الهدف من الوثيقة: «أول ما الطالب يدخل يظهرله رسالة ترحيب من Magic
// ويبدأ يقترح عليه نعمل ايه انهارده ويرشده».
//
// 🏅 نمط Duolingo: بيجيب معاه المستوى والسلسلة (streak) وتقدم XP ومهام
//    planner_goals المفتوحة، ويلاحظ غياب المذاكرة بلطف (مش لوم).

import { levelFromXp, XP_PER_LEVEL } from "@/lib/shop/economy";

export interface MagicSuggestion {
  id: string;
  icon: string;
  label: string;
  href: string;
  hint: string;
}

/** بيانات الاقتصاد/الاحتفاظ من profiles — كلها server-side، الكلاينت بيقراها بس. */
export interface MagicEconomyStats {
  xp: number;
  streak: number;
  /** profiles.last_study_day بصيغة YYYY-MM-DD (أو ISO كامل — بتتقارن بالتاريخ). */
  lastStudyDay: string | null;
  /** تاريخ النهارده بصيغة YYYY-MM-DD (محلي). */
  today: string;
}

export interface MagicGreetingInput {
  displayName: string | null;
  /** ساعة اليوم 0–23 (توقيت المستخدم). */
  hour: number;
  /** الخطة النشطة — null لو مفيش. */
  activePlan: {
    subject: string;
    examDate: string;
    daysLeft: number;
    /** مهمة النهارده من الخطة — null لو اليوم خلص أو مفيش خطة. */
    todayTask: { title: string } | null;
  } | null;
  workspaceFiles: number;
  /** 🏅 المستوى والسلسلة وملاحظة الغياب — null لو البيانات مش متاحة. */
  economy?: MagicEconomyStats | null;
  /** 📋 عناوين مهام planner_goals المفتوحة (المهمّة الأول). */
  tasks?: string[];
}

export interface MagicGreetingStats {
  level: number;
  streak: number;
  /** نقاط XP داخل المستوى الحالي. */
  xpInLevel: number;
  /** نقاط ناقصة للمستوى الجاي. */
  xpToNext: number;
  /** تقدم المستوى 0–100. */
  progressPercent: number;
}

export interface MagicGreeting {
  greeting: string;
  sub: string;
  suggestions: MagicSuggestion[];
  /** شريط المستوى والسلسلة — null لو مفيش بيانات. */
  stats: MagicGreetingStats | null;
  /** 📉 ملاحظة غياب المذاكرة — بلطف. null لو مذاكر النهارده أو مفيش دليل. */
  nudge: string | null;
  /** 📋 مهام مفتوحة من المخطط. */
  tasks: string[];
}

function timeGreeting(hour: number): string {
  const h = Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.floor(hour))) : 12;
  if (h >= 5 && h < 12) return "صباح الخير";
  if (h >= 12 && h < 17) return "نهارك سعيد";
  return "مساء الخير";
}

/** عدد الأيام الغايبة بين يومي المذاكرة والنهارده (YYYY-MM-DD — فارق بالأيام). */
export function daysSinceStudy(lastStudyDay: string, today: string): number {
  const last = String(lastStudyDay).slice(0, 10);
  const t = String(today).slice(0, 10);
  const ms = Date.parse(`${t}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms / 86_400_000);
}

/** ملاحظة الغياب — بلطف وتشجيع (نفس روح streak-reminder: مفيش دليل = مفيش رسالة). */
export function buildAbsenceNudge(economy: MagicEconomyStats): string | null {
  const { lastStudyDay, today, streak } = economy;
  if (!lastStudyDay) return null; // بيانات قديمة قبل الترحيل — مفيش دليل، مفيش لوم
  const missed = daysSinceStudy(lastStudyDay, today);
  if (missed <= 0) {
    return streak > 1
      ? `سلسلتك مستمرة ${streak} يوم 🔥 — علّم النهارده كمان عشان متتقطعش!`
      : "مذاكرت النهارده؟ أكمل خطوة واحدة كمان وهتزيد في السلسلة 🔥";
  }
  if (missed === 1) {
    return "غايب يوم واحد بس عن المذاكرة — ١٥ دقيقة دلوقتي ترجّع السلسلة 🔥";
  }
  if (missed <= 3) {
    return `مذاكرتك واقفة من ${missed} أيام — السلسلة مستنياك، نبدأ النهارده بخطوة صغيرة؟`;
  }
  return `طولت غايب ${missed} أيام 😅 مفيش مشكلة خالص — بنرجّع السلسلة النهارده بخطوة واحدة بسيطة.`;
}

function buildStats(economy: MagicEconomyStats): MagicGreetingStats {
  const level = levelFromXp(economy.xp);
  const xpInLevel = Math.max(0, economy.xp) % XP_PER_LEVEL;
  return {
    level,
    streak: Math.max(0, economy.streak),
    xpInLevel,
    xpToNext: XP_PER_LEVEL - xpInLevel,
    progressPercent: Math.min(100, Math.round((xpInLevel / XP_PER_LEVEL) * 100)),
  };
}

export function buildMagicGreeting(input: MagicGreetingInput): MagicGreeting {
  const name = (input.displayName || "").trim();
  const greeting = `${timeGreeting(input.hour)}${name ? ` يا ${name}` : ""}! ⚡`;

  const suggestions: MagicSuggestion[] = [];

  // 📋 مهام الطالب المفتوحة — الأولوية القصوى زي Duolingo: «ده اللي عليك النهارده».
  const tasks = (input.tasks ?? []).slice(0, 3);
  if (tasks.length > 0) {
    suggestions.push({
      id: "open_tasks",
      icon: "📋",
      label: `مهام مستنياك: ${tasks[0]}`,
      href: "/dashboard/planner",
      hint: tasks.length > 1 ? `و${tasks.length - 1} مهمة كمان — خلّصها واكسب كوينز 🪙` : "خلّصها واكسب كوينز 🪙",
    });
  }

  if (input.activePlan) {
    const plan = input.activePlan;
    if (plan.todayTask) {
      suggestions.push({
        id: "plan_today",
        icon: "🎯",
        label: `كمّل خطتك: ${plan.todayTask.title}`,
        href: "/dashboard/planner",
        hint: `امتحان ${plan.subject} — فاضل ${plan.daysLeft} يوم`,
      });
    } else {
      suggestions.push({
        id: "plan_review",
        icon: "✅",
        label: "مذاكرة النهارده خلصت — راجع أو اختبر نفسك",
        href: "/dashboard/planner",
        hint: `امتحان ${plan.subject} — فاضل ${plan.daysLeft} يوم`,
      });
    }
  }

  if (input.workspaceFiles === 0) {
    suggestions.push({
      id: "first_upload",
      icon: "📤",
      label: "ارفع أول محاضرة ليك",
      href: "/dashboard/workspace",
      hint: "هفهمها وألخصها وأعملك اختبار منها",
    });
  } else {
    suggestions.push({
      id: "ask_tutor",
      icon: "📚",
      label: "افتح درس واستفسر على أي جزء مش فاهمه",
      href: "/dashboard/workspace",
      hint: "المعلم Tutor هيسهّلك المفاهيم الصعبة",
    });
  }

  suggestions.push({
    id: "ask_magic",
    icon: "⚡",
    label: "اسألني أي حاجة عن المنصة أو مذاكرتك",
    href: "/chat",
    hint: "أنا معاك في كل الصفحات",
  });

  const sub = input.activePlan
    ? `عندك امتحان ${input.activePlan.subject} بعد ${input.activePlan.daysLeft} يوم — خطة جاهزة مستنياك.`
    : tasks.length > 0
      ? "مهام النهارده جاهزة تحت — خلّص واحدة واكسب كوينز 🪙"
      : "أنا Magic، مدربك الشخصي. أقترحلك مهام يومية على مقاسك وأساعدك تنفّذها.";

  // 🏅 شريط المستوى + ملاحظة الغياب (best-effort — null لو البيانات مش متاحة).
  const nudge = input.economy ? buildAbsenceNudge(input.economy) : null;
  const stats = input.economy ? buildStats(input.economy) : null;

  return { greeting, sub, suggestions: suggestions.slice(0, 3), stats, nudge, tasks };
}

/** رسالة الترحيب داخل الشات الموحد — نفس الهوية بدون تكرار كلام مزعج. */
export function buildChatWelcomeGreeting(displayName: string | null, hour: number): string {
  const name = (displayName || "").trim();
  const who = name ? ` يا ${name}` : "";
  return `${timeGreeting(hour)}${who}! أنا Magic ⚡ — مرشدك الأكاديمي في Magicly.\n\nأقدر أشرحلك أي جزء في محاضراتك، أعملك خطة مذاكرة لو عندك امتحان، أو أساعدك في أي حاجة في المنصة. عايز نبدأ بإيه؟`;
}
