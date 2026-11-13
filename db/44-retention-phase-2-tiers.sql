-- ============================================================================
-- Retention Phase 2 — تدرّج مكافآت السلسلة (Streak Reward Tiers)
-- التاريخ: ٢٠٢٦-١١-١٤
--
-- شغّله في Supabase → SQL Editor **بعد** db/43-retention-p0-streak.sql.
-- آمن للتكرار (insert ... on conflict / create or replace). مافيش جداول جديدة.
--
-- الفكرة: السلسلة ما كانتش بتدي غير ٨ كوين في اليوم + ١٢٠ كل ٧ أيام. دلوقتي
-- كل ما الطالب يكمل أكتر، المكافأة تكبر — وكل ما يقرب من محطة، الكارت في
-- الداشبورد بيحسّسه إن فيه حاجة مستنياه:
--
--   كل ٣ أيام  → streak_tier_3   = ١٥ كوين + ١٥ XP
--   كل ٧ أيام  → perfect_week    = ١٢٠ كوين + ٥٠ XP   (المصدر الموجود، اتضاف له XP)
--   كل ٣٠ يوم  → streak_tier_30  = ٢٥٠ كوين + ٢٠٠ XP
--
-- ⚠️ الأرقام دي **مرآة** لـ STREAK_BONUSES في lib/retention/streak-tiers.ts
--    (اللي الواجهة بتقرا منها عشان تقول «فاضل يومين وتاخد ١٥ كوين»). أي تعديل
--    لازم يتعمل في الاتنين، وفيه تست بيتأكد إن الرقمين متطابقين.
--
-- ⚠️ الكوينز بتمر من award_coins (مصدر الحقيقة للمبالغ في coin_source_rules)،
--    والـ XP بيتكتب من `_streak_apply` مباشرة — نفس نمط complete_study_day
--    (تحديث XP داخل دالة security definer). مفيش مسار كلاينت بيلمس الرقمين.
--
-- ⚠️ gate لكل مصدر: `p.streak = N and p.last_study_day = cairo_day()`. يعني
--    حتى لو حد نادى award_coins('streak_tier_30') من الكونسول، لازم يكون
--    واصل ٣٠ يوم فعلاً ومسجّل مذاكرة النهارده. والـ ref = يوم القاهرة، فالفهرس
--    الفريد بيمنع التكرار في نفس اليوم.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) المصادر الجديدة في جدول القواعد (مصدر الحقيقة للمبالغ)
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live)
values
  ('streak_tier_3', 15, 1, true),
  ('streak_tier_30', 250, 1, true)
on conflict (id) do update
  set amount = excluded.amount,
      daily_cap = excluded.daily_cap,
      is_live = excluded.is_live;

-- ----------------------------------------------------------------------------
-- ٢) award_coins — نفس نسخة db/43 + فرعين محطات السلسلة
--    (الشرح الكامل للتحقق والسقوف في db/43-retention-p0-streak.sql)
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
  v_day       text := public.cairo_day()::text;
  v_days      int;
  v_wday      date;
  v_wname     text;
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
    when 'signup_bonus' then
      if not exists (select 1 from public.profiles p where p.id = v_uid) then
        raise exception 'award_coins: لا يوجد ملف شخصي للتسجيل';
      end if;
      v_ref := v_uid::text;

    when 'daily_login' then
      -- حضور نقي: السقف + الفهرس الفريد (user_id, source, يوم القاهرة) بيمنعوا التكرار.
      v_ref := v_day;

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
      -- بيتحقق من السجل نفسه: ٦ أيام مذاكرة على الأقل في آخر ٧ (٦ مش ٧ — الشرح في db/43).
      select count(distinct (l.created_at at time zone 'Africa/Cairo')::date)
        into v_days
        from public.coin_ledger l
       where l.user_id = v_uid
         and l.source in ('day_done', 'goal_done', 'badge')
         and l.source_type = 'earn'
         and l.created_at >= ((public.cairo_day() - 6)::timestamp
                              at time zone 'Africa/Cairo');

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
           and p.last_study_day = public.cairo_day()
           and coalesce(p.streak, 0) >= 2
      ) then
        raise exception 'award_coins: مفيش سلسلة شغّالة النهارده';
      end if;
      v_ref := v_day;

    -- ── محطات السلسلة (Phase 2) ────────────────────────────────────────
    /* الشرط `p.streak = N` بالمساواة مش >= : المحطة بتتصرف لحظة الوصول
       بالظبط، و`_streak_apply` بتناديها بعد ما تكتب الرقم الجديد. لو استخدمنا
       >= كان أي حد واصل ٣٠ يوم يقدر ياخد بونص اليوم الثالث كل يوم. */
    when 'streak_tier_3' then
      if not exists (
        select 1 from public.profiles p
         where p.id = v_uid
           and p.last_study_day = public.cairo_day()
           and coalesce(p.streak, 0) = 3
      ) then
        raise exception 'award_coins: بونص الـ٣ أيام محتاج سلسلة ٣ أيام النهارده';
      end if;
      v_ref := v_day;

    when 'streak_tier_30' then
      if not exists (
        select 1 from public.profiles p
         where p.id = v_uid
           and p.last_study_day = public.cairo_day()
           and coalesce(p.streak, 0) = 30
      ) then
        raise exception 'award_coins: بونص الشهر محتاج سلسلة ٣٠ يوم النهارده';
      end if;
      v_ref := v_day;

    when 'worship_prayer' then
      if v_ref is null or length(v_ref) < 12
         or v_ref !~ '^\d{4}-\d{2}-\d{2}-[a-z]+$' then
        raise exception 'award_coins: worship_prayer محتاج مرجع يوم-وصلاة صالح';
      end if;
      v_wday  := (left(v_ref, 10))::date;
      v_wname := substr(v_ref, 12);
      if v_wname not in ('fajr','dhuhr','asr','maghrib','isha') then
        raise exception 'award_coins: اسم صلاة غير مسموح: %', v_wname;
      end if;
      if not exists (
        select 1 from public.worship_progress w
         where w.user_id = v_uid
           and w.day = v_wday
           and (w.prayers ->> v_wname) = 'true'
      ) then
        raise exception 'award_coins: الصلاة دي مش متسجّلة على حسابك';
      end if;

    when 'worship_quran' then
      if v_ref is null or v_ref !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'award_coins: worship_quran محتاج مرجع تاريخ صالح';
      end if;
      v_wday := v_ref::date;
      if not exists (
        select 1 from public.worship_progress w
         where w.user_id = v_uid
           and w.day = v_wday
           and w.quran_ayahs >= coalesce((
                 select nullif(p.worship_settings ->> 'quran_daily_target', '')::int
                   from public.profiles p
                  where p.id = v_uid
               ), 10)
      ) then
        raise exception 'award_coins: هدف القرآن اليومي مش مكتمل على حسابك';
      end if;

    when 'worship_adhkar' then
      if v_ref is null or length(v_ref) < 12
         or v_ref !~ '^\d{4}-\d{2}-\d{2}-[a-z\-]+$' then
        raise exception 'award_coins: worship_adhkar محتاج مرجع يوم-وتصنيف صالح';
      end if;
      v_wday  := (left(v_ref, 10))::date;
      v_wname := substr(v_ref, 12);
      if v_wname not in ('morning','evening','after-prayer','sleep','general') then
        raise exception 'award_coins: تصنيف أذكار غير معروف: %', v_wname;
      end if;
      if not exists (
        select 1 from public.worship_progress w
         where w.user_id = v_uid
           and w.day = v_wday
           and coalesce((w.adhkar ->> v_wname)::int, 0) > 0
      ) then
        raise exception 'award_coins: الأذكار دي مش متسجّلة على حسابك';
      end if;

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
       and created_at >= (public.cairo_day()::timestamp
                          at time zone 'Africa/Cairo');

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
-- ٣) _streak_apply — نفس المنطق + محطات المكافآت
--    (التوقيع زي ما هو: streak, grew, last_study_day — عشان touch_streak
--     وcomplete_study_day مايحتاجوش إعادة تعريف)
-- ----------------------------------------------------------------------------
create or replace function public._streak_apply(p_uid uuid)
returns table (streak int, grew boolean, last_study_day date)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_today  date := public.cairo_day();
  v_streak int;
  v_last   date;
  v_new    int;
  v_bonus_xp int := 0;
begin
  if p_uid is null then
    raise exception '_streak_apply: p_uid required';
  end if;

  select coalesce(p.streak, 0), p.last_study_day
    into v_streak, v_last
    from public.profiles p
   where p.id = p_uid
   for update;

  if not found then
    raise exception '_streak_apply: profile not found';
  end if;

  if v_last is not null and v_last >= v_today then
    return query select v_streak, false, v_last;
    return;
  end if;

  if v_last is not null and v_last = v_today - 1 then
    v_new := greatest(coalesce(v_streak, 0), 0) + 1;
  else
    v_new := 1;
  end if;

  perform set_config('app.streak_bypass', 'on', true);
  update public.profiles
     set streak = v_new,
         last_study_day = v_today
   where id = p_uid;
  perform set_config('app.streak_bypass', 'off', true);

  /* ── مكافآت اليوم (زي db/43) ── */
  if v_new >= 2 then
    begin
      perform public.award_coins('streak_day', v_today::text);
    exception when others then
      null;
    end;
  end if;

  /* ── محطات السلسلة (Phase 2) ──
     Coins من جدول القواعد عبر award_coins، وXP هنا مباشرة.
     كل حاجة ملفوفة في begin/exception: مصدر لسه مش مهيّأ مايكسرش تسجيل اليوم. */
  if v_new % 3 = 0 then
    begin
      perform public.award_coins('streak_tier_3', v_today::text);
    exception when others then
      null;
    end;
    v_bonus_xp := v_bonus_xp + 15;
  end if;

  if v_new % 7 = 0 then
    begin
      perform public.award_coins('perfect_week', v_today::text);
    exception when others then
      null;
    end;
    v_bonus_xp := v_bonus_xp + 50;
  end if;

  if v_new % 30 = 0 then
    begin
      perform public.award_coins('streak_tier_30', v_today::text);
    exception when others then
      null;
    end;
    v_bonus_xp := v_bonus_xp + 200;
  end if;

  if v_bonus_xp > 0 then
    perform set_config('app.xp_bypass', 'on', true);
    update public.profiles
       set xp = greatest(0, coalesce(xp, 0) + v_bonus_xp)
     where id = p_uid;
    perform set_config('app.xp_bypass', 'off', true);
  end if;

  return query select v_new, true, v_today;
end;
$$;

revoke all on function public._streak_apply(uuid) from public;
revoke all on function public._streak_apply(uuid) from authenticated;

-- ----------------------------------------------------------------------------
-- ٤) الصلاحيات (إعادة تثبيت)
-- ----------------------------------------------------------------------------
grant execute on function public.touch_streak() to authenticated;
