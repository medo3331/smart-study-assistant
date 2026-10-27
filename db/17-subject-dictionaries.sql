-- ============================================================================
-- Phase 2 (MANUAL RUN — #17 in the unified SQL list)
-- subject_dictionaries — قاموس مصطلحات مخصص لكل مادة لكل مستخدم
-- ============================================================================
-- ليه الجدول ده موجود:
--   المستخدم يقدر يعرف مصطلحات صحيحة لكل مادة (مثلاً "congruence" في مادة
--   هندسة، أو "קריפטוגרפיה" في مادة أمن معلومات). القاموس ده بيستخدم في
--   كشف المصطلحات المشكوك فيها عشان الموديل ما يعلنش عن كلمة صح 건ينها غلط.
--
--   كل مستخدم ليه قاموس لكل مادة — والفهرس الفريد يضمن مفيش تكرار.
-- ============================================================================

-- ١) الجدول نفسه.
create table if not exists public.subject_dictionaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_name text not null,
  terms        jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(terms) = 'array'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- مستخدم واحد ما يقدرش ينشئ قاموسين لنفس المادة.
  constraint subject_dictionaries_user_subject_key unique (user_id, subject_name)
);

-- ٢) RLS — الجدول خاص بصاحبه بس.
alter table public.subject_dictionaries enable row level security;
alter table public.subject_dictionaries force row level security;

do $$
begin
  drop policy if exists "subject_dictionaries: owner full access" on public.subject_dictionaries;
end $$;

create policy "subject_dictionaries: owner full access" on public.subject_dictionaries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ٣) تحديث updated_at تلقائي.
drop trigger if exists subject_dictionaries_set_updated_at on public.subject_dictionaries;
create trigger subject_dictionaries_set_updated_at
  before update on public.subject_dictionaries
  for each row
  execute function public.set_updated_at();

-- ٤) توثيق.
comment on table public.subject_dictionaries is
  'قواميس مصطلحات مخصصة لكل مادة لكل مستخدم — تُستخدم في كشف المصطلحات المشكوك فيها';
comment on column public.subject_dictionaries.subject_name is
  'اسم المادة (مثلاً: أمن معلومات، هندسة برمجيات، رياضيات)';
comment on column public.subject_dictionaries.terms is
  'مصفوفة من المصطلحات الصحيحة المعتمدة لهذه المادة: [{term, definition?}]';

-- ============================================================================
-- ⚠️ ملاحظات قبل التشغيل:
--   ١) الملف idempotent — CREATE TABLE IF NOT EXISTS + سياسات مخصصة.
--   ٢) RLS شغّال من لحظة الإنشاء — الجدول مش مكشوف لحظة واحدة.
--   ٣) الدالة public.set_updated_at موجودة بالفعل من migration #14.
-- ============================================================================