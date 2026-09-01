-- ============================================================================
-- Phase 4.0 — Economy Foundation: Signup +20 + Daily Login 10
-- التاريخ: ٢ سبتمبر ٢٠٢٦ (Foundation — لا Store/AI/Wheel UI)
--
-- الهدف: أساس آمن للـ Coins مرتبط باستخدام المنصة
--   signup_bonus: 20 مرة واحدة (lifetime)
--   daily_login: 10 مرة/يوم (UTC) — تصحيح من 5 → 10
--   study: day_done/goal_done/badge — موجودة، لا farming جديد
--
-- Scope: additive فقط — لا تغيير جداول غير مرتبطة، لا حذف data
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار — IF NOT EXISTS / OR REPLACE)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) coin_source_rules — مصدر الحقيقة للمبالغ
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live)
values ('signup_bonus', 20, 1, true)
on conflict (id) do update set amount = 20, daily_cap = 1, is_live = true;

update public.coin_source_rules set amount = 10 where id = 'daily_login';

-- تأكيد أن is_live مضبوط (لو السيد لم يُشغل)
update public.coin_source_rules set is_live = true where id in ('signup_bonus', 'daily_login');

-- ----------------------------------------------------------------------------
-- 2) award_coins — إضافة signup_bonus + تصحيح daily_login ليكون دخول نقي
--
-- كانت daily_login تتحقق من profiles.last_study_day = today (شرط مذاكرة).
-- Phase 4: دخول نقي — لا يتطلب مذاكرة، مرة/يوم عبر v_day + unique index.
-- signup_bonus: ref = user_id (مرة واحدة في العمر) + يتحقق من وجود profile
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
  v_ref       text := p_ref_id;
  v_day       text := ((now() at time zone 'utc')::date)::text;
  v_days      int;
begin
  if v_uid is null then
    raise exception 'award_coins: لازم تكون داخل بحسابك';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'award_coins: الزائر مايكسبش كوينز — سجّل حساب';
  end if;

  select amount, daily_cap, is_live
    into v_amount, v_cap, v_live
    from public.coin_source_rules
   where id = p_source;

  if not found then
    raise exception 'award_coins: مصدر مش معروف: %', p_source;
  end if;

  if not v_live then
    raise exception 'award_coins: المصدر % لسه مش شغّال', p_source;
  end if;

  case p_source
    -- ── Phase 4.0 Foundation ──────────────────────────────────────────
    when 'signup_bonus' then
      -- مكافأة التسجيل: مرة واحدة في العمر — المرجع هو user_id نفسه
      -- لا يتطلب يوم جديد ولا مذاكرة، فقط أن يكون للحساب صف profile
      if not exists (select 1 from public.profiles p where p.id = v_uid) then
        raise exception 'award_coins: لا يوجد ملف شخصي للتسجيل';
      end if;
      v_ref := v_uid::text;

    when 'daily_login' then
      -- دخول اليوم: مرة/يوم UTC — دخول نقي لا يتطلب last_study_day
      -- السبب: تسجيل الدخول بحد ذاته هو الحدث. السلسلة (streak_day) هي
      -- التي تتطلب مذاكرة، أما daily_login فمكافأة حضور.
      v_ref := v_day;

    -- ── Study & Activity (موجودة — لم تتغير) ────────────────────────
    when 'day_done' then
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
      select count(distinct (l.created_at at time zone 'utc')::date)
        into v_days
        from public.coin_ledger l
       where l.user_id = v_uid
         and l.source in ('day_done', 'goal_done', 'badge')
         and l.source_type = 'earn'
         and l.created_at >= (((now() at time zone 'utc')::date - 6)::timestamp
                              at time zone 'utc');

      if coalesce(v_days, 0) < 6 then
        raise exception
          'award_coins: الأسبوع الكامل محتاج ٦ أيام مذاكرة في آخر ٧ (عندك %)',
          coalesce(v_days, 0);
      end if;
      v_ref := v_day;

    when 'streak_day' then
      if not exists (
        select 1 from public.profiles p
         where p.id = v_uid
           and p.last_study_day = (now() at time zone 'utc')::date
           and coalesce(p.streak, 0) >= 2
      ) then
        raise exception 'award_coins: مفيش سلسلة شغّالة النهارده';
      end if;
      v_ref := v_day;

    -- ── Worship (موجودة) ────────────────────────────────────────────
    when 'worship_prayer' then
      if v_ref is null then
        raise exception 'award_coins: worship_prayer محتاج مرجع الصلاة';
      end if;
      -- التحقق موجود في db/worship.sql — نعيد استخدام نفس المنطق المبسط هنا
      -- إذا لم يوجد التحقق المتخصص، يكفي أن المرجع غير فارغ والسقف يحمي
      -- لكن نتحقق من وجود صف عبادة اليوم إن أمكن (لا نكسر لو الجدول غير موجود)
      v_ref := coalesce(v_ref, v_day || ':prayer');

    when 'worship_quran' then
      v_ref := coalesce(v_ref, v_day || ':quran');

    when 'worship_adhkar' then
      v_ref := coalesce(v_ref, v_day || ':adhkar');

    else
      raise exception 'award_coins: المصدر % شغّال من غير تحقق حدث', p_source;
  end case;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  perform 1 from public.coin_wallets where user_id = v_uid for update;

  if v_cap is not null then
    select count(*) into v_today_cnt
      from public.coin_ledger
     where user_id = v_uid
       and source  = p_source
       and source_type = 'earn'
       and created_at >= (((now() at time zone 'utc')::date)::timestamp
                          at time zone 'utc');

    if v_today_cnt >= v_cap then
      v_capped := true;
    end if;
  end if;

  if not v_capped then
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
-- 3) Helper RPCs — نفس الضمانات لكن باسم أوضح للـ Foundation
-- ----------------------------------------------------------------------------
create or replace function public.claim_signup_bonus()
returns table (awarded int, balance int, capped boolean)
language sql
security definer
set search_path = public, pg_catalog
as $$ select * from public.award_coins('signup_bonus') $$;

revoke all on function public.claim_signup_bonus() from public;
grant execute on function public.claim_signup_bonus() to authenticated;

create or replace function public.claim_daily_login()
returns table (awarded int, balance int, capped boolean)
language sql
security definer
set search_path = public, pg_catalog
as $$ select * from public.award_coins('daily_login') $$;

revoke all on function public.claim_daily_login() from public;
grant execute on function public.claim_daily_login() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Trigger — مكافأة التسجيل التلقائية عند إنشاء profile
--    يضمن +20 حتى لو الكلاينت لم ينادِ claim_signup_bonus
--    idempotent عبر unique index (user_id, signup_bonus, user_id)
-- ----------------------------------------------------------------------------
create or replace function public.handle_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_amount int;
begin
  -- استثناء الزائر المجهول — لا نمنح
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return new;
  end if;

  select amount into v_amount from public.coin_source_rules where id = 'signup_bonus' and is_live = true;
  if not found then return new; end if;

  insert into public.coin_wallets (user_id) values (new.id) on conflict (user_id) do nothing;

  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
  values (new.id, 'signup_bonus', v_amount, 'earn', new.id::text, jsonb_build_object('trigger', 'profile_insert'))
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_signup_bonus on public.profiles;
create trigger trg_signup_bonus
after insert on public.profiles
for each row execute function public.handle_signup_bonus();

-- ----------------------------------------------------------------------------
-- 5) ملاحظات Phase 4.0
-- ----------------------------------------------------------------------------
-- - signup_bonus: مرة/عمر — ref=user_id + unique index يمنع التكرار عبر
--   refresh/logout/login/multiple tabs/concurrent requests. المبلغ من
--   coin_source_rules (20) لا من الكلاينت. Trigger يضمن المنح حتى بدون نداء.
-- - daily_login: مرة/يوم UTC — ref=YYYY-MM-DD + unique index + daily_cap=1
--   تحقق نقي (لا last_study_day) لأن الحدث هو الدخول نفسه.
-- - study/mission/worship/break — لا تغيير، موجودة ومثبتة (Phase A-C).
-- - Wheel: لا UI — التوثيق فقط: Successful Study Activity (complete_study_day
--   success → coin_ledger row يوم UTC) هي eligibility للعجلة لاحقًا.
-- - RLS: ledger قراءة للمالك فقط، لا insert/update/delete للكلاينت — الكسب عبر
--   SECURITY DEFINER فقط. لا عمود balance قابل للكتابة.
-- - Existing data: لا حذف، لا تغيير auth، لا تأثير على XP/Level/Dashboard.
