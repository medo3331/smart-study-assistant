-- ============================================================================
-- Retention Phase 3 — إنجازات محفوظة + عائد مذاكرة أعلى + مهمة أسبوعية
-- التاريخ: ٢٠٢٦-١١-١٤
--
-- شغّله في Supabase → SQL Editor بعد db/44-retention-phase-2-tiers.sql.
-- آمن للتكرار (if not exists / on conflict / create or replace).
--
-- اللي بيعمله الملف:
--   ١) إنجازات محفوظة: جدول كتالوج + جدول ملكية + RPC `sync_achievements`
--      بيتحقق من الشروط على السيرفر، بيحفظ الإنجاز مرة واحدة، وبيمنح كوينز/XP.
--   ٢) أرضية عائد المذاكرة: المرحلة بقت ١٥٠ XP (كانت ١٠٠) — بقت أعلى من أي
--      نشاط جانبي (كويز المجتمع ١٥٠/يوم، البريك ٤٠، المهام ٤٠).
--   ٣) مهمة أسبوعية واحدة: «٥ مراحل + ٣ أيام مذاكرة» بمكافأة كبيرة.
--
-- ⚠️ ليه الإنجازات مش في `badges`: جدول `badges` مالِك BossFight (صف لكل
--    فصل/تراك). دي إنجازات حسابية (مراحل/سلسلة/مستوى/تراك كامل) مالهاش
--    صف مصدر في أي جدول تاني، فمحتاجة جدولها. المكافأة بتتكتب في
--    `coin_ledger` بمصدر `achievement` — نفس نمط `claim_daily_mission`
--    و`answer_break_riddle` (دالة security definer متحققة بتكتب سجلها بنفسها).
--
-- ⚠️ idempotency: المفتاح الأساسي (user_id, achievement_id) بيمنع الاستلام
--    التاني، والفهرس الفريد (user_id, source, ref_id) في coin_ledger بيمنع
--    مضاعفة الكوينز حتى لو حصل سباق بين تابّين.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) كتالوج الإنجازات + ملكية المستخدم
-- ----------------------------------------------------------------------------
create table if not exists public.achievements_catalog (
  id          text primary key,
  icon        text not null,
  title       text not null,
  requirement text not null,
  /** إيه الرقم اللي بيتقاس: days_done | streak | level | badges | courses */
  kind        text not null check (kind in ('days_done','streak','level','badges','courses')),
  target      int  not null check (target > 0),
  coins       int  not null default 0 check (coins >= 0),
  xp          int  not null default 0 check (xp >= 0),
  sort_order  int  not null default 100
);

alter table public.achievements_catalog enable row level security;
drop policy if exists "achievement catalog: everyone reads" on public.achievements_catalog;
create policy "achievement catalog: everyone reads"
  on public.achievements_catalog for select
  to anon, authenticated
  using (true);

insert into public.achievements_catalog (id, icon, title, requirement, kind, target, coins, xp, sort_order)
values
  ('first-step',   '🌱', 'أول خطوة',        'خلّص أول مرحلة',            'days_done', 1,  30,  50, 10),
  ('ten-steps',    '📗', 'عشرة ورا بعض',    'خلّص ١٠ مراحل',             'days_done', 10, 80, 150, 20),
  ('fifty-steps',  '📚', 'نص كتاب',          'خلّص ٥٠ مرحلة',             'days_done', 50, 200, 400, 30),
  ('week-streak',  '🔥', 'أسبوع كامل',       'ذاكر ٧ أيام ورا بعض',       'streak',    7,  60, 100, 40),
  ('month-streak', '⚡', 'شهر ما فاتكش',     'ذاكر ٣٠ يوم ورا بعض',       'streak',    30, 250, 500, 50),
  ('level-five',   '⭐', 'المستوى الخامس',   'اوصل للمستوى ٥',            'level',     5, 100,   0, 60),
  ('first-boss',   '🐉', 'أول بوس',          'اكسب أول وسام',             'badges',    1, 120, 150, 70),
  ('first-course', '🎓', 'تراك كامل',        'خلّص تراك من أوله لآخره',   'courses',   1, 300, 300, 80)
on conflict (id) do update
  set icon = excluded.icon,
      title = excluded.title,
      requirement = excluded.requirement,
      kind = excluded.kind,
      target = excluded.target,
      coins = excluded.coins,
      xp = excluded.xp,
      sort_order = excluded.sort_order;

create table if not exists public.user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements_catalog(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  coins          int not null default 0,
  xp             int not null default 0,
  primary key (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;
drop policy if exists "user achievements: owner reads" on public.user_achievements;
create policy "user achievements: owner reads"
  on public.user_achievements for select
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- ٢) تسجيل مصدر الكوينز (للوحة الأدمن وصفحة المكافآت)
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live)
values
  ('achievement', 30, 5, true),
  ('weekly_mission', 150, 1, true)
on conflict (id) do update
  set amount = excluded.amount,
      daily_cap = excluded.daily_cap,
      is_live = excluded.is_live;

-- ----------------------------------------------------------------------------
-- ٣) sync_achievements — يفتح اللي استحقّه، يحفظه، ويمنح مكافآته
-- ----------------------------------------------------------------------------
create or replace function public.sync_achievements()
returns table (
  achievement_id text,
  icon           text,
  title          text,
  requirement    text,
  target         int,
  progress       int,
  coins          int,
  xp             int,
  unlocked       boolean,
  unlocked_at    timestamptz,
  newly          boolean,
  sort_order     int
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid      uuid := auth.uid();
  v_days     int := 0;
  v_streak   int := 0;
  v_level    int := 1;
  v_badges   int := 0;
  v_courses  int := 0;
  v_new      text[] := '{}';
  v_row      public.achievements_catalog%rowtype;
  v_progress int;
begin
  if v_uid is null then
    raise exception 'sync_achievements: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sync_achievements: سجّل حساب دائم الأول';
  end if;

  -- الأرقام اللي الإنجازات بتقيس عليها — كلها من الداتابيز، مش من الكلاينت.
  select count(*) into v_days
    from public.study_days
   where user_id = v_uid and is_completed = true;

  select coalesce(streak, 0), (floor(greatest(coalesce(xp, 0), 0) / 200)::int + 1)
    into v_streak, v_level
    from public.profiles
   where id = v_uid;

  if not found then
    raise exception 'sync_achievements: profile not found';
  end if;

  select count(*) into v_badges
    from public.badges
   where user_id = v_uid;

  -- تراك كامل = كل مراحله مكتملة (نفس تعريف الواجهة: totalDays > 0 && completed >= total).
  select count(*) into v_courses
    from (
      select c.id
        from public.study_configs c
        join public.study_days d
          on d.config_id = c.id and d.user_id = c.user_id
       where c.user_id = v_uid
       group by c.id
      having count(*) > 0
         and count(*) filter (where d.is_completed) >= count(*)
    ) finished;

  for v_row in select * from public.achievements_catalog order by sort_order loop
    v_progress := case v_row.kind
      when 'days_done' then v_days
      when 'streak'    then v_streak
      when 'level'     then v_level
      when 'badges'    then v_badges
      when 'courses'   then v_courses
      else 0
    end;

    if v_progress < v_row.target then
      continue;
    end if;

    insert into public.user_achievements (user_id, achievement_id, coins, xp)
    values (v_uid, v_row.id, v_row.coins, v_row.xp)
    on conflict (user_id, achievement_id) do nothing;

    -- مفتاح الإنجاز لسه ما كانش موجود ⇒ ده أول مرة ⇒ استحق المكافأة.
    if found then
      v_new := array_append(v_new, v_row.id);

      if v_row.coins > 0 then
        /* المرجع مركّب من معرّف الإنجاز — الفهرس الفريد (user_id, source, ref_id)
           بيضمن إن الكوينز ما تتكررش حتى لو الدالة اتنادت في نفس اللحظة من
           تابّين. السقف اليومي مش مستخدم هنا لأن الإنجاز بيحصل مرة/حياة. */
        insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
        values (
          v_uid,
          'achievement',
          v_row.coins,
          'earn',
          'achievement:' || v_row.id,
          jsonb_build_object('achievement', v_row.id)
        )
        on conflict do nothing;
      end if;

      if v_row.xp > 0 then
        perform set_config('app.xp_bypass', 'on', true);
        update public.profiles
           set xp = greatest(0, coalesce(xp, 0) + v_row.xp)
         where id = v_uid;
        perform set_config('app.xp_bypass', 'off', true);
      end if;
    end if;
  end loop;

  return query
    select c.id,
           c.icon,
           c.title,
           c.requirement,
           c.target,
           (case c.kind
              when 'days_done' then v_days
              when 'streak'    then v_streak
              when 'level'     then v_level
              when 'badges'    then v_badges
              when 'courses'   then v_courses
              else 0
            end) as progress,
           c.coins,
           c.xp,
           (ua.user_id is not null) as unlocked,
           ua.unlocked_at,
           (c.id = any(v_new)) as newly,
           c.sort_order
      from public.achievements_catalog c
      left join public.user_achievements ua
        on ua.user_id = v_uid and ua.achievement_id = c.id
     order by c.sort_order;
end;
$$;

revoke all on function public.sync_achievements() from public;
grant execute on function public.sync_achievements() to authenticated;

-- ----------------------------------------------------------------------------
-- ٤) المهمة الأسبوعية
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_mission_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_key   text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week_key)
);

alter table public.weekly_mission_claims enable row level security;
drop policy if exists "weekly mission: owner reads" on public.weekly_mission_claims;
create policy "weekly mission: owner reads"
  on public.weekly_mission_claims for select
  using (auth.uid() = user_id);

/* مفتاح الأسبوع = نفس `public.current_quiz_week()` (أحد الأسبوع بتوقيت القاهرة)
   عشان «الأسبوع» يبقى تعريف واحد في المنتج كله — نفس أسبوع لوحة المتصدرين. */
create or replace function public.weekly_missions()
returns table (
  id           text,
  label        text,
  week_key     text,
  steps_target int,
  days_target  int,
  steps_done   int,
  days_done    int,
  done         boolean,
  claimed      boolean,
  coins        int,
  xp           int,
  ends_on      date
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid    uuid := auth.uid();
  v_week   text := public.current_quiz_week();
  v_start  date := public.current_quiz_week()::date;
  v_ends   date := (public.current_quiz_week()::date + 6);
  v_steps  int := 0;
  v_days   int := 0;
  c_steps  constant int := 5;
  c_days   constant int := 3;
  c_coins  constant int := 150;
  c_xp     constant int := 120;
begin
  if v_uid is null then
    raise exception 'weekly_missions: لازم تكون داخل بحسابك';
  end if;

  select count(*) into v_steps
    from public.coin_ledger l
   where l.user_id = v_uid
     and l.source = 'day_done'
     and l.source_type = 'earn'
     and l.created_at >= (v_start::timestamp at time zone 'Africa/Cairo')
     and l.created_at <  ((v_start + 7)::timestamp at time zone 'Africa/Cairo');

  select count(distinct (l.created_at at time zone 'Africa/Cairo')::date) into v_days
    from public.coin_ledger l
   where l.user_id = v_uid
     and l.source in ('day_done', 'goal_done')
     and l.source_type = 'earn'
     and l.created_at >= (v_start::timestamp at time zone 'Africa/Cairo')
     and l.created_at <  ((v_start + 7)::timestamp at time zone 'Africa/Cairo');

  return query
  select 'weekly'::text,
         'أكمل ٥ مراحل وذاكر ٣ أيام'::text,
         v_week,
         c_steps,
         c_days,
         v_steps,
         v_days,
         (v_steps >= c_steps and v_days >= c_days),
         exists (
           select 1 from public.weekly_mission_claims w
            where w.user_id = v_uid and w.week_key = v_week
         ),
         c_coins,
         c_xp,
         v_ends;
end;
$$;

revoke all on function public.weekly_missions() from public;
grant execute on function public.weekly_missions() to authenticated;

create or replace function public.claim_weekly_mission()
returns table (coins int, xp int, message text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid   uuid := auth.uid();
  v_week  text := public.current_quiz_week();
  v_done  boolean;
  v_coins int;
  v_xp    int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'claim_weekly_mission: سجّل حساب دائم أولًا';
  end if;

  select wm.done, wm.coins, wm.xp into v_done, v_coins, v_xp
    from public.weekly_missions() wm
   where wm.id = 'weekly';

  if not found then
    raise exception 'claim_weekly_mission: مفيش مهمة أسبوعية';
  end if;
  if not v_done then
    return query select 0, 0, 'لسه ما كمّلتش شروط مهمة الأسبوع';
  end if;

  insert into public.weekly_mission_claims (user_id, week_key)
  values (v_uid, v_week)
  on conflict do nothing;

  if not found then
    return query select 0, 0, 'استلمت مكافأة الأسبوع ده بالفعل';
  end if;

  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
  values (
    v_uid,
    'weekly_mission',
    v_coins,
    'earn',
    'weekly:' || v_week,
    jsonb_build_object('week', v_week)
  )
  on conflict do nothing;

  perform set_config('app.xp_bypass', 'on', true);
  update public.profiles
     set xp = greatest(0, coalesce(xp, 0) + v_xp)
   where id = v_uid;
  perform set_config('app.xp_bypass', 'off', true);

  return query select v_coins, v_xp, 'مبروك! مهمة الأسبوع خلصت 🎉';
end;
$$;

revoke all on function public.claim_weekly_mission() from public;
grant execute on function public.claim_weekly_mission() to authenticated;

-- ----------------------------------------------------------------------------
-- ٥) أرضية عائد المذاكرة — ١٥٠ XP للمرحلة
--
-- ليه trigger مش تعديل الدوال: XP المرحلة بيتحدد في أكتر من مكان (دالة بناء
-- المنهج، دالة التوسيع، توليد الواجهة، إدخال يدوي). تعديل كل واحد فيهم
-- معناه نسخة تالتة من دوال طويلة، وأي مسار جديد ينسى الرقم يرجّعنا لنفس
-- المشكلة. الـ trigger بيضمن الأرضية لكل صف جديد أو متعدّل، والـ UPDATE
-- بيرفع الصفوف القديمة.
-- ----------------------------------------------------------------------------
update public.study_days
   set xp_reward = 150
 where coalesce(xp_reward, 0) < 150;

alter table public.study_days alter column xp_reward set default 150;

create or replace function public.normalize_study_day_xp()
returns trigger
language plpgsql
as $$
begin
  /* أرضية ١٥٠: المذاكرة لازم تكون أعلى عائد. الرقم الأعلى مقبول (خطة قديمة
     خصّصت أكثر)، الأقل بيترفع. مفيش سقف هنا — السقف في complete_study_day
     (٥٠٠) عشان أي قيمة شاذة تتلقط هناك. */
  if new.xp_reward is null or new.xp_reward < 150 then
    new.xp_reward := 150;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_study_day_xp on public.study_days;
create trigger trg_normalize_study_day_xp
before insert or update on public.study_days
for each row execute function public.normalize_study_day_xp();
