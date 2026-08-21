-- ============================================================================
-- اختيار البداية: الشخصية، المستوى، المجال، والتراك
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- الأعمدة صفات للحساب، لذلك مكانها profiles وليس study_days.
-- ============================================================================

alter table public.profiles
  add column if not exists persona text not null default 'student',
  add column if not exists student_level text,
  add column if not exists field text,
  add column if not exists subject text;

alter table public.profiles
  drop constraint if exists profiles_persona_check;
alter table public.profiles
  add constraint profiles_persona_check
  check (persona in ('student', 'grad', 'freelancer'));

alter table public.profiles
  drop constraint if exists profiles_student_level_check;
alter table public.profiles
  add constraint profiles_student_level_check
  check (student_level is null or student_level in ('prep', 'high', 'uni', 'masters'));

alter table public.profiles
  drop constraint if exists profiles_field_check;
alter table public.profiles
  add constraint profiles_field_check
  check (field is null or field in ('programming', 'medical', 'languages', 'business', 'school', 'design'));
