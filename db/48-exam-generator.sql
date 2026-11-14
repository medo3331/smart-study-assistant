-- ============================================================================
-- 48-exam-generator.sql — Phase 3: مولّد الامتحانات (Exam Generator)
-- ----------------------------------------------------------------------------
-- إضافي بالكامل (additive): لا يعدّل أي جدول أو دالة موجودة، ولا يمسّ
-- محرك `exam_sessions` الحالي (الـRPCs السبعة كما هي).
--
-- ┌─1) exam_sessions.metadata ────────────────────────────────────────────┐
-- │ الامتحان «لمادة إيه» و«وافقته إزاي» — كان الجلسة عميّانة عن مصدرها.  │
-- │ الشكل المتوقع (يُكتب من راوت الإنشاء، ويُقرأ في راوت التوليد):      │
-- │ { "title": "امتحان فيزياء",                                          │
-- │   "subject_id": "<uuid>|null", "subject_name": "فيزياء",              │
-- │   "day_id": "<uuid>|null",                                            │
-- │   "spec": { "types": ["mcq","true_false","essay"],                    │
-- │             "difficulty": "easy|medium|hard",                         │
-- │             "count": 12 },                                            │
-- │   "result": { ... }   ← يُكتب عند التسليم النهائي (الدرجة)           │
-- │ }                                                                     │
-- └───────────────────────────────────────────────────────────────────────┘
--
-- ┌─2) exam_session_answers ──────────────────────────────────────────────┐
-- │ إجابة الطالب لكل سؤال: mcq/tf يصحّحها **السيرفر** (is_correct)،      │
-- │ والمقالي تقيّمه **الطالب ذاتيًا** (self_score0..5 حسب الخطة).        │
-- │ مفتاح السؤال داخل result_json = "<ordinal>:<index>" (ثابت بعد ready). │
-- └───────────────────────────────────────────────────────────────────────┘
--
-- نمط الأمان نفسه مثل باقي المحرك: **المالك يقرأ فقط** (RLS owner-select)
-- والكتابة عبر الراوت (service role) لأن التصحيح يحصل على السيرفر —
-- العميل لا يُصدَّق في is_correct أبدًا.
--
-- idempotent: كل العبارات IF NOT EXISTS / OR REPLACE / CREATE POLICY بعد
-- DROP POLICY IF EXISTS.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════
-- 1) metadata على الجلسة
-- ═══════════════════════════════════════════════════════════
alter table public.exam_sessions
  add column if not exists metadata jsonb;

comment on column public.exam_sessions.metadata is
  'بيانات الجلسة غير الحسابية: title/subject_id/subject_name/day_id + spec {types,difficulty,count} + result (ملخص الدرجة عند التسليم). تُكتب من راوت الإنشاء والتسليم (service role) — القراءة عبر RLS للمالك.';

-- ═══════════════════════════════════════════════════════════
-- 2) إجابات الطالب
-- ═══════════════════════════════════════════════════════════
create table if not exists public.exam_session_answers (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.exam_sessions (id) on delete cascade,
  item_id       uuid not null references public.exam_session_items (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,

  -- "<ordinal>:<index>" — مفتاح ثابت داخل result_json (ordinal من البنود،
  -- index ترتيب السؤال داخل نتائج المحاضرة — كلاهما ثابت بعد status=ready).
  question_key  text not null,
  question_type text not null check (question_type in ('mcq', 'true_false', 'essay')),

  -- شكل الإجابة حسب النوع (القيّمة هنا شكليًا؛ المطابقة الحقيقية على السيرفر):
  --   mcq        → { "option": 0..3 }
  --   true_false → { "value": true|false }
  --   essay      → { "text": "…" }
  answer        jsonb not null check (jsonb_typeof(answer) = 'object'),

  -- التصحيح الآلي (mcq/true_false) — يحسبه السيرفر بمطابقة result_json.
  -- null دائمًا للمقالي.
  is_correct    boolean null,

  -- التصحيح الذاتي للمقالي:0..5 (الخطة: الإجابة النموذجية + تقييم ذاتي).
  -- null دائمًا للأنواع الآلية.
  self_score    smallint null check (self_score between 0 and 5),

  answered_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint exam_session_answers_session_question_unique
    unique (session_id, question_key),
  -- النوع بيحدّد شكل الدرجة: آلية = is_correct إجباري، مقالي = self_score إجباري.
  constraint exam_session_answers_type_grade_check
    check (
      (question_type in ('mcq', 'true_false') and is_correct is not null and self_score is null)
      or
      (question_type = 'essay' and self_score is not null and is_correct is null)
    )
);

create index if not exists idx_exam_session_answers_session
  on public.exam_session_answers (session_id);

create index if not exists idx_exam_session_answers_user_recent
  on public.exam_session_answers (user_id, answered_at desc);

alter table public.exam_session_answers enable row level security;
alter table public.exam_session_answers force row level security;

drop policy if exists exam_session_answers_owner_select on public.exam_session_answers;
create policy exam_session_answers_owner_select
  on public.exam_session_answers
  for select to authenticated
  using (user_id = auth.uid());
-- الكتابة (upsert + التصحيح) عبر الراوت/service role فقط — لا سياسة INSERT
-- للعميل عن قصد: is_correct محسوبة على السيرفر.

-- ═══════════════════════════════════════════════════════════
-- 3) updated_at trigger (نفس الـtrigger الموجود للمحرك)
-- ═══════════════════════════════════════════════════════════
drop trigger if exists trg_exam_session_answers_updated_at on public.exam_session_answers;
create trigger trg_exam_session_answers_updated_at
  before update on public.exam_session_answers
  for each row execute function public.set_updated_at();

-- ============================================================================
-- تحقق بعد التطبيق (SELECT فقط):
--   select to_regclass('public.exam_session_answers');
--   select column_name from information_schema.columns
--     where table_name = 'exam_sessions' and column_name = 'metadata';
--   select count(*) from pg_policies where tablename = 'exam_session_answers';
-- المتوقع: الجدول موجود · metadata موجود · سياسة واحدة (owner_select).
-- ============================================================================
