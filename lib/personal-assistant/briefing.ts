// 💬 توليد رسالة المساعد الشخصي — Phase 2A.
//
// الدالة دي بتستلم السياق المطبّع (PersonalAssistantContext) من context.ts
// وتطلّع رسالة جاهزة للعرض. مفيش هنا أي قاعدة بيانات ولا AI — نصوص بس.
//
// ⛔ NO FABRICATION: كل سطر ديناميكي بيتولد فقط لو البيانات موجودة فعلاً
// في السياق. لو مفيش تقدّم → سطر التقدّم بيسقط من الرسالة خالص، مش بيتكتب
// برقم ملفّق. الجزء الديني الثابت زي ما هو.

import type { PersonalAssistantContext } from "./context";

// ---------------------------------------------------------------------------
// الأنواع
// ---------------------------------------------------------------------------

export type TimePeriod = "morning" | "evening";

/** النتيجة المنظّمة — الـUI بتستقبلها جاهزة وتعرضها سطر بسطر. */
export interface BriefingResult {
  timePeriod: TimePeriod;
  greeting: string;
  baseMessage: string;
  roleMessage: string | null;
  progressMessage: string | null;
  /** ⭐ سطر الحافز النهائي بالتراك الحقيقي — بس لو في subject موجود. */
  launchMessage: string | null;
  streakMessage: string | null;
  xpMessage: string | null;
  activityMessage: string | null;
  goalsMessage: string | null;
}

/** مدخلات الدالة — السياق إجباري والباقي محضّر للمراحل الجاية. */
export interface BriefingContext {
  ctx: PersonalAssistantContext;
  /** حقن اللحظة الحالية — للاختبارات فقط، والمتشغّل بيستخدم ساعة الجهاز. */
  now?: Date;
  /** غير مُستخدم حاليًا — محضّر للمرحلة الجاية. */
  language?: string;
}

// ---------------------------------------------------------------------------
// الثوابت
// ---------------------------------------------------------------------------

const GREETING: Record<TimePeriod, string> = {
  morning: "أسعد الله صباحك بكل خير",
  evening: "أسعد الله مساءك بكل خير",
};

/** الرسالة الأساسية لكل دور — التركيز بيتغيّر حسب الشخصية. */
const ROLE_MESSAGE: Record<string, string> = {
  student: "وبعدها نبدأ درس النهارده ونخلّص جزء من مذاكرتك 📚",
  grad: "وبعدها نكمّل تطوير مهاراتك ونقرّب خطوة من هدفك المهني 🎯",
  freelancer: "وبعدها نراجع مهام شغلك ونشوف أهم تسليم لازم يقفل النهارده 💼",
};

/**
 * 🕌 الجزء الديني الثابت — مش بيتغير بأي سياق، دي رسالة الأمانة الأساسية.
 * سطور منفصلة عشان الـUI تعرضها كل سطر لوحده بنقطة ملونة.
 */
const BASE_LINES = [
  "متنساش تقرأ الورد اليومي بتاعك",
  "وتصلّي الفروض في وقتها",
  "وتخلّص أذكار الصباح والمساء",
] as const;

/** أسماء المستويات للعرض — نفس مفاتيح StudentLevel. */
const LEVEL_NAME: Record<string, string> = {
  prep: "إعدادي",
  high: "ثانوي",
  uni: "جامعي",
  masters: "دراسات عليا",
};

// ---------------------------------------------------------------------------
// الوقت
// ---------------------------------------------------------------------------

function getTimePeriod(now: Date = new Date()): TimePeriod {
  const hour = now.getHours();
  // 5 صباحًا → 5 مساءً = صباح.
  return hour >= 5 && hour < 17 ? "morning" : "evening";
}

// ---------------------------------------------------------------------------
// الأقسام الديناميكية — كل قسم بيرجع null لو بياناته غير موجودة
// ---------------------------------------------------------------------------

function buildProgressMessage(ctx: PersonalAssistantContext): string | null {
  const sp = ctx.studyProgress;
  if (!sp || sp.totalDays === 0) return null;

  const { currentDay, totalDays, progressPct } = sp;
  return `📚 أنت في اليوم ${currentDay} من ${totalDays} وأكملت ${progressPct}% من خطتك.`;
}

function buildGoalsMessage(ctx: PersonalAssistantContext): string | null {
  const g = ctx.goals;
  if (!g || g.pendingCount === 0) return null;

  const head = g.pendingCount === 1
    ? "🎯 عندك هدف واحد غير مكتمل:"
    : `🎯 عندك ${g.pendingCount} أهداف غير مكتملة.`;

  const lines: string[] = [head];

  // أول ٣ عناوين — حقيقية من planner_goals ومن غير أي إضافة.
  for (const t of g.pendingTitles) {
    lines.push(`• ${t}`);
  }

  if (g.urgentCount > 0) {
    lines.push(g.urgentCount === 1
      ? "⏰ واحد منهم استحقاقه قرّب"
      : `⏰ ${g.urgentCount} منهم استحقاقهم قرّب`);
  }

  return lines.join("\n");
}

function buildStreakMessage(ctx: PersonalAssistantContext): string | null {
  if (ctx.streak <= 0) return null;
  return ctx.streak === 1
    ? "🔥 Streak: يوم واحد."
    : `🔥 Streak: ${ctx.streak} أيام.`;
}

function buildXpMessage(ctx: PersonalAssistantContext): string | null {
  if (ctx.xp <= 0) return null;
  return `⚡ ${ctx.xp} نقطة في رصيدك.`;
}

function buildActivityMessage(ctx: PersonalAssistantContext): string | null {
  const act = ctx.recentActivity;
  if (!act) return null;

  const minutesToday = act.focusMinutesToday > 0
    ? `دايماً ذاكرت ${act.focusMinutesToday} دقيقة النهارده`
    : null;
  const weekPart = act.focusMinutesWeek > 0
    ? `${act.focusMinutesWeek} دقيقة تركيز آخر أسبوع`
    : null;
  const daysPart = act.activeDaysCount > 0
    ? `${act.activeDaysCount} أيام نشطة آخر أسبوع`
    : null;

  const parts = [minutesToday, weekPart, daysPart].filter((v): v is string => v !== null);
  if (parts.length === 0) return null;

  return `📊 ${parts.join(" · ")}.`;
}

/** ⭐ سطر الانطلاق — بس لو في تراك حقيقي موجود في البروفايل أو الخطة. */
function buildLaunchMessage(ctx: PersonalAssistantContext): string | null {
  if (!ctx.subject) return null;

  if (ctx.role === "student") {
    const level = ctx.studentLevel && LEVEL_NAME[ctx.studentLevel]
      ? ` (${LEVEL_NAME[ctx.studentLevel]})`
      : "";
    return `خلينا نكمّل ${ctx.subject}${level} النهارده ونقرّب من هدفك 🚀`;
  }
  return `خلينا نتقدم في ${ctx.subject} النهارده 🚀`;
}

// ---------------------------------------------------------------------------
// الدالة الرئيسية
// ---------------------------------------------------------------------------

export function getPersonalAssistantBriefing(input: BriefingContext): BriefingResult {
  const timePeriod = getTimePeriod(input.now);
  const ctx = input.ctx;

  // الاسم: السياق جاي مضمون إن فيه userName (المسؤول عن الفallbacks في
  // page.tsx). لوجيا احتياطي هنا: اسم فاضي → مخاطبة عامة بدل كلمة فاضية.
  const name = ctx.userName.trim();
  const namePart = name ? ` يا ${name}` : "";

  const greeting = `${GREETING[timePeriod]}${namePart} 💙`;
  const baseMessage = BASE_LINES.join("\n");

  const roleMessage = ctx.role && ROLE_MESSAGE[ctx.role]
    ? ROLE_MESSAGE[ctx.role]
    : null;

  return {
    timePeriod,
    greeting,
    baseMessage,
    roleMessage,
    progressMessage: buildProgressMessage(ctx),
    launchMessage: buildLaunchMessage(ctx),
    streakMessage: buildStreakMessage(ctx),
    xpMessage: buildXpMessage(ctx),
    activityMessage: buildActivityMessage(ctx),
    goalsMessage: buildGoalsMessage(ctx),
  };
}
