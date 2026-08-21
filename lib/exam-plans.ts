/* ==========================================================================
   طبقة بيانات خطط الطوارئ

   نفس نمط lib/pages-data.ts بالظبط: كل دالة بترجّع Result<T> شكله
   { data, error } — مش { ok } — والخطأ بيتحوّل لرسالة «شغّل الملف» لو
   الجدول ناقص.

   ⚠️ محتاجة db/exam-plans.sql يتشغّل في Supabase الأول.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DayKind } from "./exam-intent";

/* --------------------------------------------------------------------------
   الأخطاء — نسخة محلية عشان الرسالة تشاور على الملف الصح
   -------------------------------------------------------------------------- */

export const MISSING_TABLE = "MISSING_TABLE" as const;

export interface DataError {
  kind: typeof MISSING_TABLE | "GENERIC";
  message: string;
}

interface PgError {
  code?: string;
  message?: string;
}

export function toExamDataError(error: unknown): DataError {
  const err = (error ?? {}) as PgError;
  const code = err.code ?? "";
  const msg = err.message ?? "";

  const looksMissing =
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42703" ||
    code === "PGRST204" ||
    /relation .* does not exist/i.test(msg) ||
    /could not find the .* (table|column)/i.test(msg) ||
    /column .* does not exist/i.test(msg);

  if (looksMissing) {
    return {
      kind: MISSING_TABLE,
      message:
        "جدول خطط الامتحان لسه مش موجود. افتح Supabase → SQL Editor وشغّل ملف db/exam-plans.sql، وبعدها حدّث الصفحة. تشغيله أكتر من مرة مش بيضرّ.",
    };
  }

  return {
    kind: "GENERIC",
    message: msg || "حصل خطأ غير متوقع. افتح Console (F12) للتفاصيل.",
  };
}

export type Result<T> = { data: T; error: null } | { data: null; error: DataError };

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

function fail<T>(error: unknown): Result<T> {
  console.error("exam-plans:", error);
  return { data: null, error: toExamDataError(error) };
}

/* --------------------------------------------------------------------------
   التواريخ

   ⚠️ قرار مقصود: التواريخ نصوص "YYYY-MM-DD" في كل حتة، مش كائنات Date.
   السبب (نفس درس صفحة المخطط): دي أيام مالهاش ساعة، وأي `new Date("...")`
   بيفسّر النص كـ UTC وبعدين يعرضه بالتوقيت المحلي — فهدف النهاردة بيبان
   إمبارح لأي حد شرق جرينتش. المقارنة النصية بتشيل المشكلة من أصلها.
   -------------------------------------------------------------------------- */

/** تاريخ النهاردة محلياً كـ "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** بيزوّد أيام على تاريخ نصي ويرجّع نصي. بيعدّي على الشهور والسنين صح. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  // الشهر في JS صفري. بنبني التاريخ محلياً (مش UTC) وبنزوّد الأيام —
  // Date بيتعامل مع تعدّي الشهر لوحده.
  const dt = new Date(y, m - 1, d + days);
  return todayISO(dt);
}

/** الفرق بالأيام بين تاريخين نصيين (b - a). */
export function diffDaysISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  // Date.UTC عشان الطرح مايتأثرش بالتوقيت الصيفي — الفرق بالأيام بس
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

/** «النهاردة» / «بكرة» / «بعد بكرة» / «الخميس ٦ أغسطس». */
export function relativeDayLabel(iso: string, today: string = todayISO()): string {
  const diff = diffDaysISO(today, iso);
  if (diff === 0) return "النهاردة";
  if (diff === 1) return "بكرة";
  if (diff === 2) return "بعد بكرة";
  if (diff === -1) return "إمبارح";
  if (diff < 0) return `فات بـ ${toArabicNum(Math.abs(diff))} يوم`;

  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * أرقام هندية.
 * ⚠️ لازم تتستخدم في أي رقم جوه نص عربي — `toLocaleDateString("ar-EG")`
 * بتطلّع «٣ أغسطس» بأرقام هندية، فلو حطّينا جنبها رقم بالـ interpolation
 * العادي بيطلع «3» ويبقى السطر مخلوط.
 */
export function toArabicNum(n: number): string {
  return n.toLocaleString("ar-EG");
}

/* --------------------------------------------------------------------------
   الأنواع
   -------------------------------------------------------------------------- */

export interface ExamPlanDay {
  id: string;
  dayNumber: number;
  studyDate: string;
  kind: DayKind;
  title: string;
  description: string;
  isDone: boolean;
}

export interface ExamPlan {
  id: string;
  subject: string;
  examDate: string;
  sourceText: string | null;
  isArchived: boolean;
  createdAt: string;
  days: ExamPlanDay[];
}

/** الشكل اللي الراوت بيرجّعه قبل الحفظ. */
export interface DraftDay {
  dayNumber: number;
  kind: DayKind;
  title: string;
  description: string;
}

/* --------------------------------------------------------------------------
   القراءة
   -------------------------------------------------------------------------- */

interface DayRow {
  id: string;
  day_number: number;
  study_date: string;
  kind: string;
  title: string;
  description: string | null;
  is_done: boolean;
}

interface PlanRow {
  id: string;
  subject: string;
  exam_date: string;
  source_text: string | null;
  is_archived: boolean;
  created_at: string;
  exam_plan_days?: DayRow[] | null;
}

function isDayKind(v: string): v is DayKind {
  return v === "content" || v === "review" || v === "quiz";
}

function mapDay(row: DayRow): ExamPlanDay {
  return {
    id: row.id,
    dayNumber: row.day_number,
    studyDate: row.study_date,
    // الداتابيز عليها check constraint، بس لو صف قديم عدّى بنرجع لـ content
    kind: isDayKind(row.kind) ? row.kind : "content",
    title: row.title,
    description: row.description ?? "",
    isDone: row.is_done,
  };
}

function mapPlan(row: PlanRow): ExamPlan {
  return {
    id: row.id,
    subject: row.subject,
    examDate: row.exam_date,
    sourceText: row.source_text,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    days: (row.exam_plan_days ?? []).map(mapDay).sort((a, b) => a.dayNumber - b.dayNumber),
  };
}

/**
 * الخطة الشغالة: أقرب امتحان لسه ما فاتش ومش مأرشف.
 *
 * بترجّع null لو مفيش — ودي **مش حالة خطأ**، فالكارت مايتعرضش خالص.
 */
export async function fetchActiveExamPlan(
  supabase: SupabaseClient,
  userId: string,
  today: string = todayISO()
): Promise<Result<ExamPlan | null>> {
  try {
    const { data, error } = await supabase
      .from("exam_plans")
      .select("id, subject, exam_date, source_text, is_archived, created_at, exam_plan_days(id, day_number, study_date, kind, title, description, is_done)")
      .eq("user_id", userId)
      .eq("is_archived", false)
      // الامتحانات اللي فاتت مش بتتعرض. المستخدم اللي امتحانه إمبارح
      // مش محتاج يشوف كارت بيقوله «راجع» — ده بيوجع بس.
      .gte("exam_date", today)
      .order("exam_date", { ascending: true })
      .limit(1);

    if (error) return fail(error);
    if (!data || data.length === 0) return ok(null);
    return ok(mapPlan(data[0] as PlanRow));
  } catch (err) {
    return fail(err);
  }
}

/** كل الخطط بما فيها القديمة — لصفحة أو مودال «خططي». */
export async function fetchAllExamPlans(
  supabase: SupabaseClient,
  userId: string
): Promise<Result<ExamPlan[]>> {
  try {
    const { data, error } = await supabase
      .from("exam_plans")
      .select("id, subject, exam_date, source_text, is_archived, created_at, exam_plan_days(id, day_number, study_date, kind, title, description, is_done)")
      .eq("user_id", userId)
      .order("exam_date", { ascending: false });

    if (error) return fail(error);
    return ok(((data ?? []) as PlanRow[]).map(mapPlan));
  } catch (err) {
    return fail(err);
  }
}

/* --------------------------------------------------------------------------
   الكتابة
   -------------------------------------------------------------------------- */

/**
 * بيحفظ خطة جديدة بأيامها.
 *
 * ⚠️ مفيش transaction في PostgREST. لو حفظ الأيام فشل بعد ما الخطة
 * اتحفظت، بنمسح الخطة بإيدنا — وإلا بتفضل خطة فاضية بتظهر في الكارت
 * من غير أي يوم جواها. الحذف بيمسح الأيام معاه (on delete cascade).
 */
export async function saveExamPlan(
  supabase: SupabaseClient,
  userId: string,
  input: {
    subject: string;
    examDate: string;
    sourceText: string | null;
    days: DraftDay[];
    /** بداية الخطة. الافتراضي النهاردة. */
    startDate?: string;
  }
): Promise<Result<ExamPlan>> {
  if (input.days.length === 0) {
    return { data: null, error: { kind: "GENERIC", message: "الخطة لازم يكون فيها يوم واحد على الأقل." } };
  }

  const start = input.startDate ?? todayISO();
  let planId: string | null = null;

  try {
    const { data: plan, error: planError } = await supabase
      .from("exam_plans")
      .insert({
        user_id: userId,
        subject: input.subject,
        exam_date: input.examDate,
        source_text: input.sourceText,
      })
      .select("id, subject, exam_date, source_text, is_archived, created_at")
      .single();

    if (planError || !plan) return fail(planError ?? new Error("فشل إنشاء الخطة"));
    planId = plan.id as string;

    const rows = input.days.map((d) => ({
      plan_id: planId,
      user_id: userId,
      day_number: d.dayNumber,
      // اليوم الأول = تاريخ البداية، والباقي بعده بيوم
      study_date: addDaysISO(start, d.dayNumber - 1),
      kind: d.kind,
      title: d.title,
      description: d.description,
    }));

    const { data: days, error: daysError } = await supabase
      .from("exam_plan_days")
      .insert(rows)
      .select("id, day_number, study_date, kind, title, description, is_done");

    if (daysError) {
      // تنضيف: خطة من غير أيام أسوأ من مفيش خطة
      await supabase.from("exam_plans").delete().eq("id", planId);
      return fail(daysError);
    }

    return ok(
      mapPlan({
        ...(plan as Omit<PlanRow, "exam_plan_days">),
        exam_plan_days: (days ?? []) as DayRow[],
      })
    );
  } catch (err) {
    if (planId) {
      await supabase.from("exam_plans").delete().eq("id", planId).then(
        () => undefined,
        () => undefined
      );
    }
    return fail(err);
  }
}

/** بيعلّم يوم كمخلّص أو يرجّعه. */
export async function setExamDayDone(
  supabase: SupabaseClient,
  dayId: string,
  isDone: boolean
): Promise<Result<true>> {
  try {
    const { error } = await supabase
      .from("exam_plan_days")
      .update({ is_done: isDone, done_at: isDone ? new Date().toISOString() : null })
      .eq("id", dayId);

    if (error) return fail(error);
    return ok(true);
  } catch (err) {
    return fail(err);
  }
}

/** بيأرشف خطة — بتختفي من الكارت وماتتمسحش. */
export async function archiveExamPlan(
  supabase: SupabaseClient,
  planId: string
): Promise<Result<true>> {
  try {
    const { error } = await supabase.from("exam_plans").update({ is_archived: true }).eq("id", planId);
    if (error) return fail(error);
    return ok(true);
  } catch (err) {
    return fail(err);
  }
}

/** بيمسح خطة وأيامها (cascade). */
export async function deleteExamPlan(
  supabase: SupabaseClient,
  planId: string
): Promise<Result<true>> {
  try {
    const { error } = await supabase.from("exam_plans").delete().eq("id", planId);
    if (error) return fail(error);
    return ok(true);
  } catch (err) {
    return fail(err);
  }
}

/* --------------------------------------------------------------------------
   مساعدات العرض
   -------------------------------------------------------------------------- */

/** يوم النهاردة في الخطة، أو أول يوم لسه ما اتعملش لو النهاردة مافيهوش حاجة. */
export function todaysDay(plan: ExamPlan, today: string = todayISO()): ExamPlanDay | null {
  const exact = plan.days.find((d) => d.studyDate === today);
  if (exact) return exact;
  // متأخّر؟ رجّع أقرب يوم فايت لسه ما اتعملش عشان الكارت يقوله يلحّق
  const overdue = plan.days.filter((d) => !d.isDone && d.studyDate < today);
  if (overdue.length > 0) return overdue[overdue.length - 1];
  return null;
}

/** كام يوم فاضل للامتحان. سالب = فات. */
export function daysUntilExam(plan: ExamPlan, today: string = todayISO()): number {
  return diffDaysISO(today, plan.examDate);
}

/** نسبة الإنجاز ٠–١٠٠. */
export function planProgress(plan: ExamPlan): number {
  if (plan.days.length === 0) return 0;
  const done = plan.days.filter((d) => d.isDone).length;
  return Math.round((done / plan.days.length) * 100);
}
