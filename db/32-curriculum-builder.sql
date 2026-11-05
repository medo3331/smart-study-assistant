-- ============================================================================
-- 32-curriculum-builder.sql
-- Curriculum Builder — بيانات المنهج المخصص على مستوى المادة
--
-- ليه الأعمدة دي على `study_configs` مش على `study_days`؟
--   المستوى والموضوعات المركزة صفات **المادة** اللي بتتولّد مرة واحدة،
--   والتوسيع بعدين محتاج يقرأهم من جديد. لو اتخزنوا في `study_days` كانوا
--   هيتكرروا مع كل درس، ولو اتخزنوا في `profiles` كانوا هيبقوا صفات حساب
--   مش صفات مادة — والطالب ممكن يكون عنده أكتر من مادة بمستويات مختلفة.
--
-- idempotent: كل الأوامر IF NOT EXISTS / مع فحص للـ constraint قبل الإضافة.
-- additive: أعمدة جديدة فقط — لا يمس أي عمود أو بيانات قائمة.
--
-- ⚠️ شغّل الملف ده في Supabase → SQL Editor قبل نشر الـ Wizard.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────
-- 1) الأعمدة
-- ─────────────────────────────────────────────────────────────

alter table public.study_configs
  add column if not exists curriculum_level text;

alter table public.study_configs
  add column if not exists focus_topics jsonb not null default '[]'::jsonb;

alter table public.study_configs
  add column if not exists curriculum_version int not null default 1;

alter table public.study_configs
  add column if not exists generated_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 2) القيود
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'study_configs_curriculum_level_check'
      and conrelid = 'public.study_configs'::regclass
  ) then
    alter table public.study_configs
      add constraint study_configs_curriculum_level_check
      check (
        curriculum_level is null
        or curriculum_level in ('beginner', 'intermediate', 'advanced')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'study_configs_focus_topics_check'
      and conrelid = 'public.study_configs'::regclass
  ) then
    alter table public.study_configs
      add constraint study_configs_focus_topics_check
      check (
        case
          when jsonb_typeof(focus_topics) = 'array'
            then jsonb_array_length(focus_topics) <= 10
          else false
        end
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'study_configs_curriculum_version_check'
      and conrelid = 'public.study_configs'::regclass
  ) then
    alter table public.study_configs
      add constraint study_configs_curriculum_version_check
      check (curriculum_version >= 1);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) التوثيق
-- ─────────────────────────────────────────────────────────────

comment on column public.study_configs.curriculum_level is
  'مستوى عمق المنهج: beginner | intermediate | advanced. null = مادة قديمة قبل Curriculum Builder.';

comment on column public.study_configs.focus_topics is
  'الموضوعات المركزة اللي المستخدم اختارها عند التوليد. مصفوفة JSON نصية بحد أقصى 10 عناصر.';

comment on column public.study_configs.curriculum_version is
  'نسخة صيغة التوليد. بترتفع لو الـ Prompt/الشكل اتغيّر عشان نعرف نعيد توليد المناهج القديمة.';

comment on column public.study_configs.generated_at is
  'آخر مرة اتولّد فيها المنهج بالـ AI. null = مادة قديمة/يدوية.';

commit;

-- ============================================================================
-- تحقق بعد التطبيق (SELECT فقط):
-- ============================================================================
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'study_configs'
--   and column_name in ('curriculum_level', 'focus_topics', 'curriculum_version', 'generated_at')
-- order by column_name;
--
-- المتوقع: ٤ صفوف، focus_topics not null default '[]'::jsonb.
