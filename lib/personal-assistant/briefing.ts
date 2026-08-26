// المساعد الشخصي — توليد الرسائل بناءً على سياق المستخدم.
// المرحلة الحالية: اسم + وقت محلي + دور.
// السياق الموسع (goals/tasks/streak/progress/recentActivity) محضّر
// كحقول اختيارية في الواجهة، لكن مش بيستخدم بعد.

import type { Persona } from "@/lib/user-persona";

// ---------------------------------------------------------------------------
// الأنواع
// ---------------------------------------------------------------------------

export type TimePeriod = "morning" | "evening";

/** النتيجة المنظّمة — UI بتستلمها جاهزة وتعرضها. */
export interface BriefingResult {
  timePeriod: TimePeriod;
  greeting: string;
  baseMessage: string;
  roleMessage: string | null;
}

/** مدخلات الدالة — كل حاجة اختيارية عدا الدور. */
export interface BriefingContext {
  userName?: string | null;
  role?: Persona | null;
  /** غير مُستخدم حاليًا — محضّر للمرحلة الجاية. */
  language?: string;
  /** غير مُستخدم حاليًا — الوقت بيحتسب محليًا. */
  timezone?: string;
  /** غير مُستخدم حاليًا */
  goals?: string[];
  /** غير مُستخدم حاليًا */
  tasks?: string[];
  /** غير مُستخدم حاليًا */
  streak?: number;
  /** غير مُستخدم حاليًا */
  progress?: number;
  /** غير مُستخدم حاليًا */
  recentActivity?: string[];
}

// ---------------------------------------------------------------------------
// الثوابت
// ---------------------------------------------------------------------------

const GREETING: Record<TimePeriod, string> = {
  morning: "أسعد الله صباحك بكل خير",
  evening: "أسعد الله مساءك بكل خير",
};

const ROLE_MESSAGE: Record<string, string> = {
  student: "وبعدها نبدأ درس النهارده ونخلص جزء من مذاكرتك 📚",
  grad: "وبعدها نكمّل تطوير مهاراتك ونقربك من هدفك المهني 🚀",
  freelancer: "وبعدها نراجع مهام شغلك ونشوف أهم حاجة محتاجة تخلصها النهارده 💼",
};

/** الرسالة الثابتة — سطور منفصلة عشان UI تعرضها كل سطر لوحده. */
const BASE_LINES = [
  "متنساش تقرأ الورد اليومي بتاعك",
  "وتصلّي الفروض في وقتها",
  "وتخلّص الأذكار",
  "وتبدأ تخلّص مهامك عشان ربنا يوفقك 💙",
] as const;

// ---------------------------------------------------------------------------
// الوقت
// ---------------------------------------------------------------------------

function getTimePeriod(): TimePeriod {
  const hour = new Date().getHours();
  // 5 صباحًا → 5 مساءً = صباح
  return hour >= 5 && hour < 17 ? "morning" : "evening";
}

// ---------------------------------------------------------------------------
// الدالة الرئيسية
// ---------------------------------------------------------------------------

export function getPersonalAssistantBriefing(ctx: BriefingContext): BriefingResult {
  const timePeriod = getTimePeriod();
  const name = ctx.userName?.trim();
  const namePart = name ? ` يا ${name}` : " يا صاحبي";

  const greeting = `${GREETING[timePeriod]}${namePart} 💙`;
  const baseMessage = BASE_LINES.join("\n");

  const roleMessage = ctx.role && ctx.role in ROLE_MESSAGE
    ? ROLE_MESSAGE[ctx.role]
    : null;

  return { timePeriod, greeting, baseMessage, roleMessage };
}
