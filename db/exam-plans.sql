-- ============================================================================
-- خطط الطوارئ (الامتحان القريب) — جداول Supabase
-- التاريخ: ٣ أغسطس ٢٠٢٦
--
-- ⚠️ شغّل الملف ده مرة واحدة في Supabase → SQL Editor.
--    قبل ما يتشغّل، الميزة هتوري رسالة «شغّل db/exam-plans.sql» بدل ما تكسر.
--    تشغيله أكتر من مرة مش بيضرّ (كل حاجة if not exists / drop if exists).
--
-- ليه جدولين جداد مش study_configs؟
--   study_configs بيوصف تراك طويل («جاوا في ١٤ يوم») ومفيهوش تاريخ خالص —
--   الداشبورد بتحدد اليوم الحالي من عدد الأيام المخلّصة. أما خطة الامتحان
--   فمحورها التاريخ: «النهاردة الفصل الأول، بكرة التاني، الخميس الامتحان».
--   لو حطّينا الاتنين في جدول واحد كنا هنحتاج عمود تاريخ يفضل null في ٩٩٪
--   من الصفوف + منطق «إمتى نستخدم التاريخ وإمتى نستخدم العدّاد» في كل
--   استعلام. الفصل أرخص.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ١) الخطة نفسها
--
-- صف واحد لكل امتحان. المستخدم ممكن يبقى عنده أكتر من امتحان في نفس الوقت
-- (ميدتيرم مادتين في نفس الأسبوع) فمافيش قيد unique على user_id.
-- ----------------------------------------------------------------------------
create table if not exists public.exam_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- المادة زي ما المستخدم كتبها أو زي ما استنتجناها من جملته
  subject     text not null,
  -- تاريخ الامتحان. date مش timestamptz: ده يوم مالوش ساعة، وأي توقيت
  -- بيخلّي «امتحان النهاردة» يبان إمبارح لمستخدم في تايم زون تاني.
  exam_date   date not null,
  -- الجملة الأصلية اللي المستخدم كتبها («عندي امتحان بعد ٣ أيام»).
  -- بنحفظها عشان لو الكشف طلع غلط نعرف نصلّح الكاشف من داتا حقيقية.
  source_text text,

  -- الخطة خلصت؟ بيتحدد يدوي من المستخدم أو أوتوماتيك بعد تاريخ الامتحان
  is_archived boolean not null default false,

  created_at  timestamptz not null default now()
);

-- الاستعلام الأساسي: «إيه الخطة الشغالة بتاعة المستخدم ده؟»
create index if not exists exam_plans_user_active_idx
  on public.exam_plans (user_id, is_archived, exam_date);

alter table public.exam_plans enable row level security;

drop policy if exists "exam_plans: owner reads"   on public.exam_plans;
drop policy if exists "exam_plans: owner writes"  on public.exam_plans;
drop policy if exists "exam_plans: owner updates" on public.exam_plans;
drop policy if exists "exam_plans: owner deletes" on public.exam_plans;

create policy "exam_plans: owner reads"   on public.exam_plans for select using (auth.uid() = user_id);
create policy "exam_plans: owner writes"  on public.exam_plans for insert with check (auth.uid() = user_id);
create policy "exam_plans: owner updates" on public.exam_plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exam_plans: owner deletes" on public.exam_plans for delete using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- ٢) أيام الخطة
--
-- صف لكل يوم. الـ study_date هو اللي بيخلّي «النهاردة» و«بكرة» ليهم معنى —
-- الواجهة بتقارن بـ YYYY-MM-DD كنص مش كـ Date (نفس قرار صفحة المخطط).
-- ----------------------------------------------------------------------------
create table if not exists public.exam_plan_days (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.exam_plans (id) on delete cascade,
  -- user_id مكرر هنا عن قصد: من غيره كل سياسة RLS هتحتاج join على
  -- exam_plans، وده بيتكلّف على كل صف في كل استعلام.
  user_id     uuid not null references auth.users (id) on delete cascade,

  day_number  smallint not null,
  study_date  date not null,
  -- content = محتوى جديد | review = مراجعة | quiz = اختبار شامل
  kind        text not null default 'content',

  title       text not null,
  -- سطر واحد: إيه اللي بيتعمل في اليوم ده بالظبط
  description text,

  is_done     boolean not null default false,
  done_at     timestamptz,

  created_at  timestamptz not null default now(),

  -- يوم واحد بس لكل رقم في الخطة. بيمنع التكرار لو حصل ريتراي على الحفظ.
  unique (plan_id, day_number)
);

-- ⚠️ القيد ده بيحمي الواجهة: kind بيتحوّل لأيقونة ولون، وأي قيمة تانية
-- كانت هتطلع كارت من غير شكل. الموديل بيرجّع kind فلازم نتأكد منه في
-- الداتابيز كمان مش في الكود بس.
alter table public.exam_plan_days drop constraint if exists exam_plan_days_kind_check;
alter table public.exam_plan_days
  add constraint exam_plan_days_kind_check
  check (kind in ('content', 'review', 'quiz'));

create index if not exists exam_plan_days_plan_idx
  on public.exam_plan_days (plan_id, day_number);

-- الاستعلام «إيه المطلوب مني النهاردة؟» عبر كل الخطط
create index if not exists exam_plan_days_user_date_idx
  on public.exam_plan_days (user_id, study_date, is_done);

alter table public.exam_plan_days enable row level security;

drop policy if exists "exam_days: owner reads"   on public.exam_plan_days;
drop policy if exists "exam_days: owner writes"  on public.exam_plan_days;
drop policy if exists "exam_days: owner updates" on public.exam_plan_days;
drop policy if exists "exam_days: owner deletes" on public.exam_plan_days;

create policy "exam_days: owner reads"   on public.exam_plan_days for select using (auth.uid() = user_id);
create policy "exam_days: owner deletes" on public.exam_plan_days for delete using (auth.uid() = user_id);

-- ⚠️ الإضافة والتعديل بيتأكدوا من حاجتين مش واحدة: إن الصف بتاعي (user_id)
-- **و** إن الخطة اللي بيشاور عليها بتاعتي كمان (plan_id).
--
-- من غير الشرط التاني: مستخدم يقدر يضيف يوم بـ user_id بتاعه بس plan_id
-- بتاع خطة حد تاني. القراءة لسه محمية (الضحية مش هتشوف الصف لأن الـ user_id
-- مش بتاعه) فمفيش تسريب — لكن الصف بيقعد في جدول الضحية ويتمسح معاها
-- بالـ cascade، وبيعدّ في أي إحصائية بتعدّ صفوف الخطة. القفلة أرخص من
-- الاعتماد على إن الكلاينت دايماً بيبعت plan_id صح.
create policy "exam_days: owner writes" on public.exam_plan_days
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.exam_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "exam_days: owner updates" on public.exam_plan_days
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.exam_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );


-- ============================================================================
-- تم. لو شغّلت الملف ومافيش أخطاء، الميزة جاهزة:
--   المستخدم يكتب في شات المساعد «عندي امتحان بعد ٣ أيام» → يلاقي خطة.
-- ============================================================================
