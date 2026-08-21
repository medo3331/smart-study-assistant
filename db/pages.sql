-- ============================================================================
-- صفحات القايمة الجديدة — جداول Supabase
-- التاريخ: ٣١ يوليو ٢٠٢٦
--
-- ⚠️ شغّل الملف ده مرة واحدة في Supabase → SQL Editor.
--    قبل ما تشغّله، الصفحات دي هتفتح عادي بس هتوريك رسالة «الجدول لسه مش
--    موجود» بدل ما تكسر — الكود بيتعامل مع الحالة دي بالاسم.
--
-- ٣ جداول بس. الباقي مبني على جداول موجودة:
--    الكورسات   → study_configs + study_days
--    التقويم    → activity_log
--    الإنجازات  → badges + profiles
--
-- كل جدول عليه RLS بنفس منطق باقي المشروع: كل مستخدم يشوف صفّه هو بس.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ١) مساحة العمل — مكتبة المواد
--
-- كل صف = ملف رفعته. بنخزّن النص المستخرج مش الملف نفسه، عشان:
--   • مش محتاجين Storage bucket ولا سياسات تانية
--   • النص هو اللي بيتبعت للمساعد أصلاً، فالملف الخام مالوش لازمة بعد الاستخراج
--   • الصف بيفضل صغير (النص مقصوص من /api/analyze-file على ٦٠ ألف حرف)
-- ----------------------------------------------------------------------------
create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  title       text not null,
  -- نوع الملف زي ما المتصفح شافه (application/pdf …). للأيقونة بس.
  file_type   text,
  file_size   int,

  -- النص المستخرج. ممكن يبقى فاضي لو الاستخراج فشل والمستخدم لسه محتفظ بالمادة.
  content     text default '',
  -- ملخّص متولّد بالـ AI. بيتخزن عشان ما ندفعش توكنز كل مرة يفتح المادة.
  summary     text,
  -- ملاحظات المستخدم نفسه على المادة.
  note        text default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists materials_user_created_idx
  on public.materials (user_id, created_at desc);

alter table public.materials enable row level security;

drop policy if exists "materials: owner reads"   on public.materials;
drop policy if exists "materials: owner writes"  on public.materials;
drop policy if exists "materials: owner updates" on public.materials;
drop policy if exists "materials: owner deletes" on public.materials;

create policy "materials: owner reads"   on public.materials for select using (auth.uid() = user_id);
create policy "materials: owner writes"  on public.materials for insert with check (auth.uid() = user_id);
create policy "materials: owner updates" on public.materials for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "materials: owner deletes" on public.materials for delete using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- ٢) المخطط — أهداف
--
-- الهدف مش مربوط بيوم في الخطة عن قصد: الخطة بتقول «اليوم ٣ من ١٤»،
-- والمخطط بيقول «إيه اللي ناوي تخلّصه إمبارح وبكرة». محورين مختلفين.
-- ----------------------------------------------------------------------------
create table if not exists public.planner_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  title       text not null,
  -- تاريخ الاستحقاق. null = «في أي وقت».
  due_date    date,
  -- 1 = عادي، 2 = مهم. رقم مش نص عشان الترتيب يبقى رخيص.
  priority    smallint not null default 1,
  is_done     boolean not null default false,
  done_at     timestamptz,

  created_at  timestamptz not null default now()
);

create index if not exists planner_goals_user_due_idx
  on public.planner_goals (user_id, is_done, due_date);

alter table public.planner_goals enable row level security;

drop policy if exists "planner: owner reads"   on public.planner_goals;
drop policy if exists "planner: owner writes"  on public.planner_goals;
drop policy if exists "planner: owner updates" on public.planner_goals;
drop policy if exists "planner: owner deletes" on public.planner_goals;

create policy "planner: owner reads"   on public.planner_goals for select using (auth.uid() = user_id);
create policy "planner: owner writes"  on public.planner_goals for insert with check (auth.uid() = user_id);
create policy "planner: owner updates" on public.planner_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "planner: owner deletes" on public.planner_goals for delete using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- ٣) المسار المهني — المهارات المتحقّقة
--
-- قايمة المهارات نفسها ثابتة في الكود (app/dashboard/career/tracks.ts)، مش في
-- الداتابيز. السبب: دي محتوى بيتغيّر مع نسخة التطبيق مش مع المستخدم، ولو
-- عاش في جدول هيبقى لازم seed وmigration كل مرة نزوّد مهارة.
--
-- الجدول ده بيسجّل «إيه اللي المستخدم علّم عليه» بس — صف لكل مهارة متحقّقة.
-- شيل الصف = رجّع المهارة لغير متحقّقة.
-- ----------------------------------------------------------------------------
create table if not exists public.career_skills (
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- معرّف المهارة من tracks.ts، زي "frontend.html".
  skill_id    text not null,
  achieved_at timestamptz not null default now(),

  primary key (user_id, skill_id)
);

alter table public.career_skills enable row level security;

drop policy if exists "career: owner reads"   on public.career_skills;
drop policy if exists "career: owner writes"  on public.career_skills;
drop policy if exists "career: owner deletes" on public.career_skills;

create policy "career: owner reads"   on public.career_skills for select using (auth.uid() = user_id);
create policy "career: owner writes"  on public.career_skills for insert with check (auth.uid() = user_id);
create policy "career: owner deletes" on public.career_skills for delete using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- ٤) جدول الأوسمة — موجود أصلاً بس من غير RLS مكتوبة في أي مكان
--
-- BossFight.tsx بيعمل insert فيه من يوليو، وصفحة الإنجازات هتقرا منه. لو
-- الـ RLS مش متظبّطة، القراءة هترجع فاضية والإنسرت هيفشل بصمت.
-- الأسطر دي آمنة لو الجدول موجود ومظبوط أصلاً.
-- ----------------------------------------------------------------------------
create table if not exists public.badges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  config_id      uuid,
  chapter_number int,
  title          text not null,
  subject        text,
  accuracy       int,
  created_at     timestamptz not null default now()
);

create index if not exists badges_user_created_idx
  on public.badges (user_id, created_at desc);

alter table public.badges enable row level security;

drop policy if exists "badges: owner reads"  on public.badges;
drop policy if exists "badges: owner writes" on public.badges;

create policy "badges: owner reads"  on public.badges for select using (auth.uid() = user_id);
create policy "badges: owner writes" on public.badges for insert with check (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- ٥) التراك المفتوح — عمود في profiles
--
-- الداشبورد بتشتغل على تراك واحد في المرة، وصفحة الكورسات بتبدّل بينهم.
-- الاختيار ده صفة في الحساب مش على الجهاز: تختار تراك من اللابتوب تلاقيه
-- مفتوح على الموبايل.
--
-- on delete set null هو المهم هنا: لما تشيل تراك، العمود بيتصفّر لوحده
-- في نفس المعاملة. من غيره كان ممكن البروفايل يفضل مأشّر على تراك
-- مش موجود، والداشبورد تدوّر عليه وترجع فاضية.
--
-- null = «مافيش اختيار» → الداشبورد تفتح أحدث تراك، وده سلوكها الأصلي.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists active_config_id uuid
  references public.study_configs (id) on delete set null;
