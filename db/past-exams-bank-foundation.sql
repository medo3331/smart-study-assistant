-- ============================================================================
-- Past Exams Bank — Database Foundation (Phase 1.1 — DB Only)
-- Date: 2026-09-03
-- Scope: Taxonomy (country/curriculum/subject/year) + Exam bank (past_exams,
--        questions, official answers) + RLS security foundation.
-- No real content inserted. No mock demo data kept (cleaned after check).
-- No UI. No AI. No commits/pushes. No Phase 1.2/1.3/1.4.
-- Reuses: UUID default gen_random_uuid(); RLS enable + owner/admin patterns
--         from exam-plans.sql/pages.sql; NOT NULL / checks / unique / FKs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ٠) Cleanup of any temporary verification data (no mock production data)
--     Note: this file creates NO temporary rows; if any are added during
--     manual verification they must be deleted before production use.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- ١) Countries
-- ----------------------------------------------------------------------------
create table if not exists public.countries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists countries_code_idx on public.countries (code);

alter table public.countries enable row level security;

drop policy if exists "countries: public read" on public.countries;
create policy "countries: public read" on public.countries
  for select using (true);  -- taxonomy is reference data; public readable

drop policy if exists "countries: admin writes" on public.countries;
create policy "countries: admin writes" on public.countries
  for all using (auth.uid() in (select id from public.site_admins))
  with check (auth.uid() in (select id from public.site_admins));

-- ----------------------------------------------------------------------------
-- ٢) Curricula (per country; uniqueness inside country)
-- ----------------------------------------------------------------------------
create table if not exists public.curricula (
  id          uuid primary key default gen_random_uuid(),
  country_id  uuid not null references public.countries (id) on delete restrict,
  name        text not null,
  code        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (country_id, code)
);

create index if not exists curricula_country_idx on public.curricula (country_id);

alter table public.curricula enable row level security;

drop policy if exists "curricula: public read" on public.curricula;
create policy "curricula: public read" on public.curricula
  for select using (true);

drop policy if exists "curricula: admin writes" on public.curricula;
create policy "curricula: admin writes" on public.curricula
  for all using (auth.uid() in (select id from public.site_admins))
  with check (auth.uid() in (select id from public.site_admins));

-- ----------------------------------------------------------------------------
-- ٣) Subjects (per curriculum; uniqueness inside curriculum)
-- ----------------------------------------------------------------------------
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula (id) on delete restrict,
  name        text not null,
  code        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (curriculum_id, code)
);

create index if not exists subjects_curriculum_idx on public.subjects (curriculum_id);

alter table public.subjects enable row level security;

drop policy if exists "subjects: public read" on public.subjects;
create policy "subjects: public read" on public.subjects
  for select using (true);

drop policy if exists "subjects: admin writes" on public.subjects;
create policy "subjects: admin writes" on public.subjects
  for all using (auth.uid() in (select id from public.site_admins))
  with check (auth.uid() in (select id from public.site_admins));

-- ----------------------------------------------------------------------------
-- ٤) Academic Years (per curriculum; label flexible for different systems)
-- ----------------------------------------------------------------------------
create table if not exists public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula (id) on delete restrict,
  label        text not null,
  year_value   text,  -- flexible: "2024-2025", "1445", etc.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists academic_years_curriculum_idx on public.academic_years (curriculum_id);

alter table public.academic_years enable row level security;

drop policy if exists "academic_years: public read" on public.academic_years;
create policy "academic_years: public read" on public.academic_years
  for select using (true);

drop policy if exists "academic_years: admin writes" on public.academic_years;
create policy "academic_years: admin writes" on public.academic_years
  for all using (auth.uid() in (select id from public.site_admins))
  with check (auth.uid() in (select id from public.site_admins));

-- ----------------------------------------------------------------------------
-- ٥) Past Exams (metadata only; PDF paths nullable; no real content now)
-- ----------------------------------------------------------------------------
create table if not exists public.past_exams (
  id              uuid primary key default gen_random_uuid(),
  subject_id      uuid not null references public.subjects (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  title           text not null,
  exam_date       date,              -- nullable as specified
  duration_minutes int,
  total_marks     int,
  exam_file_path  text,              -- nullable: link/path to exam PDF (storage integration future)
  answer_file_path text,             -- nullable: link/path to official answer PDF
  source_name     text,              -- e.g., ministry / board / university
  source_url      text,
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists past_exams_subject_idx on public.past_exams (subject_id);
create index if not exists past_exams_year_idx on public.past_exams (academic_year_id);
create index if not exists past_exams_published_idx on public.past_exams (is_published, created_at desc);

-- RLS: public can read only published; admin can write; normal users cannot insert/update/delete
alter table public.past_exams enable row level security;

drop policy if exists "past_exams: public read published" on public.past_exams;
create policy "past_exams: public read published" on public.past_exams
  for select using (is_published = true);

drop policy if exists "past_exams: admin writes" on public.past_exams;
create policy "past_exams: admin writes" on public.past_exams
  for all using (auth.uid() in (select id from public.site_admins))
  with check (auth.uid() in (select id from public.site_admins));

-- ----------------------------------------------------------------------------
-- ٦) Past Exam Questions (linked to exam; unique per exam + number)
-- ----------------------------------------------------------------------------
create table if not exists public.past_exam_questions (
  id               uuid primary key default gen_random_uuid(),
  exam_id          uuid not null references public.past_exams (id) on delete cascade,
  question_number  smallint not null,
  question_text    text not null,
  marks            int,
  question_type    text,  -- e.g., "mcq", "short", "essay"
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (exam_id, question_number)
);

create index if not exists past_exam_questions_exam_idx on public.past_exam_questions (exam_id, question_number);

alter table public.past_exam_questions enable row level security;

drop policy if exists "past_exam_questions: public read through exam" on public.past_exam_questions;
create policy "past_exam_questions: public read through exam" on public.past_exam_questions
  for select using (
    exists (select 1 from public.past_exams where past_exams.id = past_exam_questions.exam_id and past_exams.is_published = true)
  );

drop policy if exists "past_exam_questions: admin writes" on public.past_exam_questions;
create policy "past_exam_questions: admin writes" on public.past_exam_questions
  for all using (auth.uid() in (select id from public.site_admins))
  with check (auth.uid() in (select id from public.site_admins));

-- ----------------------------------------------------------------------------
-- ٧) Past Exam Answers — OFFICIAL / CURATED only (NOT AI-generated)
-- ----------------------------------------------------------------------------
create table if not exists public.past_exam_answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.past_exam_questions (id) on delete cascade,
  answer_text  text not null,
  answer_type  text,
  marks        int,
  source_note  text,   -- note on source / verification
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists past_exam_answers_question_idx on public.past_exam_answers (question_id);

alter table public.past_exam_answers enable row level security;

drop policy if exists "past_exam_answers: public read through exam" on public.past_exam_answers;
create policy "past_exam_answers: public read through exam" on public.past_exam_answers
  for select using (
    exists (
      select 1 from public.past_exam_questions q
      join public.past_exams e on q.exam_id = e.id
      where q.id = past_exam_answers.question_id and e.is_published = true
    )
  );

drop policy if exists "past_exam_answers: admin writes" on public.past_exam_answers;
create policy "past_exam_answers: admin writes" on public.past_exam_answers
  for all using (auth.uid() in (select id from public.site_admins))
  with check (auth.uid() in (select id from public.site_admins));

-- ----------------------------------------------------------------------------
-- ٨) Integrity checks (prevent invalid question_type / source issues at DB level)
--     Note: using soft check (no hard enum) to allow flexible future values.
-- ----------------------------------------------------------------------------
alter table public.past_exam_questions
  drop constraint if exists past_exam_questions_type_check;
alter table public.past_exam_questions
  add constraint past_exam_questions_type_check
  check (question_type is null or question_type in ('mcq', 'short', 'essay', 'fill', 'true_false'));

-- ----------------------------------------------------------------------------
-- ٩) FK / ON DELETE summary for review (no cascade on country/curriculum/subject)
--     countries  -> curricula (restrict) -> subjects (restrict) -> academic_years (restrict)
--     subjects   -> past_exams (restrict) -> past_exam_questions (cascade) -> past_exam_answers (cascade)
--     academic_years -> past_exams (restrict)
--     This prevents accidental deletion of taxonomy with linked exam data.
-- ----------------------------------------------------------------------------
