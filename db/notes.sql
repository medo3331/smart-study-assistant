-- ============================================================================
-- Lesson Notes — Phase 1 (ملاحظات الطالب على الدرس)
--
-- ⚠️ شغّل الملف ده مرة واحدة في Supabase → SQL Editor.
--    تشغيله أكتر من مرة مش بيضرّ (كل حاجة if not exists / drop if exists).
--
-- ملاحظة واحدة لكل (مستخدم، درس). الـPhase 1 قفل الشكل ده عن قصد: autosave
-- على سطر واحد أبسط بكتير من قائمة، والقفل (unique) هو اللي بيخلّي الـupsert
-- يشتغل أصلاً. القوائم والعناوين والوسوم — لو احتجناها — Phase 2.
--
-- ⚠️ الـclient (page.tsx) بيكتب updated_at بنفسه ومفيش trigger — نفس precedent
--    المشروع (materials.note بيتحدّث من التطبيق، db/pages.sql:40).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- الجدول
--
-- lesson_id: نفس نوع study_days.id (uuid) — الدليل في db/economy-phase-c.sql:20
--            (complete_study_day takes p_day_id uuid and matches it to id).
--
-- on delete cascade مقصود: الداشبورد بيمسح أيام المادة القديمة لما الطالب
-- يغيّر مادته (app/dashboard/page.tsx:951 — delete().eq("config_id", …)).
-- من غير الـ cascade هنخسر ملاحظات من غير ما حد يعلم. نفس منطق
-- exam_plan_days → exam_plans.
-- ----------------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  lesson_id   uuid not null references public.study_days (id) on delete cascade,

  -- محتوى الملاحظة. فاضي يعني «لسه مفيش ملاحظة» — الصف نفسه بيفتتح أول ما
  -- الطالب يكتب، فمفيش صف بيفضل شاغل من غير سبب.
  content     text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- ⚠️ القيد ده مش للترتيب — ده اللي بيخلّي الـupsert على (user_id, lesson_id)
  --    ممكن. من غيره الـinsert هيضرب تكرار والـupsert مش هيلاقي الصف.
  --    ملاحظة واحدة لكل درس، زي ما اتفقنا.
  unique (user_id, lesson_id)
);

-- ملاحظة عن الفهرسة: الـunique constraint فوق **بيخلق فهرس فريد** على
-- (user_id, lesson_id) أصلاً، وهو بالظبط الاستعلام اللي بنعمله كل مرة:
--   select * from public.notes where user_id = … and lesson_id = …
-- فـ create index تاني على نفس العمودين هيبقى تكرار: تكلفة كتابة أعلى،
-- وفايدة صفر. متعملش واحد.

alter table public.notes enable row level security;

drop policy if exists "notes: owner reads"   on public.notes;
drop policy if exists "notes: owner writes"  on public.notes;
drop policy if exists "notes: owner updates" on public.notes;
drop policy if exists "notes: owner deletes" on public.notes;


-- ----------------------------------------------------------------------------
-- RLS — كل مستخدم يوصل لملاحظاته هو بس
--
-- select و delete: auth.uid() = user_id كفاية.
-- ----------------------------------------------------------------------------
create policy "notes: owner reads"   on public.notes for select using (auth.uid() = user_id);
create policy "notes: owner deletes" on public.notes for delete using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- insert و update: قفلتين مش واحدة
--
-- الأولى إن الصف بتاعي (user_id = auth.uid()).
-- التانية إن الدرس اللي أنا بيكتب عليه **درسي أنا** (study_days.user_id).
--
-- من غير التانية: مستخدم يقدر يبعت lesson_id بتاع درس حد تاني. النتيجة
-- مش تسريب — السطر مابيقدرش يظهرش في select عند الضحية لأن user_id مش
-- بتاعها — لكن الصف بيتقفل جواه درس حد تاني، وبيتمسح معاه بالـ cascade.
-- نفس الحجة مكتوبة في db/exam-plans.sql:117-124.
-- ----------------------------------------------------------------------------
create policy "notes: owner writes" on public.notes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.study_days d
      where d.id = lesson_id and d.user_id = auth.uid()
    )
  );

create policy "notes: owner updates" on public.notes
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.study_days d
      where d.id = lesson_id and d.user_id = auth.uid()
    )
  );


-- ============================================================================
-- تم. لازم يبقى متاح:
--   select * from public.notes limit 1;
-- الـ RLS مفعّل: مستخدم تاني بيشوف صفر صفوف دايمًا.
-- ============================================================================
