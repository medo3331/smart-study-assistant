// lib/agent/plan-draft.ts
//
// Academic Agent — عقد الخطة القابلة للتنفيذ (Plan Draft Contract).
//
// Coach بيقدّم الخطة في الشات كمسودة داخل كتلة ```plan — الطالب يعتمدها
// بزر واحد، والاعتماد هو الوحيد اللي بينشئ بيانات حقيقية (exam_plans).
// الدوال هنا pure — نفس الشكل بيتحقق منه في السيرفر والواجهة.

import type { DayKind } from "@/lib/exam-intent";

export interface PlanDraftDay {
  dayNumber: number;
  kind: DayKind;
  title: string;
  description: string;
}

export interface PlanDraft {
  subject: string;
  examDate: string; // "YYYY-MM-DD"
  days: PlanDraftDay[];
}

export const PLAN_DRAFT_LIMITS = {
  subject: 120,
  description: 400,
  minDays: 1,
  maxDays: 14,
  maxTitle: 120,
} as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_FENCE_RE = /```plan\s*\n([\s\S]*?)```/;

function clampStr(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isDayKind(v: unknown): v is DayKind {
  return v === "content" || v === "review" || v === "quiz";
}

function isValidISODate(v: string): boolean {
  if (!ISO_DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * استخراج مسودة الخطة من كتلة ```plan داخل رد المساعد.
 * بيرجّع الخام كمان عشان الواجهة تشيل الكتلة من العرض.
 */
export function extractPlanDraft(message: string): { draft: PlanDraft; raw: string } | null {
  const match = PLAN_FENCE_RE.exec(message || "");
  if (!match) return null;
  const raw = match[0];
  try {
    const parsed = JSON.parse(match[1]);
    const result = validatePlanDraft(parsed);
    if (result.draft) return { draft: result.draft, raw };
    return null;
  } catch {
    return null;
  }
}

/** إزالة كتلة الخطة من نص الرد — عشان متتعرض كـ code block خام. */
export function stripPlanFence(message: string): string {
  return (message || "").replace(PLAN_FENCE_RE, "").trimEnd();
}

export type PlanDraftValidation =
  | { draft: PlanDraft; error: null }
  | { draft: null; error: string };

/**
 * التحقق الصارم من مسودة الخطة قبل أي كتابة في قاعدة البيانات.
 * بيقصّ النصوص الطويلة (clamp) بدل رفضها — نفس أسلوب /api/exam-plan.
 */
export function validatePlanDraft(input: unknown): PlanDraftValidation {
  if (!input || typeof input !== "object") {
    return { draft: null, error: "البيانات المبعوتة غير صالحة." };
  }
  const body = input as Record<string, unknown>;

  const subject = clampStr(body.subject, PLAN_DRAFT_LIMITS.subject);
  if (!subject) return { draft: null, error: "لازم تكتب اسم المادة." };

  const examDate = clampStr(body.examDate, 10);
  if (!isValidISODate(examDate)) {
    return { draft: null, error: "تاريخ الامتحان لازم يكون تاريخ صحيح بصيغة YYYY-MM-DD." };
  }

  if (!Array.isArray(body.days) || body.days.length < PLAN_DRAFT_LIMITS.minDays || body.days.length > PLAN_DRAFT_LIMITS.maxDays) {
    return { draft: null, error: `عدد الأيام لازم يكون بين ${PLAN_DRAFT_LIMITS.minDays} و ${PLAN_DRAFT_LIMITS.maxDays}.` };
  }

  const days: PlanDraftDay[] = [];
  for (const item of body.days) {
    if (!item || typeof item !== "object") {
      return { draft: null, error: "شكل أحد الأيام غير صالح." };
    }
    const day = item as Record<string, unknown>;
    const dayNumber = Number(day.dayNumber);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > PLAN_DRAFT_LIMITS.maxDays) {
      return { draft: null, error: `رقم اليوم لازم يكون بين 1 و ${PLAN_DRAFT_LIMITS.maxDays}.` };
    }
    if (!isDayKind(day.kind)) {
      return { draft: null, error: "نوع اليوم لازم يكون content أو review أو quiz." };
    }
    const title = clampStr(day.title, PLAN_DRAFT_LIMITS.maxTitle);
    if (!title) return { draft: null, error: "كل يوم لازم له عنوان." };
    days.push({
      dayNumber,
      kind: day.kind,
      title,
      description: clampStr(day.description, PLAN_DRAFT_LIMITS.description),
    });
  }

  days.sort((a, b) => a.dayNumber - b.dayNumber);
  return { draft: { subject, examDate, days }, error: null };
}
