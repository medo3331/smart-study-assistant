-- ============================================================================
-- db/121 — مكافآت العبادة بمنطقة المستخدم الزمنية + مصدر أسئلة العبادة
--
-- ١) helpers: worship_user_timezone() / worship_user_day() — المنطقة من
--    profiles.worship_settings->>'timezone' وAfrica/Cairo احتياطي (نفس مصدر
--    الحقيقة اللي worship_daily_summary بتقرأ منه).
-- ٢) award_coins (create or replace على جسم db/113 حرفياً مع):
--    • حارس اليوم المحلي في فروع worship_prayer/quran/adhkar — المرجع لازم
--      يكون يوم المستخدم المحلي الحالي (يقفل إعادة تشغيل مراجع قديمة).
--    • نافذة السقف اليومي لمصادر worship_% بيوم المستخدم المحلي بدل القاهرة.
--    • فرع worship_quiz جديد — الدليل جلسة أسئلة مكتملة (db/120).
--    • worship_quiz مصنّف 'activity' في v_class.
-- ⚠️ الترتيب عند التطبيق: db/120-worship-quiz.sql أولاً (الجدول)، ثم هنا.
-- idempotent — create or replace فقط.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) helpers اليوم المحلي
-- ----------------------------------------------------------------------------

create or replace function public.worship_user_timezone()
returns text
language plpgsql stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_tz text;
begin
  select nullif(p.worship_settings ->> 'timezone', '')
    into v_tz
    from public.profiles p
   where p.id = auth.uid();
  v_tz := coalesce(v_tz, 'Africa/Cairo');
  begin
    perform now() at time zone v_tz; -- تحقق — منطقة غير صالحة ترجع للاحتياطي
    return v_tz;
  exception when invalid_parameter_value then
    return 'Africa/Cairo';
  end;
end;
$$;

create or replace function public.worship_user_day()
returns date
language sql stable
security definer
set search_path = public, pg_catalog
as $$
  select (now() at time zone public.worship_user_timezone())::date;
$$;

revoke all on function public.worship_user_timezone() from public;
revoke all on function public.worship_user_day() from public;
grant execute on function public.worship_user_timezone() to authenticated;
grant execute on function public.worship_user_day() to authenticated;

-- ----------------------------------------------------------------------------
-- ٢) award_coins — النسخة المحدّثة
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
  v_uid        uuid := auth.uid();
  v_amount     int;
  v_cap        int;
  v_live       boolean;
  v_today_cnt  int;
  v_awarded    int := 0;
  v_capped     boolean := false;
  v_ref        text := p_ref_id;
  v_day        text := public.cairo_day()::text;
  v_days       int;
  v_wday       date;
  v_day_start  timestamptz;
  v_wname      text;
  v_class      text;
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

  /* تصنيف مصدر العملة — للتقارير المالية (D-M-06). الفروع الجديدة تُضاف
     هنا؛ الحركات القديمة بتتشتق في view coin_ledger_classified. */
  v_class := case
    when p_source in ('day_done','goal_done','streak_day','streak_tier_3','streak_tier_30',
                      'badge','perfect_week','signup_bonus',
                      'lesson_quiz_passed','review_done','exam_passed') then 'study'
    when p_source in ('break_game','break_riddle','break_riddle_fast','break_quiz',
                      'escape_room','daily_mission','weekly_mission') then 'games'
    when p_source in ('worship_prayer','worship_quran','worship_adhkar','worship_quiz') then 'activity'
    else 'other'
  end;

  /* ⚠️ التحقق إن الحدث حصل فعلاً — الدليل صف حقيقي في جدول تاني مملوك
     للمستخدم. `else` بيرمي مش بيعدّي (قاعدة db/shop.sql رقم ٤). */
  case p_source
    when 'signup_bonus' then
      if not exists (select 1 from public.profiles p where p.id = v_uid) then
        raise exception 'award_coins: لا يوجد ملف شخصي للتسجيل';
      end if;
      v_ref := v_uid::text;

    when 'daily_login' then
      -- دخول نقي: السقف ١/يوم + الفهرس الفريد على يوم القاهرة هما المنع.
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
           and b.config_id::text      = split_part(v_ref, ':', 1)
           and b.chapter_number::text = split_part(v_ref, ':', 2)
      ) then
        raise exception 'award_coins: مفيش وسام بالمرجع ده على حسابك';
      end if;

    when 'perfect_week' then
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

    /* ── مصادر الألعاب — الدليل هو صف الحل/المطالبة نفسه (G0-B) ── */

    when 'break_riddle' then
      if v_ref is null or v_ref !~ '^riddle:\d{4}-\d{2}-\d{2}$' then
        raise exception 'award_coins: break_riddle محتاج مرجع riddle:يوم';
      end if;
      if not exists (
        select 1 from public.break_riddle_sessions s
         where s.user_id = v_uid
           and s.day = public.cairo_day()
           and s.solved_at is not null
      ) then
        raise exception 'award_coins: مفيش فزورة محلولة النهارده على حسابك';
      end if;

    when 'break_riddle_fast' then
      if v_ref is null or v_ref !~ '^riddle:\d{4}-\d{2}-\d{2}$' then
        raise exception 'award_coins: break_riddle_fast محتاج مرجع riddle:يوم';
      end if;
      if not exists (
        select 1 from public.break_riddle_sessions s
         where s.user_id = v_uid
           and s.day = public.cairo_day()
           and s.solved_at is not null
      ) then
        raise exception 'award_coins: مفيش فزورة محلولة النهارده على حسابك';
      end if;

    when 'break_game' then
      if v_ref is null or v_ref !~ '^[a-z]+:\d{4}-\d{2}-\d{2}$' then
        raise exception 'award_coins: break_game محتاج مرجع لعبة:يوم';
      end if;
      if not exists (
        select 1 from public.break_game_claims g
         where g.user_id = v_uid
           and g.day = public.cairo_day()
           and g.game = substr(v_ref, 1, position(':' in v_ref) - 1)
      ) then
        raise exception 'award_coins: مفيش مطالبة لعبة بالمرجع ده على حسابك';
      end if;

    when 'escape_room' then
      if v_ref is null or v_ref !~ '^escape:\d{4}-\d{2}-\d{2}$' then
        raise exception 'award_coins: escape_room محتاج مرجع escape:يوم';
      end if;
      if not exists (
        select 1 from public.escape_sessions s
         where s.user_id = v_uid
           and s.day = public.cairo_day()
           and s.solved_at is not null
      ) then
        raise exception 'award_coins: مفيش غرفة هروب محلولة النهارده على حسابك';
      end if;

    when 'daily_mission' then
      if v_ref is null or v_ref !~ '^mission:[a-z_]+:\d{4}-\d{2}-\d{2}$' then
        raise exception 'award_coins: daily_mission محتاج مرجع mission:نوع:يوم';
      end if;
      if not exists (
        select 1 from public.daily_mission_claims c
         where c.user_id = v_uid
           and c.day = public.cairo_day()
           and c.mission = split_part(v_ref, ':', 2)
      ) then
        raise exception 'award_coins: مفيش مطالبة مهمة بالمرجع ده على حسابك';
      end if;

    when 'weekly_mission' then
      if v_ref is null or v_ref !~ '^weekly:.+$' then
        raise exception 'award_coins: weekly_mission محتاج مرجع week_key';
      end if;
      if not exists (
        select 1 from public.weekly_mission_claims w
         where w.user_id = v_uid
           and w.week_key = substr(v_ref, 8)
      ) then
        raise exception 'award_coins: مفيش مطالبة مهمة أسبوعية بالمرجع ده';
      end if;

    /* ── مصادر العبادة ── */

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
      -- المنطقة الزمنية (db/121): المرجع لازم يكون يوم المستخدم المحلي الحالي
      -- — بيقفل إعادة تشغيل مراجع أيام سابقة لجمع كوينز.
      if v_wday <> public.worship_user_day() then
        raise exception 'award_coins: مكافأة الصلاة ليوم غير يومك المحلي الحالي';
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
      -- المنطقة الزمنية (db/121): نفس حارس اليوم المحلي
      if v_wday <> public.worship_user_day() then
        raise exception 'award_coins: مكافأة القرآن ليوم غير يومك المحلي الحالي';
      end if;
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
      -- المنطقة الزمنية (db/121): نفس حارس اليوم المحلي
      if v_wday <> public.worship_user_day() then
        raise exception 'award_coins: مكافأة الأذكار ليوم غير يومك المحلي الحالي';
      end if;
      if not exists (
        select 1 from public.worship_progress w
         where w.user_id = v_uid
           and w.day = v_wday
           and coalesce((w.adhkar ->> v_wname)::int, 0) > 0
      ) then
        raise exception 'award_coins: الأذكار دي مش متسجّلة على حسابك';
      end if;

    /* ── مصادر DEV-M1: بتتفعل لما يكون فيه إثبات سيرفري للحدث ──
       lesson_quiz_passed: مستني مسار تصحيح سيرفري لكويز الدرس
       (نمط G0 proof). review_done/exam_passed: نطاق الامتحانات محمي
       (D-DEV-02 OUT OF SCOPE) — الربط بيقرر مع فريق الامتحانات. */

    when 'worship_quiz' then
      -- الأسئلة الدينية (db/120/121): الدليل جلسة أسئلة مكتملة مملوكة للمستخدم.
      if v_ref is null
         or v_ref !~ '^quiz:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- قفل صف المحفظة: من غيره طلبان متزامنان يقرآن نفس عدّاد السقف.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  if v_cap is not null then
    /* بداية اليوم (db/121): مصادر العبادة بيوم المستخدم المحلي حسب
       منطقته الزمنية، وباقي المصادر بالقاهرة زي ما هي
       (الصيغة المقصودة في db/43-retention-p0-streak.sql). */
    if p_source like 'worship_%' then
      v_day_start := (public.worship_user_day()::timestamp
                      at time zone public.worship_user_timezone());
    else
      v_day_start := (public.cairo_day()::timestamp
                      at time zone 'Africa/Cairo');
    end if;

    select count(*) into v_today_cnt
      from public.coin_ledger
     where user_id = v_uid
       and source  = p_source
       and source_type = 'earn'
       and created_at >= v_day_start;

    if v_today_cnt >= v_cap then
      v_capped := true;
    end if;
  end if;

  if not v_capped then
    -- on conflict do nothing: الفهرس الفريد (user_id, source, ref_id)
    -- بيرجّع awarded = 0 بدل exception عند التكرار.
    insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
    values (v_uid, p_source, v_amount, 'earn', v_ref, coalesce(p_metadata, '{}'::jsonb), v_class)
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
 then
        raise exception 'award_coins: worship_quiz محتاج مرجع quiz:معرّف-الجلسة';
      end if;
      if not exists (
        select 1 from public.worship_quiz_sessions s
         where s.id = substr(v_ref, 6)::uuid
           and s.user_id = v_uid
           and s.completed_at is not null
      ) then
        raise exception 'award_coins: مفيش جلسة أسئلة مكتملة بالمرجع ده على حسابك';
      end if;

    else
      raise exception 'award_coins: المصدر % شغّال من غير تحقق حدث', p_source;
  end case;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- قفل صف المحفظة: من غيره طلبان متزامنان يقرآن نفس عدّاد السقف.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  if v_cap is not null then
    /* بداية اليوم بالقاهرة في الخطوتين — الصيغة مقصودة بالحرف
       (شرح الفخ كامل في db/43-retention-p0-streak.sql). */
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
    -- on conflict do nothing: الفهرس الفريد (user_id, source, ref_id)
    -- بيرجّع awarded = 0 بدل exception عند التكرار.
    insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
    values (v_uid, p_source, v_amount, 'earn', v_ref, coalesce(p_metadata, '{}'::jsonb), v_class)
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
