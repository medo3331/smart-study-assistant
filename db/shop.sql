-- ============================================================================
-- المتجر والكوينز — جداول Supabase
-- التاريخ: ٧ أغسطس ٢٠٢٦
--
-- ⚠️ شغّل الملف ده مرة واحدة في Supabase → SQL Editor.
--    قبل ما يتشغّل، المتجر والمخزن بيوروا رسالة «شغّل db/shop.sql» بدل ما
--    يكسروا. وتشغيله أكتر من مرة مش بيضرّ (كله if not exists / or replace).
--
-- ⚠️⚠️ القاعدة اللي الملف ده كله مبني عليها:
--    **الكوينز بتتكسب بالمذاكرة بس. مفيش شرا بفلوس حقيقية إطلاقاً.**
--    مفيش دالة هنا بتزوّد رصيد من غير مصدر مذاكرة معروف، ومفيش سياسة RLS
--    بتخلّي المتصفح يكتب في الرصيد. الشرا الوحيد الموجود: كوينز ← عنصر.
--
-- ── ليه الرصيد مش عمود في profiles؟ ──
-- profiles عليها سياسة update للمالك، يعني أي عمود فيها المتصفح بيقدر
-- يكتبه. وده اللي حاصل مع الـ XP فعلاً: app/dashboard/page.tsx:454 بيعمل
-- update({ xp }) من الكلاينت، فالـ XP قابل للتزوير من الكونسول.
--
-- مش بنكرّر ده مع الكوينز. المحفظة جدول لوحدها، سياستها **قراءة بس**، وكل
-- تعديل بيمرّ من دالة security definer. الفرق الجوهري: الكلاينت بيقول
-- «خلّصت يوم» — مش «هاتلي ٢٥ كوين». الدالة هي اللي بتقرأ المبلغ من جدول
-- القواعد، **وبتتأكد إن اليوم ده مخلّص فعلاً على حساب اللي بينادي** قبل ما
-- تدفع. فالمطالبة الكاذبة بترجع خطأ مش كوينز.
--
-- ⚠️ الاستثناء الوحيد مكتوب صريح: `daily_login` و`streak_day` (٥ + ٨
-- كوين، سقف ١/يوم لكل واحد) بيتحققوا من `profiles.last_study_day`، وde
-- عمود المتصفح بيكتبه. يعني ١٣ كوين في اليوم قابلة للتزوير نظرياً — أغلى
-- عنصر (٦٠٠٠) بيعوز أكتر من سنة بالطريق ده. تسريب متقاس ومكتوب، مش ثغرة
-- منسية. تصليحه الحقيقي إن السلسلة تبقى محسوبة في السيرفر، ودي شغلانة
-- لوحدها بتلمس الداشبورد و`unlock_satisfied` مع بعض.
--
-- ── خمس حاجات لازم تفضل صح مع أي تعديل ──
-- أربعة منهم ثغرات أمنية من نفس النوع: «سياسة بتبان بريئة». والخامسة مش
-- ثغرة أمنية أصلاً — بَج وقت تشغيل بيقع في الدوال الجديدة تحديداً.
-- لو هتزوّد جدول أو سياسة أو دالة هنا، اقرا الخمسة دول الأول:
--
--  ١) **مفيش سياسة insert على shop_inventory.** شرط `auth.uid() = user_id`
--     لوحده معناه إن المستخدم يعمل insert لأي `item_id` من الكونسول
--     وياخد أي عنصر ببلاش — و`purchase_item` كلها تبقى اختيارية. الملكية
--     بتيجي من دوال definer بس، ودي بتتخطّى الـ RLS فمش محتاجة سياسة.
--
--  ٢) **الـ RLS مابتحصرش أعمدة.** سياسة update عامة على المخزن كانت
--     بتخلّي المستخدم يكتب `item_id` نفسه — ياخد الصف المجاني ويحوّله
--     لأغلى عنصر. الحصر الحقيقي `grant update (favorite)`، مش السياسة.
--
--  ٣) **مصدر شغّال بسقف null = حنفية مفتوحة.** `badge` كان كده: نداء
--     متكرر من الكونسول = ٤٠ كوين كل مرة بلا نهاية. أي مصدر `is_live`
--     لازم يبقى ليه `daily_cap`، والفهرس الفريد على (user, source, ref)
--     هو الطبقة التانية.
--
--  ٤) **مصدر من غير تحقق حدث = مطالبة بتتصدّق.** كل الفحوص فوق بتتأكد
--     مين بينادي وبكام، مش من إن الحاجة حصلت. `award_coins` فيها `case`
--     بيربط كل مصدر بصف حقيقي (`study_days`، `planner_goals`، `badges`،
--     أو السجل نفسه)، و`else` بترمي — فمصدر جديد من غير فرع بيرفض بدل ما
--     يوزّع.
--
--  ٥) **أسماء `returns table` بتبقى متغيّرات في كل جسم الدالة.** في
--     `plpgsql` أي عمود خروج اسمه زي عمود في جدول بتستعلم منه بيرمي وقت
--     التشغيل: `column reference "label" is ambiguous`. ودي وقعت فعلاً في
--     `spin_wheel` — والمكر إن `id` ماشتكاش لأن اسم الخروج `prize_id`، فنص
--     الاستعلام كان شغّال والنص التاني بيرمي. القاعدة: غيّر اسم العمود جوه
--     الاستعلام (`w.label as p_label`) مش اسم الخروج — أسماء الخروج مربوطة
--     بـ `lib/shop/shop-data.ts` اللي بيقرا `row.label` بالحرف. ودوال
--     `language sql` مش بتتأثر بده خالص.
--
-- ── إيه المتولّد وإيه المكتوب بالإيد؟ ──
-- الجداول والسياسات والدوال مكتوبة هنا. أما صفوف السييد (الكتالوج، قواعد
-- المصادر، الدوريات) فمتولّدة من الـ TS بـ `node scripts/shop-seed.mjs`
-- بين علامات BEGIN/END. السبب: الأسعار لازم تبقى نفسها في المكانين، ولو
-- اتكتبت مرتين بالإيد هتفرق. لو عدّلت كتالوج أو مبلغ في lib/shop، شغّل
-- السكريبت وبعدها شغّل الملف ده تاني.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ١) قواعد مصادر الكسب — مرآة COIN_SOURCES في lib/shop/economy.ts
--
-- الجدول ده هو **السلطة على المبالغ**. الدالة بتقرأ منه، فالكلاينت مالوش
-- دعوة بالمبلغ خالص.
--
-- is_live = المصدر متوصّل فعلاً في الكود. المصادر اللي لسه ما اتبنتش (غرفة
-- الهروب، عجلة الحظ، ترقية الدوري) موجودة بـ false والدالة بترفضها — عشان
-- محدّش يكسب من مصدر مفيش كود بينادي عليه. لما تتبني: خلّي live: true في
-- economy.ts، شغّل السييد، وخلاص. مش migration.
-- ----------------------------------------------------------------------------
create table if not exists public.coin_source_rules (
  id        text primary key,
  amount    int not null check (amount > 0),
  -- null = مفيش سقف يومي، للأحداث اللي بطبيعتها مش بتتكرر (وسام جديد)
  daily_cap int check (daily_cap is null or daily_cap > 0),
  is_live   boolean not null default false
);

alter table public.coin_source_rules enable row level security;

-- قراءة بس، ومفيش سياسة كتابة خالص: السييد بيجري بصلاحية service role من
-- محرر SQL، والكلاينت محتاج يقرا القواعد عشان يعرض «فاضلك ٢ النهاردة».
drop policy if exists "coin_rules: signed in reads" on public.coin_source_rules;
create policy "coin_rules: signed in reads" on public.coin_source_rules
  for select using (auth.uid() is not null);


-- ----------------------------------------------------------------------------
-- ٢) الدوريات — مرآة LEAGUES في lib/shop/economy.ts
--
-- الدوري نفسه **مشتق من الـ XP** ومش متخزّن على المستخدم (شوف التعليق في
-- economy.ts). الجدول ده موجود لسبب واحد: دالة الشرا محتاجة تتحقق من شرط
-- «لازم توصل دوري الأساطير» من غير أرقام سحرية مكتوبة جوه الدالة.
-- ----------------------------------------------------------------------------
create table if not exists public.shop_leagues (
  id     text primary key,
  min_xp int not null check (min_xp >= 0),
  -- الترتيب من الأدنى للأعلى — للمقارنة
  rank   int not null
);

alter table public.shop_leagues enable row level security;

drop policy if exists "leagues: signed in reads" on public.shop_leagues;
create policy "leagues: signed in reads" on public.shop_leagues
  for select using (auth.uid() is not null);


-- ----------------------------------------------------------------------------
-- ٣) المحفظة والسجل — الكوينز
--
-- المحفظة صف واحد لكل مستخدم، والسجل صف لكل حركة (كسب أو شرا).
-- الرصيد **مستنتج** من السجل (sum) مش عمود بيتحدث — عشان كده التزوير
-- بيدخل السجل وهو بيتكشف، ومستحيل تبقى في رصيد من غير حركات.
--
-- 💾 ليها نسخة احتياطية خاصة: نفس السجل هو اللي بيخلّي لو حصل تراجع
-- (rollback) المستخدم بيلاقي كوينزه زي ما هما. مع عمود رصيد ده هيبقى
-- رقم يتاكل لو اتعدّل.
--
-- لو التحقق من الإيصال بقى مطلوب (مش الآن — المشروع صغير وهدفنا الأساس
-- الصلب الأول): اتحقق من الدوال والـ RLS الأول، وبعدها في مرحلة تانية
-- نضيف hash على السجل. دلوقتي هيكل السجل بيسمح بيه من غير ما يحبس حد.
-- ----------------------------------------------------------------------------
create table if not exists public.coin_wallets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.coin_wallets enable row level security;

drop policy if exists "wallet: owner reads" on public.coin_wallets;
create policy "wallet: owner reads" on public.coin_wallets
  for select using (auth.uid() = user_id);


-- سجل الحركات. source نص عن قصد — شوف تعليق COIN_SOURCES في economy.ts:
-- المصادر الجديدة بتتوصّل بعدين من غير migration، والنص متطابق مع id
-- الموجود في COIN_SOURCES وcoin_source_rules.
create table if not exists public.coin_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  source     text not null,
  amount     int  not null check (amount <> 0),  -- موجب كسب / سالب شرا
  -- مش تقييد فوري (مفيش هاردكود هنا) — السقف بيتمنع في دالة الكسب نفسها.
  -- العمود موجود كوثيقة وللاستعلامات زي «إيه اللي جاب أعلى كسب في الأسبوع»
  source_type text not null default 'earn' check (source_type in ('earn', 'spend')),

  -- المرجع للسبب. للأوسمة: badge_id اللي اتكسب. للشرا: item_id.
  -- نستخدم نص مش FK: الدوال ليها صلاحية أعلى من الكلاينت، وماينفعش
  -- نخلي دالة security definer تتحقق بقيود FK من جدول تاني. (على عكس
  -- سياسات RLS — اللي بتتحقق بجد، شوف القسم ٥.)
  ref_id   text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- الأكثر استخداماً: رصيد المستخدم، وكل حركاته مرتبة
create index if not exists coin_ledger_user_created_idx
  on public.coin_ledger (user_id, created_at desc);

-- سقف يومي بالمصدر: استعلام عن «كسب إمبارح» بدل ما يقرا ٥٠٠ صف
create index if not exists coin_ledger_user_source_day_idx
  on public.coin_ledger (user_id, source, created_at);

/* 🔒 مرة واحدة لكل سبب. المصدر + المرجع + المستخدم = صف واحد بالكتير.

   ⚠️ ده مش تحسين — ده اللي بيقفل أهم ثغرة: السقف اليومي بيحمي المصادر
   اللي ليها `daily_cap`، لكن مصدر بسقف `null` (زي `badge`) كان بيتنادى
   بلا حدود من الكونسول: `while(true) rpc('award_coins',{p_source:'badge'})`
   = ٤٠ كوين كل نداء لحد الأبد. الفهرس ده بيخلي إعادة نفس المرجع تفشل
   في الداتابيز نفسها، مش في الكود اللي بينادي.

   `where ref_id is not null` عن قصد — بس بقى شرط شبه نظري: `award_coins`
   بتولّد مرجع في السيرفر (تاريخ اليوم بـ UTC) للمصادر اللي مالهاش صف
   مرجع طبيعي (الدخول، السلسلة، الأسبوع الكامل)، فكلهم داخلين الفهرس
   دلوقتي. يعني «مرة واحدة في اليوم» بقت مفروضة في الداتابيز نفسها مش في
   عدّاد بيتقرا ويتكتب في خطوتين. الشرط باقي عشان أي صف قديم بمرجع null. */
create unique index if not exists coin_ledger_source_ref_once_idx
  on public.coin_ledger (user_id, source, ref_id)
  where ref_id is not null and source_type = 'earn';

alter table public.coin_ledger enable row level security;

drop policy if exists "ledger: owner reads" on public.coin_ledger;
create policy "ledger: owner reads" on public.coin_ledger
  for select using (auth.uid() = user_id);


-- الرصيد: sum على السجل، بس محسوب **في السيرفر**.
--
-- Why دالة مش استعلام من المتصفح: الرصيد مجموع كل الحركات، فمن غير الدالة
-- الواجهة لازم تنزّل السجل كله كل مرة تفتح المتجر عشان تجمعه — وده بيكبر
-- مع كل يوم مذاكرة. والسجل الأحدث بيتقرا لوحده بـ limit، فمينفعش نجمع منه.
--
-- ⚠️ **مش security definer** عن قصد — على عكس باقي الدوال هنا. الدالة دي
-- بتقرا بس، والـ RLS بتحصرها على صفوف صاحبها فعلاً. لو خلّيناها definer
-- كانت هتتخطّى الـ RLS ووقتها لازم تفلتر بـ auth.uid() بنفسها — طبقة
-- حماية زيادة مكتوبة بالإيد مكان واحدة موجودة ومجرّبة.
create or replace function public.coin_balance()
returns int
language sql
stable
set search_path = public, pg_catalog
as $$
  select coalesce(sum(amount), 0)::int from public.coin_ledger;
$$;

revoke all on function public.coin_balance() from public;
grant execute on function public.coin_balance() to authenticated;


-- ----------------------------------------------------------------------------
-- ٤) دالة الكسب — security definer
--
-- **دي الطريق الوحيد للكسب.** كل مصدر (خلّصت يوم، هدف، وسام، دخول يومي،
-- سلسلة، أسبوع كامل) بينادي عليها بمعرّف مصدر بس. الدالة بتقرا المبلغ
-- والسقف من coin_source_rules — مش بتاخد مبلغ من الكلاينت خالص.
--
-- ⚠️ **الدالة مبتاخدش user_id بارامتر.** بتقرا `auth.uid()` بنفسها.
-- ده الفرق بين دالة آمنة ودالة بتوزّع كوينز على أي حد: لو الـ user_id
-- بارامتر، أي حد يقدر ينادي award_coins بـ id حد تاني — والـ security
-- definer بيتخطّى الـ RLS فمفيش حاجة تانية هتوقفه. الهوية بتيجي من
-- الجلسة، والكلاينت بيقول إيه حصل بس.
--
-- search_path مثبّت على pg_catalog — إجراء قياسي لأي security definer:
-- من غيره حد يعمل جدول اسمه coin_source_rules في سكيما جوه الـ path بتاعه
-- ويخلّي الدالة تقرا مبالغه هو.
-- ----------------------------------------------------------------------------
create or replace function public.award_coins(
  p_source text,
  p_ref_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (awarded int, balance int, capped boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid       uuid := auth.uid();
  v_amount    int;
  v_cap       int;
  v_live      boolean;
  v_today_cnt int;
  v_awarded   int := 0;
  v_capped    boolean := false;
  /* المرجع اللي بيتخزّن فعلاً. بيبدأ باللي جاي من الكلاينت، وللمصادر
     اللي مالهاش صف مرجع طبيعي (الدخول والسلسلة والأسبوع) بيتولّد هنا
     من تاريخ اليوم — عشان الفهرس الفريد يشتغل عليها هي كمان. */
  v_ref       text := p_ref_id;
  v_day       text := ((now() at time zone 'utc')::date)::text;
  v_days      int;
begin
  if v_uid is null then
    raise exception 'award_coins: لازم تكون داخل بحسابك';
  end if;

  /* الزائر لأ. المشروع بيعمل جلسات مجهولة (`signInAnonymously`) عشان
     الزائر يجرّب الداشبورد، ودي جلسة دورها `authenticated` — يعني الـ
     grant اللي تحت بيغطّيها و`auth.uid()` مش null. من غير الفحص ده حد
     يفتح حسابات مجهولة بالجملة ويحرث كوينز فيها.

     مش خساره حقيقية (الكوينز تجميلية والصفحتين بيرفضوا الزائر أصلاً)،
     بس السجل بيتوسّخ بصفوف لحسابات مش هترجع. */
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'award_coins: الزائر مايكسبش كوينز — سجّل حساب';
  end if;

  -- المبلغ من الجدول، مش من الكلاينت. مصدر مش معروف = خطأ مش صفر،
  -- عشان غلطة كتابة في اسم مصدر تبان بدل ما تسكت.
  select amount, daily_cap, is_live
    into v_amount, v_cap, v_live
    from public.coin_source_rules
   where id = p_source;

  if not found then
    raise exception 'award_coins: مصدر مش معروف: %', p_source;
  end if;

  -- المصادر اللي لسه ما اتبنتش مترفوضة. لو حد نادى wheel من الكونسول
  -- قبل ما عجلة الحظ تتبني، ميكسبش حاجة.
  if not v_live then
    raise exception 'award_coins: المصدر % لسه مش شغّال', p_source;
  end if;

  /* ⚠️⚠️ **التحقق إن الحدث حصل فعلاً.**

     ده أهم بلوك في الدالة، ومن غيره كل اللي فوق بيتأكد من إن اللي بينادي
     مسجّل ومصدره معروف — **مش** من إنه عمل حاجة. النداء ده من الكونسول:

         await sb.rpc('award_coins', { p_source: 'perfect_week' })

     كان بيدّي ١٢٠ كوين لواحد ما فتحش درس في حياته، والسقف اليومي كان
     بيسمح بتكراره كل يوم. ١٢٠ + ١٢٠ (وسام) + ٧٥ (٣ أيام) + ٥٠ (٥ أهداف)
     + ١٣ = ٣٧٨ كوين في اليوم من غير مذاكرة، يعني أغلى عنصر خرافي في
     ١٦ يوم. وكمان كان بيلغي شرط المذاكرة بتاع العجلة، لأن نداء واحد
     مزوّر لـ `day_done` بيحطّ في السجل الصف اللي `spin_wheel` بتدوّر عليه.

     دلوقتي كل مصدر مربوط بصف حقيقي في جدول تاني، والصف ده إمّا الداتابيز
     هي اللي كتبته أو الـ RLS بتحصره على صاحبه. الفرق: المستخدم بقى بيقول
     «أهو الدليل» مش «صدّقني».

     ⚠️ `else` بيرمي مش بيعدّي. لو حد قلب مصدر جديد لـ `live: true` في
     economy.ts ونسي يكتبله تحقق هنا، المصدر بيرفض — مش بيوزّع. */
  case p_source
    when 'day_done' then
      /* المرجع = `study_days.id` (من app/lesson/[dayId]/page.tsx). الصفحة
         بتعمل `update ... is_completed = true` وبتنتظره **قبل** نداء
         الكسب، فالصف أكيد موجود ومتعلّم وقت ما بنبص عليه. */
      if v_ref is null then
        raise exception 'award_coins: day_done محتاج معرّف اليوم';
      end if;
      if not exists (
        select 1 from public.study_days d
         where d.id::text = v_ref
           and d.user_id = v_uid
           and d.is_completed = true
      ) then
        raise exception 'award_coins: اليوم ده مش مخلّص على حسابك';
      end if;

    when 'goal_done' then
      -- المرجع = `planner_goals.id`، والحفظ بينتظر قبل الكسب برضه.
      if v_ref is null then
        raise exception 'award_coins: goal_done محتاج معرّف الهدف';
      end if;
      if not exists (
        select 1 from public.planner_goals g
         where g.id::text = v_ref
           and g.user_id = v_uid
           and g.is_done = true
      ) then
        raise exception 'award_coins: الهدف ده مش متعلّم على حسابك';
      end if;

    when 'badge' then
      /* المرجع من components/BossFight.tsx شكله «<config uuid>:<رقم الفصل>»
         — الفصل مش معرّف صف الوسام، عشان إعادة حفظ نفس الفصل ما تدفعش
         تاني. بنقارن نصّ عشان `split_part` بترجّع نص، و`::text` على
         الأعمدة بيمنع خطأ تحويل لو المرجع مش على الشكل ده. */
      if v_ref is null then
        raise exception 'award_coins: badge محتاج مرجع الفصل';
      end if;
      if not exists (
        select 1 from public.badges b
         where b.user_id = v_uid
           and b.config_id::text     = split_part(v_ref, ':', 1)
           and b.chapter_number::text = split_part(v_ref, ':', 2)
      ) then
        raise exception 'award_coins: مفيش وسام بالمرجع ده على حسابك';
      end if;

    when 'perfect_week' then
      /* أغلى مصدر في المشروع (١٢٠)، فبيتحقق من **السجل نفسه** مش من
         `profiles.streak`.

         Why: السلسلة عمود المستخدم بيكتبه من المتصفح (الداشبورد بتعمل
         `update profiles set streak = ...`)، يعني `streak % 7 = 0` شرط
         المستخدم يقدر يحققه بسطر في الكونسول. أما `coin_ledger` فمالوش
         سياسة insert خالص — الصفوف اللي جواه الداتابيز هي اللي كتبتها،
         وبعد التحقق اللي فوق كل صف `day_done`/`goal_done` جواه معناه
         يوم مذاكرة حقيقي. فبنعدّ الأيام من هناك.

         ⚠️ ٦ مش ٧ عن قصد: الداشبورد بتنادي المصدر ده **في أول زيارة
         لليوم السابع**، يعني قبل ما اليوم ده نفسه يتسجّل فيه مذاكرة.
         طلب ٧ كان معناه شرط مستحيل يتحقق والمكافأة ما تنزلش أبداً. */
      select count(distinct (l.created_at at time zone 'utc')::date)
        into v_days
        from public.coin_ledger l
       where l.user_id = v_uid
         and l.source in ('day_done', 'goal_done', 'badge')
         and l.source_type = 'earn'
         -- `::timestamp at time zone 'utc'` مش `::timestamptz` — الفرق مشروح
         -- عند السقف اليومي تحت. باختصار: التاني بيقرا TimeZone الجلسة.
         and l.created_at >= (((now() at time zone 'utc')::date - 6)::timestamp
                              at time zone 'utc');

      if coalesce(v_days, 0) < 6 then
        raise exception
          'award_coins: الأسبوع الكامل محتاج ٦ أيام مذاكرة في آخر ٧ (عندك %)',
          coalesce(v_days, 0);
      end if;
      v_ref := v_day;

    when 'streak_day' then
      /* السلسلة والدخول اليومي بيتحققوا من `profiles` — وده **أضعف** من
         اللي فوق لأن العمود بيتكتب من المتصفح. مقبول هنا وبس هنا: ٨ + ٥
         = ١٣ كوين في اليوم بسقف صارم، يعني أغلى عنصر (٦٠٠٠) عايز أكتر من
         سنة بالطريق ده — مش ثغرة، تسريب بطيء متقاس ومكتوب.
         (السلسلة نفسها مصدر ثقة في المشروع كله: `unlock_satisfied`
         بتقرا منها كمان. تحويلها لسيرفر-أوثوريتاتيف شغل لوحده.) */
      if not exists (
        select 1 from public.profiles p
         where p.id = v_uid
           and p.last_study_day = (now() at time zone 'utc')::date
           and coalesce(p.streak, 0) >= 2
      ) then
        raise exception 'award_coins: مفيش سلسلة شغّالة النهارده';
      end if;
      v_ref := v_day;

    when 'daily_login' then
      if not exists (
        select 1 from public.profiles p
         where p.id = v_uid
           and p.last_study_day = (now() at time zone 'utc')::date
      ) then
        raise exception 'award_coins: الزيارة مش مسجّلة النهارده';
      end if;
      v_ref := v_day;

    else
      raise exception 'award_coins: المصدر % شغّال من غير تحقق حدث', p_source;
  end case;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- 🔒 نفس قفل الشرا، وللسبب المعاكس: من غيره طلبين في نفس اللحظة يقروا
  -- نفس العدّاد (٢ من سقف ٣) والاتنين يعدّوا نفسهم تحت السقف — فالسقف
  -- يتخطّى بالضغط المتزامن. القفل بيسلسل الكسب لكل مستخدم لوحده.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  -- السقف اليومي بالتوقيت المحلي للمستخدم؟ لأ — بـ UTC.
  -- Why: التوقيت المحلي بييجي من المتصفح، يعني قابل للتلاعب. واحد يقدر
  -- يقدّم ساعته ويلف على السقف كل شوية. بـ UTC اليوم واحد للكل ومحدّد
  -- من السيرفر. التكلفة إن حد في القاهرة سقفه بيتصفّر ٢ بالليل مش ١٢ —
  -- مقبول، وأرخص من سقف بيتخطّى.
  if v_cap is not null then
    select count(*) into v_today_cnt
      from public.coin_ledger
     where user_id = v_uid
       and source  = p_source
       and source_type = 'earn'
       /* ⚠️⚠️ بداية اليوم لازم تتحسب بـ UTC في **الخطوتين**، والصيغة دي
          مقصودة بالحرف. تلات صيغ تبان زي بعض وواحدة بس صح:

            date_trunc('day', now())                    ← بيقطع بـ TimeZone الجلسة
            ((now() at time zone 'utc')::date)::timestamptz  ← التاريخ صح والساعة غلط
            ((now() at time zone 'utc')::date)::timestamp at time zone 'utc'  ← ✔

          التانية هي الفخ: `(now() at time zone 'utc')::date` بيطلّع تاريخ
          UTC صح، بس `date::timestamptz` بيفسّر نص الليل بـ **TimeZone
          الجلسة** مش بـ UTC. بـ Africa/Cairo النافذة بتفتح ٢١:٠٠Z
          امبارح، وبأوفست سالب بتفتح متأخرة — والاتجاه التاني هو الخطر:
          صفوف أول اليوم بـ UTC بتقع بره العدّ، فالسقف يتخطّى.

          الصيغة التالتة بتاخد التاريخ، تعمله نص ليل بلا منطقة، وبعدين
          تفسّره كـ UTC صريح — فالنتيجة نفسها مهما كانت TimeZone الجلسة.
          مهم لأن `set search_path` متثبّت على الدالة لكن TimeZone لأ:
          `alter role authenticated set timezone` بيزحلق ده كله في سكوت. */
       and created_at >= (((now() at time zone 'utc')::date)::timestamp
                          at time zone 'utc');

    if v_today_cnt >= v_cap then
      v_capped := true;
    end if;
  end if;

  if not v_capped then
    /* ⚠️ `on conflict do nothing` مقصود ومهم:
       الفهرس الفريد (user_id, source, ref_id) بيمنع إعادة نفس السبب.
       من غير الجملة دي إعادة إنهاء نفس الدرس كانت هترمي exception —
       والكلاينت بيلفّها في try، فالنتيجة كانت هتبقى سكوت غامض. بالجملة
       دي الإعادة بترجّع `awarded = 0` بشكل صريح، وde الفرق بين
       «مكسبتش» و«الحاجة اتكسرت».

       الشرط `v_awarded > 0` هو اللي بيفرّق: لو الصف ما اتضافش، المبلغ
       يفضل صفر والرصيد مايتغيّرش. */
    insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
    values (v_uid, p_source, v_amount, 'earn', v_ref, coalesce(p_metadata, '{}'::jsonb))
    on conflict do nothing;

    if found then
      v_awarded := v_amount;
    end if;
  end if;

  return query
    select v_awarded,
           coalesce((select sum(l.amount)::int from public.coin_ledger l where l.user_id = v_uid), 0),
           v_capped;
end;
$$;

revoke all on function public.award_coins(text, text, jsonb) from public;
grant execute on function public.award_coins(text, text, jsonb) to authenticated;


-- ----------------------------------------------------------------------------
-- ٥) المخزن والتلبيس
--
-- **المخزن**: صف لكل عنصر مملوك، مفتاحه (user_id, item_id) فمستحيل تملك
-- نفس العنصر مرتين. item_id نص متطابق مع الكتالوج في lib/shop/catalog.ts
-- — مش FK لجدول عناصر، لأن الكتالوج محتوى بيتغيّر مع نسخة التطبيق مش مع
-- المستخدم (نفس قرار career_skills في pages.sql).
--
-- **التلبيس**: جدول تاني، مفتاحه (user_id, slot). المفتاح ده لوحده هو
-- «عنصر واحد بس في كل خانة» — مش محتاج trigger ولا تحقق في الكود.
-- والخلع = مسح الصف.
--
-- والحاجة المهمة: `item_id` بيشاور على **صف المخزن** مش على الكتالوج
-- (foreign key مركّب على user_id مع item_id). يعني تلبيس عنصر مش مملوك
-- بيتكسر في الداتابيز، مش بيتمنع بشرط في الواجهة. ولو العنصر اتشال من
-- المخزن، الـ cascade بيخلعه في نفس المعاملة — فمفيش خانة بتفضل مأشّرة
-- على حاجة مش موجودة (نفس منطق active_config_id في pages.sql).
-- ----------------------------------------------------------------------------
create table if not exists public.shop_inventory (
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    text not null,  -- مرآة الكتالوج في lib/shop/catalog.ts

  -- هواية: صفر/واحد
  favorite   boolean not null default false,

  -- آخر مرة اتلبس فيها واتخلع — ترتيب «الأحدث» في المخزن
  last_equipped_at timestamptz,
  -- آخر مرة اتلبس — للتسريح (لو احتجنا بعدين)
  last_used_at     timestamptz,

  purchased_at timestamptz not null default now(),

  primary key (user_id, item_id)
);

-- ترتيب المخزن وفلتر الهوايات
create index if not exists shop_inventory_user_fav_idx
  on public.shop_inventory (user_id, favorite, purchased_at desc);

alter table public.shop_inventory enable row level security;

/* ⚠️⚠️ المخزن للقراءة والتفضيل بس — مفيش insert ولا delete خالص.
   الملكية بتيجي من `purchase_item` و`grant_default_items` (الاتنين
   security definer، فبيتخطّوا الـ RLS أصلاً ومش محتاجين سياسة).

   السبب مهم: سياسة insert شرطها `auth.uid() = user_id` بس معناها
   المستخدم يعمل من الكونسول
     supabase.from('shop_inventory').insert({user_id: me, item_id: 'x'})
   ويجيب أي عنصر ببلاش — ويخلي `purchase_item` كلها اختيارية. مافيش أي
   مسار في الكود بيعمل insert من الكلاينت، فالسياسة كانت سطح هجوم صافي.

   وdelete كان بيخلي المستخدم يمسح حاجة دفع فيها من غير استرجاع. */
drop policy if exists "inventory: owner reads"   on public.shop_inventory;
drop policy if exists "inventory: owner writes"  on public.shop_inventory;
drop policy if exists "inventory: owner updates" on public.shop_inventory;
drop policy if exists "inventory: owner deletes" on public.shop_inventory;

create policy "inventory: owner reads"   on public.shop_inventory for select using (auth.uid() = user_id);

/* التفضيل (النجمة) هو التحديث الوحيد المسموح.
   ⚠️ السياسة لوحدها مش كفاية: الـ RLS مابتعرفش تحصر أعمدة، فسياسة
   update عامة كانت بتخلي المستخدم يكتب `item_id` نفسه — ياخد الصف
   المجاني اللي اتوهبله ويحوّله لأغلى عنصر في الكتالوج. الحصر الحقيقي
   هو الـ grant على عمود `favorite` تحت. */
create policy "inventory: owner updates" on public.shop_inventory for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update on public.shop_inventory from authenticated;
grant  update (favorite) on public.shop_inventory to authenticated;


create table if not exists public.shop_equipped (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot    text not null check (slot in ('theme', 'avatar', 'frame', 'title', 'companion', 'sound', 'effect')),
  item_id text not null,
  equipped_at timestamptz not null default now(),

  -- بيشاور على صف المخزن: مفيش سلوت خالي من عنصر مملوك، ومفيش
  -- عنصر غير مملوك يتلبس، ومفيش عنصر يتلبس مرتين في سلوت واحد.
  primary key (user_id, slot),
  foreign key (user_id, item_id)
    references public.shop_inventory (user_id, item_id) on delete cascade
);

alter table public.shop_equipped enable row level security;

drop policy if exists "equipped: owner reads"   on public.shop_equipped;
drop policy if exists "equipped: owner writes"  on public.shop_equipped;
drop policy if exists "equipped: owner updates" on public.shop_equipped;
drop policy if exists "equipped: owner deletes" on public.shop_equipped;

create policy "equipped: owner reads"   on public.shop_equipped for select using (auth.uid() = user_id);
create policy "equipped: owner deletes" on public.shop_equipped for delete using (auth.uid() = user_id);

-- ⚠️ الإضافة والتعديل بيتأكدوا من حاجتين مش واحدة: إن الصف بتاعي **و** إن
-- العنصر اللي بتلبسه في مخزني. نفس درس exam_plan_days في exam-plans.sql:
-- الـ FK المركّب بيمنع ده فعلاً، بس السياسة بتخلّي الرفض ييجي من RLS
-- برسالة مفهومة بدل خطأ قيد، والحماية بتبقى في طبقتين.
--
-- ⚠️⚠️ لاحظ `shop_equipped.item_id` **باسم الجدول**. لو كتبناها `item_id`
-- من غير تأهيل، الـ SQL بيربطها بأقرب نطاق — يعني `inv.item_id` — والشرط
-- يبقى `inv.item_id = inv.item_id`: صح دايماً، والسياسة تتحوّل لديكور.
-- (سياسة exam_plan_days نجت من ده بالصدفة: `plan_id` مش عمود في
-- exam_plans فالربط طلع على الصف الخارجي. هنا الاسمين واحد.)
create policy "equipped: owner writes" on public.shop_equipped
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.shop_inventory inv
      where inv.user_id = auth.uid() and inv.item_id = shop_equipped.item_id
    )
  );

create policy "equipped: owner updates" on public.shop_equipped
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.shop_inventory inv
      where inv.user_id = auth.uid() and inv.item_id = shop_equipped.item_id
    )
  );

-- ----------------------------------------------------------------------------
-- ٦) كتالوج الأسعار — مرآة CATALOG في lib/shop/catalog.ts
--
-- ليه الأسعار في الداتابيز كمان؟ لأن دالة الشرا لازم تعرف السعر من غير ما
-- تسأل الكلاينت. لو الكلاينت بعت السعر، أي حد يشتري «خرافي» بـ ١٠ كوين.
--
-- والعناصر نفسها (الاسم، الوصف، الإيموجي، الندرة) مش هنا — بتفضل في الـ TS.
-- اللي هنا هو اللي الداتابيز محتاجة تحكم بيه: السعر، الخانة، وشرط الفتح.
-- ----------------------------------------------------------------------------
create table if not exists public.shop_catalog (
  id     text primary key,
  slot   text check (slot is null or slot in ('theme', 'avatar', 'frame', 'title', 'companion', 'sound', 'effect')),
  price  int  not null check (price >= 0),
  -- شرط الفتح كـ jsonb بنفس شكل نوع Unlock في lib/shop/types.ts.
  -- null = متاح من أول يوم.
  unlock jsonb
);

alter table public.shop_catalog enable row level security;

drop policy if exists "catalog: signed in reads" on public.shop_catalog;
create policy "catalog: signed in reads" on public.shop_catalog
  for select using (auth.uid() is not null);


-- ----------------------------------------------------------------------------
-- ٧) التحقق من شرط الفتح
--
-- بيقرا من الجداول الموجودة أصلاً: profiles (الـ XP والسلسلة)،
-- study_days (عدد الجلسات المخلّصة)، badges (الأوسمة).
--
-- ليه دالة لوحدها؟ عشان الشرط بيتحقق في مكانين: دالة الشرا (إلزامي)،
-- والواجهة (عشان تعرض «فاضلك ٣ أيام»). لو الاتنين كتبوا المنطق لوحدهم
-- كانوا هيفرقوا، والمستخدم يشوف زرار شغّال والدالة ترفضه.
--
-- stable مش volatile: مبتكتبش حاجة، فالمخطّط يقدر يستدعيها مرة واحدة
-- في الاستعلام.
-- ----------------------------------------------------------------------------
create or replace function public.unlock_satisfied(p_uid uuid, p_unlock jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_kind   text := p_unlock ->> 'kind';
  v_xp     int;
  v_streak int;
  v_count  int;
begin
  if p_unlock is null then
    return true;
  end if;

  select coalesce(xp, 0), coalesce(streak, 0) into v_xp, v_streak
    from public.profiles where id = p_uid;

  -- مفيش بروفايل = حساب لسه جديد = مفيش شرط متحقق. مش خطأ: الشروط كلها
  -- بتتطلب إنجاز، وحساب لسه ما بدأش ملوش إنجاز.
  if not found then
    return false;
  end if;

  case v_kind
    when 'streak' then
      return v_streak >= (p_unlock ->> 'days')::int;

    when 'level' then
      -- نفس معادلة levelFromXp في lib/shop/economy.ts (XP_PER_LEVEL = 200).
      -- ⚠️ لو الثابت اتغيّر هناك، لازم يتغيّر هنا. متكرر عن قصد: البديل
      -- إن الدالة تقرا الثابت من جدول، وده جدول بصف واحد عمره كله.
      return (floor(greatest(v_xp, 0) / 200) + 1) >= (p_unlock ->> 'level')::int;

    when 'league' then
      return exists (
        select 1
          from public.shop_leagues req
          join public.shop_leagues cur
            on cur.rank = (
              select max(l.rank) from public.shop_leagues l where v_xp >= l.min_xp
            )
         where req.id = (p_unlock ->> 'league')
           and cur.rank >= req.rank
      );

    when 'sessions' then
      select count(*) into v_count
        from public.study_days
       where user_id = p_uid and is_completed = true;
      return v_count >= (p_unlock ->> 'count')::int;

    when 'badges' then
      -- ⚠️ بالعدد مش بمعرّف وسام: `badges.id` نوعه
      -- `uuid default gen_random_uuid()` (db/pages.sql سطر ١٣٧)، فأي
      -- معرّف مكتوب في الكتالوج مستحيل يطابق صف حقيقي والعنصر كان
      -- هيقعد مقفول للأبد. نفس الحساب بالحرف في `unlockStatus`.
      --
      -- الجدول ممكن يكون مش موجود لو db/pages.sql ما اتشغّلش، ووقتها
      -- الدالة دي بترمي والشرا بيفشل — وده الاتجاه الصح: العنصر
      -- المقفول يفضل مقفول.
      select count(*) into v_count
        from public.badges
       where user_id = p_uid;
      return v_count >= (p_unlock ->> 'count')::int;

    when 'daily' then
      -- العنصر الحصري في المتجر اليومي: مقفول دايماً من هنا. الباب الوحيد
      -- هو الاستثناء المكتوب صريح في purchase_item — مكتوب هنا كمان عشان
      -- اللي بيقرا الدالة يعرف إن الـ false دي مقصودة مش نوع منسي.
      return false;

    else
      -- نوع شرط مش معروف = مقفول. الافتراضي الآمن: لو حد ضاف نوع جديد في
      -- الـ TS ونسي الدالة، العنصر بيقعد مقفول — مش بيتفتح للكل.
      return false;
  end case;
end;
$$;

revoke all on function public.unlock_satisfied(uuid, jsonb) from public;
/* ⚠️⚠️ السطر اللي تحت **مش زيادة على اللي فوقيه** — هو اللي بيشتغل فعلاً.

   `revoke ... from public` بيشيل منحة الـ PUBLIC اللي بوستجرس بيحطّها
   تلقائي على أي دالة جديدة. لكن سوپابيز عاملة كمان
   `alter default privileges ... grant execute on functions to anon,
   authenticated` — ودي **منح مباشرة للدورين**، والسحب من PUBLIC مابيلمسهاش.
   يعني الدالة دي كانت لسه قابلة للنداء من المتصفح رغم التعليق اللي تحت.

   وهي بالذات أخطر واحدة تتنادى: بتاخد `p_uid` بارامتر و`security definer`
   بتتخطّى الـ RLS، فأي حد كان يقدر يبعت معرّف حد تاني ويسأل
   `{"kind":"streak","days":N}` لكل N لحد ما يستنتج سلسلته بالظبط — ونفس
   الحكاية مع الـ XP والأوسمة. تسريب بيانات بالبحث الثنائي.

   مافيش مسار في الكود بينادي عليها من المتصفح أصلاً (`unlockStatus` في
   shop-data.ts دالة TypeScript بتحسب للعرض بس، والحماية الحقيقية جوه
   `purchase_item`). و`purchase_item` بتفضل تشوفها عادي: هي نفسها
   security definer، يعني بتشتغل بصلاحيات المالك مش بصلاحيات اللي نادى. */
revoke all on function public.unlock_satisfied(uuid, jsonb) from anon, authenticated;


-- ----------------------------------------------------------------------------
-- ٨) دالة الشرا — security definer
--
-- **الشرا الوحيد في المشروع: كوينز ← عنصر.** مفيش مسار فلوس حقيقية خالص،
-- ومفيش دالة بتزوّد كوينز مقابل حاجة غير المذاكرة (شوف award_coins).
--
-- الذرّية أهم حاجة هنا: الخصم والتمليك في نفس المعاملة، فلو حصل خطأ بعد
-- الخصم الـ rollback بيرجّع الاتنين. **مستحيل يتخصم من غير ما يتملّك.**
--
-- الترتيب مقصود: أرخص فحص أول، والرصيد آخر حاجة — عشان رسالة «الرصيد مش
-- كفاية» تبان بس لما تكون هي السبب الحقيقي.
-- ----------------------------------------------------------------------------
create or replace function public.purchase_item(p_item_id text)
returns table (spent int, balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid     uuid := auth.uid();
  v_price   int;
  v_unlock  jsonb;
  v_balance int;
  v_disc    int  := 0;
  v_excl    boolean := false;
  v_in_day  boolean := false;
begin
  if v_uid is null then
    raise exception 'purchase_item: لازم تكون داخل بحسابك';
  end if;

  -- السعر من الجدول مش من الكلاينت. لو الكلاينت بعت السعر، أي حد يشتري
  -- أغلى عنصر بكوين واحد من الكونسول.
  select price, unlock into v_price, v_unlock
    from public.shop_catalog where id = p_item_id;

  if not found then
    raise exception 'purchase_item: عنصر مش موجود: %', p_item_id;
  end if;

  if exists (select 1 from public.shop_inventory
              where user_id = v_uid and item_id = p_item_id) then
    raise exception 'purchase_item: العنصر ده معاك بالفعل';
  end if;

  -- الشرط بيتحقق **في السيرفر** مش في الواجهة بس: إخفاء زرار مش حماية.
  --
  -- عرض النهارده بيتقرا هنا لسببين: الخصم، والاستثناء الوحيد لشرط الفتح.
  -- `perform` بيولّد عروض اليوم لو لسه، فمينفعش حد يشتري قبل التوليد
  -- ويلاقي الخصم مش موجود.
  perform public.ensure_daily_shop();

  select d.discount, d.exclusive into v_disc, v_excl
    from public.shop_daily d
   where d.day = (now() at time zone 'utc')::date
     and d.item_id = p_item_id;
  v_in_day := found;

  if not v_in_day then
    v_disc := 0;
    v_excl := false;
  end if;

  if v_unlock is not null and (v_unlock ->> 'kind') = 'daily' then
    /* العنصر الحصري. النوع 'daily' مش معروف لـ unlock_satisfied فبترجّع
       false دايماً — يعني العنصر ده **مقفول قفل دائم** والسطر ده هو
       الاستثناء الوحيد في المشروع كله. مكتوب صريح عشان لو اتشال، العنصر
       يقعد مقفول (فشل آمن) مش يتفتح للكل. */
    if not v_excl then
      raise exception 'purchase_item: العنصر ده بيتباع في المتجر اليومي بس';
    end if;
  elsif v_unlock is not null and not public.unlock_satisfied(v_uid, v_unlock) then
    raise exception 'purchase_item: العنصر لسه مقفول';
  end if;

  -- ⚠️ الخصم بيتحسب **هنا** من صف الجدول — مش بيتبعت من الواجهة. نفس سبب
  -- إن السعر نفسه بيتقرا من shop_catalog: أي رقم جاي من الكلاينت رقم
  -- بيتفاوض عليه.
  if v_disc > 0 then
    v_price := v_price - floor(v_price * v_disc / 100.0)::int;
  end if;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- 🔒 القفل ده بيمنع الشرا المزدوج: طلبين في نفس اللحظة كانوا هيقروا نفس
  -- الرصيد ويخصموا الاتنين (عنصرين بسعر واحد). القفل على صف المحفظة
  -- بيخلّي التاني يستنى الأول، فيقرا الرصيد بعد الخصم.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  if v_balance < v_price then
    raise exception 'purchase_item: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, v_price;
  end if;

  -- المجاني بياخد صف مخزن من غير حركة في السجل: القيد (amount <> 0) بيمنع
  -- حركة بصفر، وكمان سجل مليان أصفار مش سجل.
  if v_price > 0 then
    insert into public.coin_ledger (user_id, source, amount, source_type, ref_id)
    values (v_uid, 'purchase', -v_price, 'spend', p_item_id);
  end if;

  insert into public.shop_inventory (user_id, item_id) values (v_uid, p_item_id);

  return query select v_price, (v_balance - v_price);
end;
$$;

revoke all on function public.purchase_item(text) from public;
grant execute on function public.purchase_item(text) to authenticated;

-- ----------------------------------------------------------------------------
-- ٩) التلبيس والعناصر المجانية
--
-- التلبيس دالة مش delete+insert من المتصفح، لسبب واحد: لو الـ delete نجح
-- والـ insert فشل (الشبكة قطعت في النص)، الخانة تفضل فاضية والمستخدم
-- يلاقي ثيمه اختفى. الدالة بتخلّي الاتنين معاملة واحدة.
--
-- والعناصر المجانية بتتمنح مرة واحدة لكل حساب: من غيرها الحساب الجديد
-- يفتح المتجر ويلاقي كل الخانات فاضية — والملزمة الأصلية نفسها «مش
-- مملوكة» فمش عارف يرجّعها بعد ما يشتري ثيم.
-- ----------------------------------------------------------------------------
create or replace function public.equip_item(p_item_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid  uuid := auth.uid();
  v_slot text;
begin
  if v_uid is null then
    raise exception 'equip_item: لازم تكون داخل بحسابك';
  end if;

  if not exists (select 1 from public.shop_inventory
                  where user_id = v_uid and item_id = p_item_id) then
    raise exception 'equip_item: العنصر ده مش في مخزنك';
  end if;

  select slot into v_slot from public.shop_catalog where id = p_item_id;

  if v_slot is null then
    raise exception 'equip_item: العنصر ده مبيتلبسش';
  end if;

  -- خانة واحدة لكل سلوت: الـ upsert بيستبدل اللي كان ملبوس في نفس المعاملة.
  insert into public.shop_equipped (user_id, slot, item_id, equipped_at)
  values (v_uid, v_slot, p_item_id, now())
  on conflict (user_id, slot)
    do update set item_id = excluded.item_id, equipped_at = now();

  update public.shop_inventory
     set last_equipped_at = now()
   where user_id = v_uid and item_id = p_item_id;

  return v_slot;
end;
$$;

revoke all on function public.equip_item(text) from public;
grant execute on function public.equip_item(text) to authenticated;


-- الخلع: الخانة ترجع للافتراضي المجاني بدل ما تفضل فاضية. الافتراضي مملوك
-- للكل (سعره صفر) فالتلبيس بينجح دايماً.
create or replace function public.unequip_slot(p_slot text)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid     uuid := auth.uid();
  v_default text;
begin
  if v_uid is null then
    raise exception 'unequip_slot: لازم تكون داخل بحسابك';
  end if;

  select id into v_default
    from public.shop_catalog
   where slot = p_slot and price = 0
   order by id
   limit 1;

  delete from public.shop_equipped where user_id = v_uid and slot = p_slot;

  if v_default is not null then
    insert into public.shop_inventory (user_id, item_id) values (v_uid, v_default)
      on conflict (user_id, item_id) do nothing;
    insert into public.shop_equipped (user_id, slot, item_id)
      values (v_uid, p_slot, v_default);
  end if;

  return v_default;
end;
$$;

revoke all on function public.unequip_slot(text) from public;
grant execute on function public.unequip_slot(text) to authenticated;


-- بتتنادى أول مرة المستخدم يفتح المتجر أو المخزن. idempotent، فمفيش ضرر
-- لو اتنادت كل مرة.
create or replace function public.grant_default_items()
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_new int;
begin
  if v_uid is null then
    raise exception 'grant_default_items: لازم تكون داخل بحسابك';
  end if;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  with granted as (
    insert into public.shop_inventory (user_id, item_id)
    select v_uid, c.id from public.shop_catalog c where c.price = 0
    on conflict (user_id, item_id) do nothing
    returning 1
  )
  select count(*)::int into v_new from granted;

  -- ولبّس الافتراضي في أي خانة لسه فاضية — مش بنلمس خانة فيها حاجة.
  insert into public.shop_equipped (user_id, slot, item_id)
  select v_uid, c.slot, min(c.id)
    from public.shop_catalog c
   where c.price = 0 and c.slot is not null
   group by c.slot
  on conflict (user_id, slot) do nothing;

  return v_new;
end;
$$;

revoke all on function public.grant_default_items() from public;
grant execute on function public.grant_default_items() to authenticated;

-- ----------------------------------------------------------------------------
-- ١٠) الصناديق الغامضة
--
-- الصندوق **مش عنصر** — هو عملية. مش في shop_catalog ومش بيتشترى بـ
-- purchase_item، لأنه لو كان عنصر كان هياخد صف في shop_inventory بلا خانة
-- تلبيس، و purchase_item كانت هترفض تاني شراية («معاك بالفعل») لحد ما
-- يتفتح. فجدول لوحده، و open_box بتعمل الدفع والسحب والتمليك في معاملة
-- واحدة.
--
-- ⚠️ **الندرة بقت عمود في الكتالوج.** السحب موزون بالندرة، والوزن لازم
-- يتقرا في السيرفر — لو الكلاينت بعت الندرة أو نتيجة السحب، أي حد يفتح
-- صندوق ورق ويطلّع خرافي. العمود مرآة `rarity` في lib/shop/catalog.ts
-- وبيتولّد مع باقي السييد.
-- ----------------------------------------------------------------------------
alter table public.shop_catalog add column if not exists rarity text;

-- add constraint مش فيها if not exists — الالتفاف القياسي
do $$
begin
  alter table public.shop_catalog add constraint shop_catalog_rarity_chk
    check (rarity is null or rarity in
      ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'));
exception
  when duplicate_object then null;
end
$$;

/* فهرس بركة السحب: نفس شرط الأهلية اللي في open_box بالحرف.

   ⚠️ الشرط ده هو **قلب الأمان في الصناديق**، مش تحسين أداء:
   - `price > 0` بيطلّع العناصر المجانية (اللي كل حساب بياخدها) من البركة،
     وإلا الصندوق بـ ٢٦٠٠ يطلّع حاجة معاك من يوم التسجيل.
   - `unlock is null` بيمنع الصندوق من إنه يبقى **باب خلفي لشرط الفتح**.
     من غيره، عنصر مقفول بسلسلة ٣٠ يوم يطلع من صندوق في اليوم الأول —
     و purchase_item كانت هتفضل بتحرس الباب الأمامي وهي مش عارفة إن فيه
     شباك مفتوح.
   - `slot is not null` بيمنع أي حاجة مش قابلة للتلبيس تتملّك. */
create index if not exists shop_catalog_draw_idx
  on public.shop_catalog (rarity)
  where price > 0 and unlock is null and slot is not null;


-- درجات الصناديق — مرآة BOXES في lib/shop/boxes.ts
create table if not exists public.shop_boxes (
  id    text primary key,
  name  text not null,
  price int  not null check (price > 0),
  -- {"common": 6000, "rare": 1000, ...} — من ١٠٠٠٠. الندرة المش مذكورة
  -- مستحيلة في الصندوق ده.
  odds  jsonb not null,
  ord   int   not null default 0
);

alter table public.shop_boxes enable row level security;

drop policy if exists "boxes: signed in reads" on public.shop_boxes;
create policy "boxes: signed in reads" on public.shop_boxes
  for select using (auth.uid() is not null);


-- تعويض المكرر بالندرة — مرآة REFUND في lib/shop/boxes.ts
create table if not exists public.shop_refunds (
  rarity text primary key check (rarity in
    ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  coins  int not null check (coins > 0)
);

alter table public.shop_refunds enable row level security;

drop policy if exists "refunds: signed in reads" on public.shop_refunds;
create policy "refunds: signed in reads" on public.shop_refunds
  for select using (auth.uid() is not null);

/* ══ دالة الفتح — security definer ══════════════════════════════════════

   بتعمل أربع حاجات في معاملة واحدة: تخصم السعر، تسحب عنصر موزون، تملّكه
   لو جديد، أو ترجّع كوينز لو مكرر. أي خطأ في أي خطوة = rollback للأربعة،
   فمستحيل يتخصم من غير نتيجة.

   ⚠️ **السحب في السيرفر بـ random() السيرفر.** الكلاينت بيبعت معرّف
   الصندوق وبس — مش بيبعت النتيجة ولا الندرة ولا حتى بذرة. لو السحب كان
   في الواجهة والسيرفر بيسجّل بس، أي حد يفتح الكونسول ويقول «طلعلي خرافي».

   ⚠️⚠️ **فحص المضخة سطر ٍبسطر.** قبل أي خصم بنتأكد إن أقصى تعويض ممكن
   في الصندوق ده **أقل** من سعره. القاعدة دي أقوى من «القيمة المتوقعة أقل
   من السعر»: مش «في المتوسط بتخسر» — بل كل فتحة بتخسر لو طلعت مكرر، من
   غير أي حساب احتمالات. ولو حد عدّل رقم تعويض في الـ TS وشغّل السييد
   وكسر القاعدة، الصندوق **بيبطّل يفتح** — مش بيسرّب كوينز بالسكوت. */
create or replace function public.open_box(p_box_id text)
returns table (
  item_id   text,
  rarity    text,
  duplicate boolean,
  refunded  int,
  spent     int,
  balance   int
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid      uuid := auth.uid();
  v_price    int;
  v_odds     jsonb;
  v_max_ref  int;
  v_balance  int;
  v_item     text;
  v_rarity   text;
  v_dup      boolean := false;
  v_refund   int := 0;
  /* ⚠️⚠️ القرعة **لازم** تتحسب في متغير قبل الاستعلام. `random()` دالة
     volatile، يعني لو اتكتبت جوه `where` بتتحسب **من جديد لكل صف** —
     فكل صف بياخد قرعة مستقلة بدل ما يكون فيه رقم واحد بيقع في المجموع
     التراكمي، والاحتمالات الناتجة مالهاش علاقة بالأوزان (الانحياز
     بيروح للصفوف الأول في `order by id`). ده كان باج حقيقي هنا:
     صندوق الورق كانت قيمته المتوقّعة ٣٢١ وسعره ٢٦٠ — **ميل بيت سالب**،
     يعني مضخة كوينز. ومفيش فحص في scripts/shop-seed.mjs يقدر يمسكه،
     لأن السكربت بيحسب رياضيات النية مش سلوك الاستعلام. */
  v_roll     numeric;
begin
  if v_uid is null then
    raise exception 'open_box: لازم تكون داخل بحسابك';
  end if;

  -- الزائر المجهول جلسته role = authenticated زي أي حد، فالتمييز لازم
  -- يبقى من التوكن نفسه. نفس فحص award_coins.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'open_box: الصناديق للحسابات المسجّلة بس';
  end if;

  select price, odds into v_price, v_odds
    from public.shop_boxes where id = p_box_id;

  if not found then
    raise exception 'open_box: صندوق مش موجود: %', p_box_id;
  end if;

  -- 🔒 فحص المضخة. لاحظ إنه **قبل** الخصم: لو الإعدادات غلط، المستخدم
  -- ماينفعش يدفع أصلاً.
  select max(r.coins) into v_max_ref
    from public.shop_refunds r
   where coalesce((v_odds ->> r.rarity)::int, 0) > 0;

  if v_max_ref is not null and v_max_ref >= v_price then
    raise exception
      'open_box: إعدادات الصندوق % غلط — أقصى تعويض % والسعر %. الصندوق مقفول لحد ما يتصلّح.',
      p_box_id, v_max_ref, v_price;
  end if;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- 🔒 نفس قفل purchase_item: طلبين في نفس اللحظة كانوا هيقروا نفس الرصيد
  -- ويفتحوا صندوقين بسعر واحد.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  if v_balance < v_price then
    raise exception 'open_box: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, v_price;
  end if;

  /* السحب: وزن كل **عنصر** = وزن ندرته ÷ عدد عناصر الندرة المؤهّلة.

     يعني الوزن على الندرة مش على العنصر: إضافة عنصر أسطوري جديد بتقلّل
     فرصة كل عنصر أسطوري لوحده وبتسيب فرصة «تطلّع أسطوري» زي ما هي.

     والقسمة دي كمان بتحل مشكلة الندرة الفاضية لوحدها: ندرة بلا عناصر
     مؤهّلة مش بتدخل البركة خالص، فوزنها بيتوزّع على الباقي بالتناسب بدل
     ما السحب يقع في فراغ. */
  v_roll := random();

  with pool as (
    select c.id,
           c.rarity as rar,
           ((v_odds ->> c.rarity)::numeric
             / count(*) over (partition by c.rarity)) as w
      from public.shop_catalog c
     where c.price > 0
       and c.unlock is null
       and c.slot is not null
       and c.rarity is not null
       and coalesce((v_odds ->> c.rarity)::int, 0) > 0
  ),
  cum as (
    select id, rar,
           sum(w) over (order by id rows between unbounded preceding and current row) as upto,
           sum(w) over () as total
      from pool
  )
  select id, rar into v_item, v_rarity
    from cum
   where upto >= v_roll * total
   order by upto
   limit 1;

  if v_item is null then
    raise exception 'open_box: مفيش عناصر مؤهّلة في الصندوق ده دلوقتي';
  end if;

  v_dup := exists (
    select 1 from public.shop_inventory
     where user_id = v_uid and shop_inventory.item_id = v_item
  );

  -- الخصم أول حاجة بعد ما النتيجة بقت معروفة — والتمليك/التعويض بعده في
  -- نفس المعاملة.
  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
  values (v_uid, 'box', -v_price, 'spend', p_box_id,
          jsonb_build_object('item', v_item, 'rarity', v_rarity, 'dup', v_dup));

  if v_dup then
    select coins into v_refund from public.shop_refunds where shop_refunds.rarity = v_rarity;
    v_refund := coalesce(v_refund, 0);

    -- الحزام والحمّالة: الفحص فوق على أقصى تعويض في الصندوق كله، وده على
    -- التعويض الفعلي. لو الاتنين اتخطّوا، المعاملة بترجع كلها.
    if v_refund >= v_price then
      raise exception 'open_box: تعويض % أكبر من سعر الصندوق % — مقفول', v_refund, v_price;
    end if;

    if v_refund > 0 then
      /* ⚠️ التعويض بيتكتب في السجل **مباشرة** مش عن طريق award_coins،
         لأن award_coins مبالغها ثابتة في coin_source_rules والتعويض
         بيختلف بالندرة. ده مقبول هنا وبس هنا: المبلغ جاي من جدول
         shop_refunds في السيرفر، والكلاينت ماله دعوة بيه.

         و`ref_id` بيفضل null عن قصد: الفهرس الفريد على (user_id, source,
         ref_id) بيغطّي صفوف الكسب اللي ليها مرجع، فلو حطّينا معرّف
         الصندوق هنا، تاني مكرر من نفس الصندوق كان هيفشل — والمستخدم يدفع
         ٢٦٠٠ وماياخدش لا عنصر ولا تعويض. */
      insert into public.coin_ledger (user_id, source, amount, source_type, metadata)
      values (v_uid, 'box_refund', v_refund, 'earn',
              jsonb_build_object('box', p_box_id, 'item', v_item, 'rarity', v_rarity));
    end if;
  else
    insert into public.shop_inventory (user_id, item_id) values (v_uid, v_item);
  end if;

  return query select v_item, v_rarity, v_dup, v_refund, v_price,
                      (v_balance - v_price + v_refund);
end;
$$;

revoke all on function public.open_box(text) from public;
grant execute on function public.open_box(text) to authenticated;

-- ----------------------------------------------------------------------------
-- ١١) المتجر اليومي — خصومات + خانة حصرية
--
-- كل يوم (UTC) عروض جديدة: شوية عناصر من الكتالوج بخصم، وعنصر واحد
-- **حصري** مش بيتباع في أي يوم تاني.
--
-- ⚠️ **الخصم بيتحسب جوه purchase_item مش في الواجهة.** الواجهة بتعرض
-- السعر بعد الخصم، بس اللي بيتخصم فعلاً هو اللي الدالة حسبته من الجدول.
-- لو الخصم كان في الواجهة بس، الكارت هيقول ٥٠٠ والمحفظة تدفع ٧٠٠ — أو
-- أسوأ: الكلاينت يبعت الخصم وكل حاجة تبقى بـ ٩٩٪ خصم.
--
-- ⚠️ **العروض متولّدة من بذرة اليوم مش عشوائية.** md5(اليوم || معرّف
-- العنصر) — دالة نقية، فأي حد بيولّد نفس الصفوف بالظبط. عشوائي كان معناه
-- إن أول واحد يفتح المتجر هو اللي بيحدد عروض الكل (سباق)، أو أسوأ: كل
-- واحد يشوف عروض مختلفة ويحس إن اللعبة بتغش.
--
-- ولاحظ إن `on conflict do nothing` كفاية للتزامن **بس لأن** التوليد
-- محدّد: عشرة طلبات في نفس اللحظة بيحاولوا يكتبوا نفس الصفوف بالحرف.
-- ----------------------------------------------------------------------------
create table if not exists public.shop_daily (
  day       date not null,
  item_id   text not null,
  -- نسبة مئوية. الحد الأعلى ٦٠ في القيد نفسه: خصم ٩٩٪ بيبقى عنصر ببلاش.
  discount  int  not null check (discount between 0 and 60),
  -- الحصري: عنصر شرطه {"kind":"daily"} — مقفول في كل يوم غير يومه
  exclusive boolean not null default false,
  sort      int  not null default 0,

  primary key (day, item_id)
);

alter table public.shop_daily enable row level security;

drop policy if exists "daily: signed in reads" on public.shop_daily;
create policy "daily: signed in reads" on public.shop_daily
  for select using (auth.uid() is not null);

-- ⚠️ مفيش سياسة insert/update/delete — التوليد من دالة security definer.
-- سياسة insert هنا كانت معناها إن المستخدم يكتب صف بخصم ٦٠٪ على أغلى
-- عنصر، أو يعلن عنصر حصري في يومه.


/* التوليد. بترجع عدد الصفوف اللي اتضافت (صفر = اليوم متولّد خلاص).

   عدد الخصومات ٤ والحصري ١. الأربعة بتتسحب من نفس بركة أهلية الصناديق
   (`price > 0 and unlock is null and slot is not null`) — عناصر متاحة
   أصلاً، الخصم بيقرّبها بس. */
create or replace function public.ensure_daily_shop()
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if exists (select 1 from public.shop_daily where day = v_day) then
    return 0;
  end if;

  -- الخصومات الأربعة
  with pool as (
    select c.id, md5(v_day::text || ':' || c.id) as h
      from public.shop_catalog c
     where c.price > 0 and c.unlock is null and c.slot is not null
  ),
  pick as (
    select id, h, row_number() over (order by h) as rn
      from pool
     order by h
     limit 4
  )
  insert into public.shop_daily (day, item_id, discount, exclusive, sort)
  select v_day, id,
         -- ١٠٪ لـ ٣٥٪ بخطوة ٥ — من نفس الهاش، فمحدّد ومتنوّع
         10 + (('x' || substr(h, 1, 4))::bit(16)::int % 6) * 5,
         false,
         rn
    from pick
  on conflict (day, item_id) do nothing;

  /* الحصري: من بركة العناصر اللي شرطها {"kind":"daily"}.

     ⚠️ العناصر دي **مقفولة بشكل دائم** بره المتجر اليومي: نوع الشرط
     'daily' مش معروف لـ unlock_satisfied، والدالة افتراضها الآمن إن نوع
     مش معروف = مقفول. يعني الباب الوحيد ليها هو الاستثناء المكتوب صريح
     في purchase_item تحت — ولو حد شال الاستثناء، بتقعد مقفولة، مش
     بتتفتح للكل. */
  insert into public.shop_daily (day, item_id, discount, exclusive, sort)
  select v_day, c.id, 0, true, 0
    from public.shop_catalog c
   where c.unlock ->> 'kind' = 'daily'
   order by md5(v_day::text || '#' || c.id)
   limit 1
  on conflict (day, item_id) do nothing;

  return coalesce((select count(*) from public.shop_daily where day = v_day), 0);
end;
$$;

revoke all on function public.ensure_daily_shop() from public;
grant execute on function public.ensure_daily_shop() to authenticated;


/* عروض النهارده — دي اللي الواجهة بتناديها.

   بتولّد الأول لو لسه، عشان أول زيارة في اليوم متلاقيش متجر فاضي. السعر
   الأصلي والسعر بعد الخصم الاتنين بيرجعوا من السيرفر: الواجهة معندهاش
   حساب خصم خاص بيها تختلف فيه عن purchase_item. */
create or replace function public.shop_daily_today()
returns table (
  item_id   text,
  price     int,
  final     int,
  discount  int,
  exclusive boolean,
  rarity    text,
  slot      text,
  owned     boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then
    raise exception 'shop_daily_today: لازم تكون داخل بحسابك';
  end if;

  perform public.ensure_daily_shop();

  return query
    select d.item_id,
           c.price,
           (c.price - floor(c.price * d.discount / 100.0))::int,
           d.discount,
           d.exclusive,
           c.rarity,
           c.slot,
           exists (select 1 from public.shop_inventory inv
                    where inv.user_id = v_uid and inv.item_id = d.item_id)
      from public.shop_daily d
      join public.shop_catalog c on c.id = d.item_id
     where d.day = v_day
     order by d.exclusive desc, d.sort;
end;
$$;

revoke all on function public.shop_daily_today() from public;
grant execute on function public.shop_daily_today() to authenticated;

-- ----------------------------------------------------------------------------
-- ١٢) عجلة الحظ — لفة واحدة في اليوم
--
-- ⚠️⚠️ **العجلة مكافأة مذاكرة، مش مكافأة دخول.** اللفة مش بتتفتح إلا
-- لما يكون في السجل النهارده كسب من مذاكرة فعلية (`day_done` أو
-- `goal_done`). ده مش تفصيلة تصميم — ده اللي بيخلّي العجلة متكسرش قاعدة
-- المشروع «الكوينز بالمذاكرة بس». عجلة بتلف بمجرد ما تفتح الموقع =
-- مصدر دخل من غير مذاكرة.
--
-- ⚠️ الجايزة مبلغها **بيختلف**، فمقدرش تعدّي على award_coins (مبالغها
-- ثابتة في coin_source_rules). الدالة بتكتب في السجل بنفسها — والمقابل
-- إنها لازم تحمي نفسها بحاجتين: السحب في السيرفر، وحد اللفة اليومي في
-- **فهرس** مش في شرط في الكود.
--
-- ولاحظ إن `wheel` في coin_source_rules سايب `is_live = false` عن قصد،
-- فـ `award_coins('wheel')` لسه بيرمي «المصدر لسه مش شغّال». يعني مفيش
-- طريق تاني للكوينز دي غير الدالة دي.
-- ----------------------------------------------------------------------------
create table if not exists public.shop_wheel_prizes (
  id     text primary key,
  label  text not null,
  coins  int  not null check (coins > 0),
  -- من ١٠٠٠٠ زي أوزان الصناديق
  weight int  not null check (weight > 0),
  ord    int  not null default 0
);

alter table public.shop_wheel_prizes enable row level security;

drop policy if exists "wheel: signed in reads" on public.shop_wheel_prizes;
create policy "wheel: signed in reads" on public.shop_wheel_prizes
  for select using (auth.uid() is not null);


/* حالة العجلة النهارده — للواجهة: تلف ولا لأ، وليه.
   دالة قراءة بس، فمش security definer (الـ RLS بتحصر السجل على صاحبه). */
create or replace function public.wheel_status()
returns table (can_spin boolean, spun boolean, studied boolean, coins int)
language sql
stable
set search_path = public, pg_catalog
as $$
  with today as (select (now() at time zone 'utc')::date as d),
  spun as (
    select amount from public.coin_ledger, today
     where source = 'wheel' and source_type = 'earn' and ref_id = today.d::text
     limit 1
  ),
  studied as (
    select 1 from public.coin_ledger, today
     where source in ('day_done', 'goal_done')
       and source_type = 'earn'
       -- مش `today.d::timestamptz` — ده بيفسّر نص الليل بـ TimeZone الجلسة.
       -- الشرح الكامل عند السقف اليومي في award_coins.
       and created_at >= (today.d::timestamp at time zone 'utc')
     limit 1
  )
  select (not exists (select 1 from spun)) and exists (select 1 from studied),
         exists (select 1 from spun),
         exists (select 1 from studied),
         coalesce((select amount from spun), 0)::int;
$$;

revoke all on function public.wheel_status() from public;
grant execute on function public.wheel_status() to authenticated;


create or replace function public.spin_wheel()
returns table (prize_id text, label text, coins int, balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid   uuid := auth.uid();
  v_day   text := ((now() at time zone 'utc')::date)::text;
  v_id    text;
  v_label text;
  v_coins int;
  /* ⚠️ قرعة واحدة في متغير — نفس السبب المشروح بالتفصيل في `open_box`.
     هنا الباج كان بيرفع القيمة المتوقّعة من ١٨.٥ لـ ٣٦.١ كوين للفة،
     وجايزة الـ١٢٠ كانت بتطلع ١٧.٩٪ بدل ١٪. */
  v_roll  numeric;
begin
  if v_uid is null then
    raise exception 'spin_wheel: لازم تكون داخل بحسابك';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'spin_wheel: العجلة للحسابات المسجّلة بس';
  end if;

  -- 🔒 قفل المحفظة: لفّتين في نفس اللحظة كانوا هيعدّوا الفحص سوا. الفهرس
  -- الفريد تحت بيمسك الحالة دي كمان، بس القفل بيخلّي التانية تستنى
  -- وتطلّع رسالة مفهومة بدل خطأ قيد.
  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  if exists (
    select 1 from public.coin_ledger
     where user_id = v_uid and source = 'wheel'
       and source_type = 'earn' and ref_id = v_day
  ) then
    raise exception 'spin_wheel: لفّيت النهارده خلاص — تعالى بكرة';
  end if;

  -- شرط المذاكرة. مقصود إنه بعد فحص «لفّيت خلاص»: اللي لف بيعرف إنه لف،
  -- مش بيتقاله «ذاكر الأول».
  if not exists (
    select 1 from public.coin_ledger
     where user_id = v_uid
       and source in ('day_done', 'goal_done')
       and source_type = 'earn'
       -- مش `::timestamptz` — الشرح عند السقف اليومي في award_coins. هنا
       -- الغلط كان بيمنع لفة مستحقة: بأوفست سالب مذاكرة أول اليوم بـ UTC
       -- بتقع بره النافذة، فالعجلة تقول «ذاكر الأول» لواحد ذاكر فعلاً.
       and created_at >= (((now() at time zone 'utc')::date)::timestamp
                          at time zone 'utc')
  ) then
    raise exception 'spin_wheel: ذاكر حاجة النهارده الأول — العجلة مكافأة مذاكرة';
  end if;

  -- سحب موزون. نفس فكرة الصناديق: مجموع تراكمي وقرعة واحدة في السيرفر.
  v_roll := random();

  /* ⚠️⚠️ الأعمدة متسمّية `p_*` عن قصد — مش تنميق.

     `returns table (prize_id, label, coins, balance)` بيعرّف الأربعة دول
     **كمتغيّرات** في نطاق جسم الدالة كله. فـ `select id, label, coins`
     على `shop_wheel_prizes` (وفيها عمودين بالاسمين دول) بيرمي وقت
     التشغيل:

         column reference "label" is ambiguous

     ولاحظ إن `id` ماكانش بيشتكي لأن اسم الخروج `prize_id` مش `id` —
     يعني الفخ بيضرب الأعمدة اللي اتفق اسمها بس، وده اللي بيخليه يعدّي
     من المراجعة بالعين.

     نفس السبب اللي خلّى `open_box` تكتب `c.rarity as rar`. القاعدة:
     أي عمود في `returns table` اسمه زي عمود في جدول الاستعلام لازم
     يتغيّر اسمه في الاستعلام. التسمية هنا أأمن من التقييد بـ `cum.label`
     لأنها بتفضل صح لو حد ضاف CTE تاني أو غيّر الأسماء بعدين.

     ⚠️ أسماء الخروج نفسها ممنوع تتغيّر — `lib/shop/shop-data.ts` بيقرا
     `row.prize_id` و`row.label` بالحرف. */
  with cum as (
    select w.id    as p_id,
           w.label as p_label,
           w.coins as p_coins,
           sum(w.weight) over (order by w.id rows between unbounded preceding and current row) as upto,
           sum(w.weight) over () as total
      from public.shop_wheel_prizes w
  )
  select p_id, p_label, p_coins into v_id, v_label, v_coins
    from cum
   where upto >= v_roll * total
   order by upto
   limit 1;

  if v_id is null then
    raise exception 'spin_wheel: مفيش جوايز متسجّلة';
  end if;

  /* الفهرس الفريد على (user_id, source, ref_id) هو الحد الحقيقي: حتى لو
     الفحص فوق اتخطّى بأي طريقة، الصف التاني في نفس اليوم بيفشل. */
  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
  values (v_uid, 'wheel', v_coins, 'earn', v_day, jsonb_build_object('prize', v_id));

  return query
    select v_id, v_label, v_coins,
           coalesce((select sum(amount) from public.coin_ledger where user_id = v_uid), 0)::int;
end;
$$;

revoke all on function public.spin_wheel() from public;
grant execute on function public.spin_wheel() to authenticated;

-- ----------------------------------------------------------------------------
-- ١٣) صفوف السييد — متولّدة، متلمسهاش بالإيد
--
-- كل اللي بين العلامتين دول بيتولّد من lib/shop بـ:
--     node scripts/shop-seed.mjs
-- عدّلت سعر أو مبلغ مصدر في الـ TS؟ شغّل السكريبت وبعده شغّل الملف ده تاني
-- في محرر SQL. التعديل بالإيد هنا معناه إن الـ TS والداتابيز بيقولوا
-- سعرين مختلفين، والداتابيز هي اللي بتفوز — فالمستخدم يشوف سعر ويتخصم منه
-- سعر تاني.
-- ----------------------------------------------------------------------------

-- SEED:BEGIN

-- قواعد مصادر الكسب — من COIN_SOURCES في lib/shop/economy.ts
insert into public.coin_source_rules (id, amount, daily_cap, is_live) values
  ('day_done', 25, 3, true),
  ('goal_done', 10, 5, true),
  ('daily_login', 5, 1, true),
  ('streak_day', 8, 1, true),
  ('badge', 40, 3, true),
  ('perfect_week', 120, 1, true),
  ('escape_room', 60, 1, false),
  ('wheel', 30, 1, false),
  ('league_promo', 200, 1, false)
on conflict (id) do update set
  amount = excluded.amount, daily_cap = excluded.daily_cap, is_live = excluded.is_live;

-- الدوريات — من LEAGUES في lib/shop/economy.ts
insert into public.shop_leagues (id, min_xp, rank) values
  ('wood', 0, 0),
  ('bronze', 400, 1),
  ('silver', 1200, 2),
  ('gold', 2800, 3),
  ('diamond', 6000, 4),
  ('legend', 12000, 5)
on conflict (id) do update set min_xp = excluded.min_xp, rank = excluded.rank;

-- الكتالوج — من CATALOG في lib/shop/catalog.ts (90 عنصر)
insert into public.shop_catalog (id, slot, price, unlock, rarity) values
  ('theme.notebook', 'theme', 0, null, 'common'),
  ('theme.dark-library', 'theme', 900, null, 'epic'),
  ('theme.midnight', 'theme', 1150, null, 'epic'),
  ('theme.retro', 'theme', 1400, null, 'epic'),
  ('theme.cyberpunk', 'theme', 1800, null, 'legendary'),
  ('theme.matrix', 'theme', 2200, '{"kind":"sessions","count":100}'::jsonb, 'legendary'),
  ('theme.galaxy', 'theme', 2600, null, 'legendary'),
  ('theme.ocean-blue', 'theme', 80, null, 'common'),
  ('theme.forest', 'theme', 280, null, 'uncommon'),
  ('theme.coffee-shop', 'theme', 350, null, 'uncommon'),
  ('theme.sunset', 'theme', 200, null, 'uncommon'),
  ('theme.golden', 'theme', 5000, '{"kind":"streak","days":30}'::jsonb, 'mythic'),
  ('theme.minimal', 'theme', 150, null, 'common'),
  ('theme.purple-neon', 'theme', 450, null, 'rare'),
  ('theme.ice-world', 'theme', 580, null, 'rare'),
  ('theme.aurora', 'theme', 700, null, 'rare'),
  ('avatar.owl', 'avatar', 0, null, 'common'),
  ('avatar.cat', 'avatar', 100, null, 'common'),
  ('avatar.fox', 'avatar', 130, null, 'common'),
  ('avatar.bee', 'avatar', 150, null, 'common'),
  ('avatar.turtle', 'avatar', 200, null, 'uncommon'),
  ('avatar.dolphin', 'avatar', 250, null, 'uncommon'),
  ('avatar.panda', 'avatar', 300, null, 'uncommon'),
  ('avatar.wolf', 'avatar', 700, null, 'rare'),
  ('avatar.octopus', 'avatar', 450, null, 'rare'),
  ('avatar.lion', 'avatar', 530, null, 'rare'),
  ('avatar.unicorn', 'avatar', 1230, null, 'epic'),
  ('avatar.dragon', 'avatar', 1400, '{"kind":"badges","count":3}'::jsonb, 'epic'),
  ('avatar.phoenix', 'avatar', 1800, '{"kind":"streak","days":7}'::jsonb, 'legendary'),
  ('avatar.galaxy-brain', 'avatar', 2070, null, 'legendary'),
  ('avatar.crown', 'avatar', 5330, '{"kind":"league","league":"legend"}'::jsonb, 'mythic'),
  ('frame.thin', 'frame', 0, null, 'common'),
  ('frame.dashed', 'frame', 120, null, 'common'),
  ('frame.double', 'frame', 150, null, 'common'),
  ('frame.corners', 'frame', 200, null, 'uncommon'),
  ('frame.notebook', 'frame', 280, null, 'uncommon'),
  ('frame.tape', 'frame', 350, null, 'uncommon'),
  ('frame.stitch', 'frame', 450, null, 'rare'),
  ('frame.glow', 'frame', 580, null, 'rare'),
  ('frame.marker', 'frame', 1400, null, 'epic'),
  ('frame.circuit', 'frame', 900, null, 'epic'),
  ('frame.laurel', 'frame', 2200, '{"kind":"league","league":"diamond"}'::jsonb, 'legendary'),
  ('frame.prism', 'frame', 6000, '{"kind":"badges","count":10}'::jsonb, 'mythic'),
  ('title.beginner', 'title', 0, null, 'common'),
  ('title.curious', 'title', 120, null, 'common'),
  ('title.regular', 'title', 350, null, 'uncommon'),
  ('title.night-owl', 'title', 200, null, 'uncommon'),
  ('title.early-bird', 'title', 280, null, 'uncommon'),
  ('title.marathoner', 'title', 700, null, 'rare'),
  ('title.unbroken', 'title', 450, '{"kind":"streak","days":30}'::jsonb, 'rare'),
  ('title.problem-solver', 'title', 1150, '{"kind":"badges","count":5}'::jsonb, 'epic'),
  ('title.mentor', 'title', 1400, null, 'epic'),
  ('title.knowledge-king', 'title', 1800, '{"kind":"sessions","count":100}'::jsonb, 'legendary'),
  ('title.legend', 'title', 2200, '{"kind":"league","league":"legend"}'::jsonb, 'legendary'),
  ('title.the-one', 'title', 6000, null, 'mythic'),
  ('companion.egg', 'companion', 0, null, 'common'),
  ('companion.cactus', 'companion', 120, null, 'common'),
  ('companion.slime', 'companion', 350, null, 'uncommon'),
  ('companion.robot', 'companion', 200, null, 'uncommon'),
  ('companion.cat', 'companion', 580, null, 'rare'),
  ('companion.bird', 'companion', 700, null, 'rare'),
  ('companion.ghost', 'companion', 900, null, 'epic'),
  ('companion.star', 'companion', 1150, null, 'epic'),
  ('companion.dragon', 'companion', 2600, '{"kind":"level","level":20}'::jsonb, 'legendary'),
  ('companion.void', 'companion', 4000, null, 'mythic'),
  ('sound.lofi', 'sound', 0, null, 'common'),
  ('sound.rain', 'sound', 120, null, 'common'),
  ('sound.waves', 'sound', 150, null, 'common'),
  ('sound.forest', 'sound', 200, null, 'uncommon'),
  ('sound.piano', 'sound', 280, null, 'uncommon'),
  ('sound.white_noise', 'sound', 350, null, 'uncommon'),
  ('sound.brown', 'sound', 450, null, 'rare'),
  ('sound.binaural', 'sound', 580, null, 'rare'),
  ('sound.singing-bowl', 'sound', 1400, null, 'epic'),
  ('sound.deep-space', 'sound', 1800, null, 'legendary'),
  ('effect.pulse', 'effect', 0, null, 'common'),
  ('effect.check', 'effect', 120, null, 'common'),
  ('effect.confetti', 'effect', 350, null, 'uncommon'),
  ('effect.stamp', 'effect', 200, null, 'uncommon'),
  ('effect.highlight', 'effect', 580, null, 'rare'),
  ('effect.stars', 'effect', 700, null, 'rare'),
  ('effect.fireworks', 'effect', 900, null, 'epic'),
  ('effect.page-turn', 'effect', 2200, null, 'legendary'),
  ('effect.supernova', 'effect', 6000, '{"kind":"streak","days":30}'::jsonb, 'mythic'),
  ('avatar.eclipse', 'avatar', 4000, '{"kind":"daily"}'::jsonb, 'mythic'),
  ('avatar.comet', 'avatar', 2200, '{"kind":"daily"}'::jsonb, 'legendary'),
  ('title.chosen', 'title', 6000, '{"kind":"daily"}'::jsonb, 'mythic'),
  ('title.wanderer', 'title', 1800, '{"kind":"daily"}'::jsonb, 'legendary'),
  ('companion.fox', 'companion', 2200, '{"kind":"daily"}'::jsonb, 'legendary'),
  ('companion.moth', 'companion', 6000, '{"kind":"daily"}'::jsonb, 'mythic')
on conflict (id) do update set
  slot = excluded.slot, price = excluded.price, unlock = excluded.unlock,
  rarity = excluded.rarity;

-- الصناديق — من BOXES في lib/shop/boxes.ts (4 درجة)
insert into public.shop_boxes (id, name, price, odds, ord) values
  ('box.paper', 'صندوق ورق', 260, '{"common":6000,"uncommon":3000,"rare":1000}'::jsonb, 0),
  ('box.ink', 'صندوق حبر', 620, '{"uncommon":5500,"rare":3000,"epic":1500}'::jsonb, 1),
  ('box.highlight', 'صندوق فسفوري', 1200, '{"rare":5500,"epic":3000,"legendary":1500}'::jsonb, 2),
  ('box.golden', 'صندوق ذهبي', 2600, '{"epic":5000,"legendary":3500,"mythic":1500}'::jsonb, 3)
on conflict (id) do update set
  name = excluded.name, price = excluded.price,
  odds = excluded.odds, ord = excluded.ord;

delete from public.shop_boxes where id not in (
  'box.paper', 'box.ink', 'box.highlight', 'box.golden'
);

-- تعويض المكرر — من REFUND في lib/shop/boxes.ts
insert into public.shop_refunds (rarity, coins) values
  ('common', 20),
  ('uncommon', 50),
  ('rare', 110),
  ('epic', 220),
  ('legendary', 450),
  ('mythic', 1000)
on conflict (rarity) do update set coins = excluded.coins;

-- جوايز العجلة — من WHEEL_PRIZES في lib/shop/wheel.ts (8 شريحة)
insert into public.shop_wheel_prizes (id, label, coins, weight, ord) values
  ('w.5', '٥ كوين', 5, 2400, 0),
  ('w.40', '٤٠ كوين', 40, 900, 1),
  ('w.10', '١٠ كوين', 10, 2200, 2),
  ('w.60', '٦٠ كوين', 60, 400, 3),
  ('w.15', '١٥ كوين', 15, 1800, 4),
  ('w.120', '١٢٠ كوين', 120, 100, 5),
  ('w.20', '٢٠ كوين', 20, 1400, 6),
  ('w.30', '٣٠ كوين', 30, 800, 7)
on conflict (id) do update set
  label = excluded.label, coins = excluded.coins,
  weight = excluded.weight, ord = excluded.ord;

delete from public.shop_wheel_prizes where id not in (
  'w.5', 'w.40', 'w.10', 'w.60', 'w.15', 'w.120', 'w.20', 'w.30'
);

-- عناصر اتشالت من الكتالوج — بتتشال من الجدول كمان
delete from public.shop_catalog where id not in (
  'theme.notebook', 'theme.dark-library', 'theme.midnight', 'theme.retro', 'theme.cyberpunk', 'theme.matrix', 'theme.galaxy', 'theme.ocean-blue', 'theme.forest', 'theme.coffee-shop', 'theme.sunset', 'theme.golden', 'theme.minimal', 'theme.purple-neon', 'theme.ice-world', 'theme.aurora', 'avatar.owl', 'avatar.cat', 'avatar.fox', 'avatar.bee', 'avatar.turtle', 'avatar.dolphin', 'avatar.panda', 'avatar.wolf', 'avatar.octopus', 'avatar.lion', 'avatar.unicorn', 'avatar.dragon', 'avatar.phoenix', 'avatar.galaxy-brain', 'avatar.crown', 'frame.thin', 'frame.dashed', 'frame.double', 'frame.corners', 'frame.notebook', 'frame.tape', 'frame.stitch', 'frame.glow', 'frame.marker', 'frame.circuit', 'frame.laurel', 'frame.prism', 'title.beginner', 'title.curious', 'title.regular', 'title.night-owl', 'title.early-bird', 'title.marathoner', 'title.unbroken', 'title.problem-solver', 'title.mentor', 'title.knowledge-king', 'title.legend', 'title.the-one', 'companion.egg', 'companion.cactus', 'companion.slime', 'companion.robot', 'companion.cat', 'companion.bird', 'companion.ghost', 'companion.star', 'companion.dragon', 'companion.void', 'sound.lofi', 'sound.rain', 'sound.waves', 'sound.forest', 'sound.piano', 'sound.white_noise', 'sound.brown', 'sound.binaural', 'sound.singing-bowl', 'sound.deep-space', 'effect.pulse', 'effect.check', 'effect.confetti', 'effect.stamp', 'effect.highlight', 'effect.stars', 'effect.fireworks', 'effect.page-turn', 'effect.supernova', 'avatar.eclipse', 'avatar.comet', 'title.chosen', 'title.wanderer', 'companion.fox', 'companion.moth'
);

-- SEED:END


-- ============================================================================
-- تم. لو شغّلت الملف ومافيش أخطاء، الأساس جاهز.
--
-- ── ١) الأعداد ──
--   select count(*) from shop_catalog;        -- المفروض ٩٠
--   select count(*) from coin_source_rules;   -- المفروض ٩
--   select count(*) from shop_leagues;        -- المفروض ٦
--   select count(*) from shop_boxes;          -- المفروض ٤
--   select count(*) from shop_wheel_prizes;   -- المفروض ٨
--   select sum(weight) from shop_wheel_prizes;-- المفروض ١٠٠٠٠ بالظبط
--
-- ── ٢) الكسب والسقف ──
-- ⚠️ الفحوص دي لازم تتشغّل **بجلسة مستخدم حقيقية** (من كونسول المتصفح
--    بـ `supabase.rpc(...)`)، مش من SQL Editor — هناك `auth.uid()` بترجّع
--    null فكل حاجة بتفشل بـ «لازم تكون داخل بحسابك» ومش بتفحص أي منطق.
--
--   select * from award_coins('daily_login'); -- ٥ كوين بعد أول زيارة اليوم
--   select * from award_coins('daily_login'); -- تاني مرة: capped = true
--   select * from award_coins('wheel');       -- المفروض خطأ «لسه مش شغّال»
--
-- ── ٢-ب) التحقق من الحدث — كل واحد فيهم **لازم** يفشل ──
-- دي أهم مجموعة في الملف: بتتأكد إن الكوينز مربوطة بمذاكرة حقيقية.
--
--   select * from award_coins('day_done');
--     -- 'award_coins: day_done محتاج معرّف اليوم'
--   select * from award_coins('day_done', gen_random_uuid()::text);
--     -- 'award_coins: اليوم ده مش مخلّص على حسابك'
--   select * from award_coins('goal_done', gen_random_uuid()::text);
--     -- 'award_coins: الهدف ده مش متعلّم على حسابك'
--   select * from award_coins('badge', 'x:1');
--     -- 'award_coins: مفيش وسام بالمرجع ده على حسابك'
--   select * from award_coins('perfect_week');
--     -- على حساب جديد: 'award_coins: الأسبوع الكامل محتاج ٦ أيام مذاكرة...'
--     -- ⚠️ ده كان بيدّي ١٢٠ كوين لأي حد ينادي، كل يوم.
--
-- والناجح: خلّص درس من الواجهة، وبعدها نفس المعرّف من الكونسول لازم
-- يرجّع `awarded = 0` (الفهرس الفريد) مش ٢٥ تانية.
--
-- ── ٣) تحقق الأمان — كل واحد فيهم **لازم** يفشل ──
-- كل واحد فيهم بيقابل ثغرة اتقفلت. لو **نجح**، فيه سياسة أو صلاحية
-- راجعت لنسخة قديمة — راجع قسم «تلات حاجات لازم تفضل صح» فوق.
--
--   -- (أ) تمليك عنصر من غير دفع
--   insert into shop_inventory (user_id, item_id)
--     values (auth.uid(), 'theme.golden');    -- المفروض: مفيش سياسة insert
--
--   -- (ب) تحويل صف مجاني لأغلى عنصر
--   update shop_inventory set item_id = 'theme.golden'
--    where user_id = auth.uid();              -- المفروض: مفيش صلاحية على العمود
--
--   -- (ج) نفس المرجع مرتين
--   -- ⚠️ الفحص ده اتغيّر: قبل التحقق من الحدث، `award_coins('badge','x')`
--   --    كانت **بتنجح** وبتدفع ٤٠ كوين على مرجع مخترع، والفهرس الفريد
--   --    كان هو الحاجة الوحيدة اللي بتمنع التكرار. دلوقتي المرجع المخترع
--   --    بيترفض من الأول (شوف ٢-ب فوق)، فالفحص لازم يبقى على مرجع حقيقي:
--   select * from award_coins('badge', '<config_id>:<chapter>');
--     -- أول مرة بعد ما تغلب البوس فعلاً: ٤٠ كوين
--   select * from award_coins('badge', '<config_id>:<chapter>');
--     -- تاني مرة: awarded = 0 — الفهرس الفريد، مش عدّاد بيتقرا ويتكتب
--
--   -- (د) الكتابة في الرصيد أو السجل من المتصفح
--   insert into coin_ledger (user_id, source, amount)
--     values (auth.uid(), 'hack', 99999);     -- المفروض: مفيش سياسة insert
--   insert into coin_wallets (user_id) values (auth.uid());
--                                             -- المفروض: قراءة بس
--
--   -- (هـ) قراءة شروط حد تاني بولين ببولين
--   select unlock_satisfied('<uuid حد تاني>', '{"kind":"streak","days":1}');
--                                             -- المفروض: مفيش صلاحية تنفيذ
--
--   -- (هـ-٢) وده الفحص اللي **بيثبت** إن (هـ) هيفضل يفشل. يتشغّل من SQL
--   -- Editor عادي (مش محتاج جلسة). الاتنين لازم يرجّعوا false:
--   select has_function_privilege('authenticated',
--            'public.unlock_satisfied(uuid,jsonb)', 'execute') as auth_can,
--          has_function_privilege('anon',
--            'public.unlock_satisfied(uuid,jsonb)', 'execute') as anon_can;
--     -- ⚠️ لو أي واحد فيهم **true**، يبقى الـ revoke المزدوج اتشال أو
--     --    الدالة اتعمل عليها `create or replace` من غير ما الـ revoke
--     --    يتعاد بعدها — سوپابيز بتمنح الدورين تنفيذ تلقائي على أي دالة
--     --    جديدة، فالمنحة بترجع لوحدها. شغّل السطرين اللي جنب تعريف
--     --    الدالة تاني.
--
--   -- (و) شرا عنصر مقفول من غير تحقيق شرطه
--   select * from purchase_item('frame.prism');
--     -- المفروض: 'purchase_item: العنصر لسه مقفول' (شرطه ١٠ أوسمة)
--
--   -- (ز) شرا حصري المتجر اليومي وهو مش في متجر النهارده
--   select * from purchase_item('title.chosen');
--     -- المفروض: 'purchase_item: العنصر ده بيتباع في المتجر اليومي بس'
--
--   -- (ح) اللفة اليومية
--   select * from spin_wheel();
--     -- على حساب لسه ما ذاكرش النهارده المفروض:
--     --   'spin_wheel: ذاكر حاجة النهارده الأول — العجلة مكافأة مذاكرة'
--     -- وبعد ما تخلّص يوم مذاكرة، اللفة تنجح، والتانية:
--     --   'spin_wheel: لفّيت النهارده خلاص — تعالى بكرة'
--
--   -- (ط) الجايزة بتتقرا من السيرفر مش من الكلاينت
--   select * from shop_wheel_prizes order by weight desc;
--     -- أعلى جايزة (١٢٠) لازم تفضل **أقل** من أرخص صندوق (٢٦٠)، وإلا
--     -- اللفة اليومية بتموّل صندوق كل يوم ببلاش
--
--   -- (ي) الصندوق مش باب خلفي لشرط الفتح
--   select count(*) from shop_catalog where price > 0 and unlock is null
--     and slot is not null and rarity = 'mythic';
--     -- المفروض ٢. لو ٠ أو ١، السحب الخرافي بقى معروف نتيجته مقدّماً —
--     -- شوف الفحص في scripts/shop-seed.mjs
--
--   -- (ك) حدود اليوم مستقلّة عن TimeZone الجلسة
--   -- ده الوحيد اللي بيتشغّل من SQL Editor على طول (مش محتاج جلسة).
--   set time zone 'America/Los_Angeles';
--   select ((now() at time zone 'utc')::date)::timestamptz            as ghalat,
--          ((now() at time zone 'utc')::date)::timestamp
--            at time zone 'utc'                                        as sah;
--   reset time zone;
--     -- `sah` لازم تبقى نص ليل UTC بالظبط، و`ghalat` لازم **تختلف** عنها.
--     -- لو الاتنين طلعوا سوا يبقى الجلسة أصلاً UTC — الفحص مش بيثبت حاجة
--     -- ساعتها، جرّبه بمنطقة تانية. الصيغة الغلط هي اللي كانت في السقف
--     -- اليومي وفي شرط مذاكرة العجلة: بأوفست سالب صفوف أول اليوم بـ UTC
--     -- كانت بتقع بره العدّ، فالسقف يتخطّى واللفة المستحقة تترفض.
--
-- ⚠️ الحاجة الوحيدة اللي **مش** موجودة هنا عن قصد: مفيش أي مسار بيزوّد
--    كوينز مقابل فلوس. مفيش webhook، مفيش جدول مدفوعات، مفيش عمود سعر
--    بعملة. لو حد طلب الميزة دي بعدين، دي مش إضافة — دي مخالفة لقاعدة
--    الملف. الكوينز بالمذاكرة بس.
-- ============================================================================
