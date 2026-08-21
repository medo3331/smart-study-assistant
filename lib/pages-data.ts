/* ==========================================================================
   طبقة بيانات صفحات القايمة

   كل صفحة جديدة (مساحة العمل، المخطط، المسار المهني) بتتكلم مع Supabase من
   هنا بس. الفايدة: الأنواع في مكان واحد، والتعامل مع «الجدول لسه ما اتعملش»
   مكتوب مرة واحدة.

   ⚠️ الجداول دي محتاجة db/pages.sql يتشغّل في Supabase الأول. لحد ما يتشغّل،
   كل دالة هنا بترجّع MISSING_TABLE والصفحة بتوري رسالة واضحة بدل ما تكسر.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

/* --------------------------------------------------------------------------
   الأخطاء

   Postgres بيرمي 42P01 لما تسأل عن جدول مش موجود، و PostgREST بيرجّعه
   كـ PGRST205 لما الجدول مش في الكاش بتاعه. الاتنين معناهم نفس الحاجة
   للمستخدم: «شغّل الـ SQL».
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

/** بيحوّل خطأ Supabase لشكل الصفحة بتعرف تعرضه. */
export function toDataError(error: unknown): DataError {
  const err = (error ?? {}) as PgError;
  const code = err.code ?? "";
  const msg = err.message ?? "";

  // 42P01/PGRST205 = جدول ناقص. 42703/PGRST204 = عمود ناقص (زي
  // profiles.active_config_id لو الـ SQL اتشغّل قبل ما يتزوّد). الأربعة
  // معناهم نفس الحاجة للمستخدم: «شغّل الملف تاني».
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
        "قاعدة البيانات ناقصة جدول أو عمود. افتح Supabase → SQL Editor وشغّل ملف db/pages.sql، وبعدها حدّث الصفحة. تشغيله أكتر من مرة مش بيضرّ.",
    };
  }

  return {
    kind: "GENERIC",
    message: msg || "حصل خطأ غير متوقع. افتح Console (F12) للتفاصيل.",
  };
}

/** نتيجة أي عملية: بيانات أو خطأ، مش الاتنين. */
export type Result<T> = { data: T; error: null } | { data: null; error: DataError };

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

function fail<T>(error: unknown): Result<T> {
  console.error("pages-data:", error);
  return { data: null, error: toDataError(error) };
}

/* ==========================================================================
   ١) مساحة العمل — المواد
   ========================================================================== */

export interface Material {
  id: string;
  title: string;
  fileType: string | null;
  fileSize: number | null;
  content: string;
  summary: string | null;
  note: string;
  createdAt: string;
}

interface MaterialRow {
  id: string;
  title: string;
  file_type: string | null;
  file_size: number | null;
  content: string | null;
  summary: string | null;
  note: string | null;
  created_at: string;
}

function toMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    title: row.title,
    fileType: row.file_type,
    fileSize: row.file_size,
    content: row.content ?? "",
    summary: row.summary,
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}

export async function fetchMaterials(supabase: SupabaseClient, userId: string): Promise<Result<Material[]>> {
  const { data, error } = await supabase
    .from("materials")
    .select("id, title, file_type, file_size, content, summary, note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return fail(error);
  // `?? []` مش زيادة: Supabase بيرجّع data = null مع error = null في حالات
  // (رد فاضي من الشبكة مثلاً)، و`.map` على null بترمي TypeError جوه الـ
  // effect — الصفحة تقعد على السكيلتون من غير رسالة. نفس الحماية في
  // fetchCourses و fetchActivityRange.
  return ok(((data ?? []) as MaterialRow[]).map(toMaterial));
}

export async function insertMaterial(
  supabase: SupabaseClient,
  userId: string,
  input: { title: string; fileType?: string | null; fileSize?: number | null; content: string; note?: string }
): Promise<Result<Material>> {
  const { data, error } = await supabase
    .from("materials")
    .insert({
      user_id: userId,
      title: input.title,
      file_type: input.fileType ?? null,
      file_size: input.fileSize ?? null,
      content: input.content,
      note: input.note ?? "",
    })
    .select("id, title, file_type, file_size, content, summary, note, created_at")
    .single();

  if (error) return fail(error);
  return ok(toMaterial(data as MaterialRow));
}

export async function updateMaterial(
  supabase: SupabaseClient,
  id: string,
  patch: { note?: string; summary?: string; title?: string }
): Promise<Result<true>> {
  const row: Record<string, string> = { updated_at: new Date().toISOString() };
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.title !== undefined) row.title = patch.title;

  const { error } = await supabase.from("materials").update(row).eq("id", id);
  if (error) return fail(error);
  return ok(true);
}

export async function deleteMaterial(supabase: SupabaseClient, id: string): Promise<Result<true>> {
  const { error } = await supabase.from("materials").delete().eq("id", id);
  if (error) return fail(error);
  return ok(true);
}

/* ==========================================================================
   ٢) الكورسات — التراكات المحفوظة

   الجداول دي (study_configs + study_days) موجودة من الأصل — الداشبورد بتكتب
   فيها. الجديد هنا إننا بنقراهم **كلهم** مش أحدث واحد بس، ومعاهم عدّاد
   الأيام الخالصة عشان الصفحة توري التقدّم من غير ما تفتح كل تراك.

   ليه استعلامين مش join؟ لأن PostgREST بيرجّع الـ join كصفوف متداخلة
   ومحتاج علاقة معرّفة، والحساب في JS هنا أرخص وأوضح — التراكات معدودة.
   ========================================================================== */

export interface CourseSummary {
  id: string;
  subject: string;
  category: string | null;
  subCategory: string | null;
  /** العدد المطلوب وقت الإنشاء — ممكن يختلف عن اللي اتولّد فعلاً */
  daysCount: number;
  createdAt: string;
  /** اللي موجود فعلاً في study_days */
  totalDays: number;
  completedDays: number;
}

interface ConfigRow {
  id: string;
  subject: string;
  category: string | null;
  sub_category: string | null;
  days_count: number | null;
  created_at: string;
}

export async function fetchCourses(supabase: SupabaseClient, userId: string): Promise<Result<CourseSummary[]>> {
  const { data: configs, error: configError } = await supabase
    .from("study_configs")
    .select("id, subject, category, sub_category, days_count, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (configError) return fail(configError);

  const rows = (configs ?? []) as ConfigRow[];
  if (rows.length === 0) return ok([]);

  // كل الأيام مرة واحدة، وبنوزّعهم على التراكات محلياً
  const { data: days, error: daysError } = await supabase
    .from("study_days")
    .select("config_id, is_completed")
    .eq("user_id", userId);

  if (daysError) return fail(daysError);

  const tally = new Map<string, { total: number; done: number }>();
  for (const day of (days ?? []) as { config_id: string; is_completed: boolean | null }[]) {
    const entry = tally.get(day.config_id) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (day.is_completed) entry.done += 1;
    tally.set(day.config_id, entry);
  }

  return ok(
    rows.map((row) => {
      const counts = tally.get(row.id) ?? { total: 0, done: 0 };
      return {
        id: row.id,
        subject: row.subject,
        category: row.category,
        subCategory: row.sub_category,
        daysCount: row.days_count ?? 0,
        createdAt: row.created_at,
        totalDays: counts.total,
        completedDays: counts.done,
      };
    })
  );
}

/** بيشيل التراك وأيامه. الأيام الأول عشان لو الحذف اتقطع في النص ما يفضلش
    صفوف يتيمة معلّقة على config_id مش موجود.

    ملحوظة: profiles.active_config_id بيتصفّر لوحده (on delete set null)،
    فمافيش خطوة تالتة هنا. */
export async function deleteCourse(supabase: SupabaseClient, configId: string): Promise<Result<true>> {
  const { error: daysError } = await supabase.from("study_days").delete().eq("config_id", configId);
  if (daysError) return fail(daysError);

  const { error } = await supabase.from("study_configs").delete().eq("id", configId);
  if (error) return fail(error);
  return ok(true);
}

/* --------------------------------------------------------------------------
   التراك المفتوح — محفوظ في الحساب

   الاختيار عايش في profiles.active_config_id مش في الجهاز، عشان تختار تراك
   من اللابتوب وتلاقيه مفتوح على الموبايل.

   null معناه «مافيش اختيار» → الداشبورد بتفتح أحدث تراك.
   -------------------------------------------------------------------------- */

export async function setActiveCourse(
  supabase: SupabaseClient,
  userId: string,
  configId: string | null
): Promise<Result<true>> {
  const { error } = await supabase.from("profiles").update({ active_config_id: configId }).eq("id", userId);
  if (error) return fail(error);
  return ok(true);
}

export async function fetchActiveCourseId(supabase: SupabaseClient, userId: string): Promise<Result<string | null>> {
  const { data, error } = await supabase.from("profiles").select("active_config_id").eq("id", userId).maybeSingle();
  if (error) return fail(error);
  return ok((data as { active_config_id: string | null } | null)?.active_config_id ?? null);
}

/* ==========================================================================
   ٣) المخطط — الأهداف
   ========================================================================== */

export interface PlannerGoal {
  id: string;
  title: string;
  dueDate: string | null; // "YYYY-MM-DD"
  priority: 1 | 2;
  isDone: boolean;
}

interface GoalRow {
  id: string;
  title: string;
  due_date: string | null;
  priority: number;
  is_done: boolean;
}

function toGoal(row: GoalRow): PlannerGoal {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    priority: row.priority === 2 ? 2 : 1,
    isDone: row.is_done,
  };
}

export async function fetchGoals(supabase: SupabaseClient, userId: string): Promise<Result<PlannerGoal[]>> {
  const { data, error } = await supabase
    .from("planner_goals")
    .select("id, title, due_date, priority, is_done")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return fail(error);
  return ok(((data ?? []) as GoalRow[]).map(toGoal));
}

export async function insertGoal(
  supabase: SupabaseClient,
  userId: string,
  input: { title: string; dueDate: string | null; priority: 1 | 2 }
): Promise<Result<PlannerGoal>> {
  const { data, error } = await supabase
    .from("planner_goals")
    .insert({ user_id: userId, title: input.title, due_date: input.dueDate, priority: input.priority })
    .select("id, title, due_date, priority, is_done")
    .single();

  if (error) return fail(error);
  return ok(toGoal(data as GoalRow));
}

export async function setGoalDone(supabase: SupabaseClient, id: string, isDone: boolean): Promise<Result<true>> {
  const { error } = await supabase
    .from("planner_goals")
    .update({ is_done: isDone, done_at: isDone ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return fail(error);
  return ok(true);
}

export async function deleteGoal(supabase: SupabaseClient, id: string): Promise<Result<true>> {
  const { error } = await supabase.from("planner_goals").delete().eq("id", id);
  if (error) return fail(error);
  return ok(true);
}

/* ==========================================================================
   ٤) المسار المهني — المهارات المتحقّقة
   ========================================================================== */

export async function fetchAchievedSkills(supabase: SupabaseClient, userId: string): Promise<Result<string[]>> {
  const { data, error } = await supabase.from("career_skills").select("skill_id").eq("user_id", userId);
  if (error) return fail(error);
  return ok(((data ?? []) as { skill_id: string }[]).map((r) => r.skill_id));
}

/** بيعلّم المهارة كمتحقّقة. **بيتحمّل التكرار عن قصد**: المفتاح الأساسي
    (user_id, skill_id) معناه إن `insert` عادي بيرمي 23505 لو الصف موجود
    خلاص — وده بيحصل من تابين مفتوحين، والمستخدم يشوف رسالة خطأ على عملية
    نتيجتها صح أصلاً. «علّم على المهارة دي» المفروض تكون idempotent.

    `ignoreDuplicates` بيولّد `on conflict do nothing` مش `do update`.
    الفرق مهم: الجدول مالوش سياسة UPDATE في db/pages.sql (قراءة وإضافة
    وحذف بس)، فـ `do update` كان هيترفض من الـ RLS. */
export async function addSkill(supabase: SupabaseClient, userId: string, skillId: string): Promise<Result<true>> {
  const { error } = await supabase
    .from("career_skills")
    .upsert({ user_id: userId, skill_id: skillId }, { onConflict: "user_id,skill_id", ignoreDuplicates: true });

  if (error) return fail(error);
  return ok(true);
}

export async function removeSkill(supabase: SupabaseClient, userId: string, skillId: string): Promise<Result<true>> {
  const { error } = await supabase
    .from("career_skills")
    .delete()
    .eq("user_id", userId)
    .eq("skill_id", skillId);

  if (error) return fail(error);
  return ok(true);
}

/* ==========================================================================
   ٤٫٥) التقويم — النشاط ومراحل التراك

   الجدولين دول موجودين من الأصل (الداشبورد ودرس اليوم بيكتبوا فيهم)، فمش
   محتاجين migration. الجديد هنا إننا بنقرا **شهر محدّد** مش كل حاجة.
   ========================================================================== */

/** يوم واحد في سجل النشاط. */
export interface ActivityDay {
  /** "YYYY-MM-DD" */
  date: string;
  focusMinutes: number;
  tasksCompleted: number;
}

/** نشاط الشهر. `fromKey`/`toKey` بالشكل "YYYY-MM-DD" وشاملين الطرفين.

    ليه بالمدى مش الكل؟ لأن السجل بيكبر يوم كل يوم، والتقويم بيوري شهر
    واحد — مافيش داعي نجيب سنتين عشان نرسم ٣٠ مربع. */
export async function fetchActivityRange(
  supabase: SupabaseClient,
  userId: string,
  fromKey: string,
  toKey: string
): Promise<Result<ActivityDay[]>> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("activity_date, focus_minutes, tasks_completed")
    .eq("user_id", userId)
    .gte("activity_date", fromKey)
    .lte("activity_date", toKey);

  if (error) return fail(error);

  const rows = (data ?? []) as {
    activity_date: string;
    focus_minutes: number | null;
    tasks_completed: number | null;
  }[];

  return ok(
    rows.map((row) => ({
      // العمود نوعه date في Postgres، بس PostgREST ساعات بيرجّعه بوقت.
      // بنقص أول ١٠ حروف عشان المفتاح يفضل "YYYY-MM-DD" في الحالتين.
      date: row.activity_date.slice(0, 10),
      focusMinutes: row.focus_minutes ?? 0,
      tasksCompleted: row.tasks_completed ?? 0,
    }))
  );
}

/** ⚠️ مفيش دالة بتجيب «مراحل التراك بتواريخها» عن قصد.

    `study_days` مفيهاش عمود تاريخ، والداشبورد بتحدد المرحلة الحالية من عدد
    المراحل الخالصة مش من النهارده. يعني التراك تسلسل مش جدول مواعيد.

    لو حسبنا تاريخ لكل مرحلة (بداية التراك + رقم اليوم) هنخترع مواعيد
    المستخدم ما اختارهاش: واحد يخلّص ٣ مراحل النهارده هيلاقيهم متفرّقين على
    ٣ أيام جاية. فالتقويم بيوري اللي ليه تاريخ حقيقي بس — النشاط والأهداف.
    اللي عايز يربط هدف بمرحلة، يعمله هدف في المخطط بتاريخ. */

/* ==========================================================================
   ٥) أوسمة البوس — قراءة بس (BossFight هو اللي بيكتب)
   ========================================================================== */

export interface Badge {
  id: string;
  title: string;
  subject: string | null;
  chapterNumber: number | null;
  accuracy: number | null;
  createdAt: string;
}

/** حصيلة الحساب. الداشبورد بتقرا البروفايل كله بـ `select *`، فالدالة دي
    للصفحات اللي عايزة الرقمين دول بس.

    الافتراضات مقصودة: بروفايل لسه ما اتعملش (أو أعمدة فاضية) = صفر XP
    وستريك ١ — نفس ما الداشبورد بتبدأ بيه، عشان الصفحتين ما يقولوش رقمين
    مختلفين لنفس الحساب. */
export interface ProfileStats {
  xp: number;
  streak: number;
}

export async function fetchProfileStats(supabase: SupabaseClient, userId: string): Promise<Result<ProfileStats>> {
  const { data, error } = await supabase.from("profiles").select("xp, streak").eq("id", userId).maybeSingle();
  if (error) return fail(error);

  const row = data as { xp: number | null; streak: number | null } | null;
  return ok({ xp: row?.xp ?? 0, streak: row?.streak ?? 1 });
}

export async function fetchBadges(supabase: SupabaseClient, userId: string): Promise<Result<Badge[]>> {
  const { data, error } = await supabase
    .from("badges")
    .select("id, title, subject, chapter_number, accuracy, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return fail(error);
  return ok(
    ((data ?? []) as { id: string; title: string; subject: string | null; chapter_number: number | null; accuracy: number | null; created_at: string }[]).map(
      (row) => ({
        id: row.id,
        title: row.title,
        subject: row.subject,
        chapterNumber: row.chapter_number,
        accuracy: row.accuracy,
        createdAt: row.created_at,
      })
    )
  );
}
