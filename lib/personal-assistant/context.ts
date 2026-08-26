// 🧩 بناء سياق المساعد الشخصي — Phase 2A (Real User Context, بدون AI).
//
// المسؤولية الوحيدة للملف ده: تحويل البيانات الخام اللي الداشبورد عايشة فيها
// أصلاً (profiles / study_days / activity_log / planner_goals) إلى سياق واحد
// مطبّع (normalized) تقراه طبقة الرسائل (briefing.ts) زي ما هي.
//
// ⛔ القواعد الصارمة:
//   - لا اختراع: أي رقم في السياق مصدره صف فعلي في الداتابيز أو مش موجود (null).
//   - لا استعلامات هنا: الملف ده functions صافية — القراءة مسؤولية page.tsx.
//   - لا schema: أنواع المشروع الجاهزة تتستخدم كما هي (StudyDay / ActivityLog /
//     ActivityEntry من app/dashboard/components/types.ts).

import type { Persona } from "@/lib/user-persona";
import type { StudyDay, ActivityLog } from "@/app/dashboard/components/types";

// ---------------------------------------------------------------------------
// الأنواع العامة
// ---------------------------------------------------------------------------

/** صف هدف قادم من planner_goals (غير المكتملة بس هي اللي بتوصل هنا). */
export interface PendingGoalRow {
  title: string;
  /** تاريخ الاستحقاق ISO (YYYY-MM-DD) أو null لو مالوش. */
  due_date: string | null;
  priority: number | null;
  is_done: boolean;
}

/** تقدّم الخطة الحالي — مفيش منه أي حاجة لو مستخدم ملوش خطة. */
export interface StudyProgress {
  /** رقم أول يوم لسه ما اتخلصش (1-based)، وإجمالي الأيام لو خلصها كلها. */
  currentDay: number;
  completedDays: number;
  totalDays: number;
  progressPct: number;
}

/** ملخص أهداف المستخدم الحقيقية غير المكتملة. */
export interface GoalsSummary {
  pendingCount: number;
  /** أول ٣ عناوين للعرض — كامل الكمام محفوظ للعدد وحده. */
  pendingTitles: string[];
  /** أهداف استحقاقها خلال ٣ أيام أو فاتّ (يعني لازم تعتني بيها النهارده). */
  urgentCount: number;
  /** أقرب هدف — ترتيب الاستحقاق ثم الأولوية العالية. */
  nextGoal?: {
    title: string;
    dueDate?: string;
    priority?: number;
  };
}

/** إحصائيات التركيز من activity_log — أصفار لو مافيش أي نشاط مسجّل. */
export interface RecentActivity {
  focusMinutesToday: number;
  focusMinutesWeek: number;
  activeDaysCount: number;
}

/** السياق المطبّع اللي المساعد الشخصي بيعتمد عليه بالكامل. */
export interface PersonalAssistantContext {
  userName: string;
  role: Persona | null;
  /** معنى هذا فقط لpersona="student"؛ null لباقي الشخصيات أو المستوى غير الصالح. */
  studentLevel: StudentLevelKey | null;
  subject: string | null;

  streak: number;
  xp: number;

  studyProgress: StudyProgress | null;
  goals: GoalsSummary | null;
  recentActivity: RecentActivity | null;
}

/** مفاتيح المستويات التعليمية الصالحة — نفس قيم StudentLevel النوع الخاص بالمشروع. */
export type StudentLevelKey = "prep" | "high" | "uni" | "masters";

// ---------------------------------------------------------------------------
// بناء السياق — دالة صافية واحدة بتجمع المصادر
// ---------------------------------------------------------------------------

export interface BuildContextInput {
  userName: string;
  role: Persona | null;
  studentLevel: string | null;
  subject: string | null;
  streak: number;
  xp: number;
  /** أيام الخطة الحالية — هي الفاضية معناها مفيش خطوة أو بتتحمل. */
  days: StudyDay[];
  /** الأهداف غير المكتملة للمستخدم الحالي فقط. */
  pendingGoals: PendingGoalRow[];
  /** سجل النشاط اليومي (نفس حالة الداشبورد ليوم بأكمله أو أكتر). */
  activityLog: ActivityLog;
  /** حقن التاريخ للتحقق بدون انتظار — تسقيط زمن الاختبارات (اختياري). */
  now?: Date;
}

export const GOALS_TITLE_LIMIT = 3;

/**
 * تحويل البيانات الخام إلى سياق المساعد. كل قسم بيبقى null أو أصفار بهدوء
 * لو البيانات فاضية، والفاضية ليها معنى واحد: بطاقة نقصان عرض في الـUI.
 */
export function buildPersonalContext(input: BuildContextInput): PersonalAssistantContext {
  const { userName, role, studentLevel, subject, streak, xp, days, pendingGoals, activityLog, now = new Date() } = input;

  return {
    userName: userName.trim(),
    role,
    studentLevel: normalizeStudentLevel(studentLevel),
    subject: normalizeSubject(subject),
    streak: streak > 0 ? Math.floor(streak) : 0,
    xp: xp >= 0 ? Math.floor(xp) : 0,

    studyProgress: buildStudyProgress(days),
    goals: buildGoals(pendingGoals, now),
    recentActivity: buildRecentActivity(activityLog, now),
  };
}

// ---------------------------------------------------------------------------
// أجزاء البناء
// ---------------------------------------------------------------------------

/** ١. تقدّم الخطة: محسوب من study_days زي ما الداشبورد شايفه بعينه. */
function buildStudyProgress(days: StudyDay[]): StudyProgress | null {
  const totalDays = days.length;
  if (totalDays === 0) return null;

  const completedDays = days.filter((d) => d.isCompleted).length;
  const firstPending = days.find((d) => !d.isCompleted);

  return {
    currentDay: firstPending ? firstPending.day : totalDays,
    completedDays,
    totalDays,
    progressPct: Math.round((completedDays / totalDays) * 100),
  };
}

/** ٢. الأهداف: عدّ + عناوين أول ثلاثة + استعجاج خلال ٣ أيام أو اتنين فاتوا. */
function buildGoals(rows: PendingGoalRow[], now: Date): GoalsSummary | null {
  // عندنا حاجتين نتعامل معاهم: ١) مفيش جدول أو مش جاي أساساً (rows ناقصة)
  // ٢) الصفوف موجودة لكن فعلاً صفر أهداف معلقة — الأولى "مش متوفر"،
  // الثانية "متوفر وصفر" — الاتنين بيطلعوا null هنا والفرق مسؤولية page.tsx.
  if (!rows || rows.length === 0) return null;

  const todayStr = toDateKey(now);
  const inThreeDaysMs = now.getTime() + 3 * 24 * 60 * 60 * 1000;

  let urgentCount = 0;
  let nextGoal: GoalsSummary["nextGoal"];

  for (const row of rows) {
    if (!row.title?.trim()) continue;
    const dueDate = row.due_date ?? null;
    const priority = typeof row.priority === "number" ? row.priority : null;

    if (dueDate) {
      // الغرض مستعجل لو استحقاقه ضمن ٣ أيام (أو فات أصلاً ومازال غير مكتمل).
      if (dueDate <= todayStr || new Date(`${dueDate}T00:00:00`).getTime() <= inThreeDaysMs) {
        urgentCount += 1;
      }
    }

    // أقرب هدف: أسبق تاريخ استحقاق يكسب، ولو التعادل في التاريخ فالأولوية الأعلى.
    if (
      !nextGoal ||
      (nextGoal.dueDate && dueDate && dueDate < nextGoal.dueDate) ||
      (!nextGoal.dueDate && dueDate) ||
      (nextGoal.dueDate && dueDate === nextGoal.dueDate && priority !== null && (nextGoal.priority ?? 0) < priority)
    ) {
      nextGoal = {
        title: row.title.trim(),
        ...(dueDate ? { dueDate } : {}),
        ...(priority !== null ? { priority } : {}),
      };
    }
  }

  const titles = rows.map((r) => r.title.trim()).filter((t) => t.length > 0);
  if (titles.length === 0) return null;

  return {
    pendingCount: titles.length,
    pendingTitles: titles.slice(0, GOALS_TITLE_LIMIT),
    urgentCount,
    nextGoal,
  };
}

/** ٣. النشاط الأخير: قراءة مباشرة من activity_log بعملها الداشبورد. */
function buildRecentActivity(log: ActivityLog, now: Date): RecentActivity {
  const EMPTY: RecentActivity = { focusMinutesToday: 0, focusMinutesWeek: 0, activeDaysCount: 0 };

  if (!log || Object.keys(log).length === 0) return EMPTY;

  const focusToday = log[toDateKey(now)]?.focusMinutes ?? 0;

  // آخر ٧ أيام: البناء مرتب على مفاتيح YYYY-MM-DD التصاعدي ثم قطع ٧.
  const dayKeys = Object.keys(log)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  const weekKeys = dayKeys.slice(-7);

  let focusWeek = 0;
  let activeDays = 0;
  for (const key of weekKeys) {
    const entry = log[key];
    if (!entry) continue;
    focusWeek += entry.focusMinutes ?? 0;
    if ((entry.focusMinutes ?? 0) > 0 || (entry.tasksCompleted ?? 0) > 0) activeDays += 1;
  }

  return { focusMinutesToday: focusToday, focusMinutesWeek: focusWeek, activeDaysCount: activeDays };
}

// ---------------------------------------------------------------------------
// أدوات داخلية
// ---------------------------------------------------------------------------

function normalizeStudentLevel(raw: string | null): StudentLevelKey | null {
  if (raw === "prep" || raw === "high" || raw === "uni" || raw === "masters") return raw;
  return null;
}

function normalizeSubject(raw: string | null): string | null {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
