-- ============================================================================
-- Retention P0 — السلسلة بقت سيرفر-أوثوريتاتيف + يوم واحد للكل: Africa/Cairo
-- التاريخ: ٢٠٢٦-١١-١٣
--
-- شغّله في Supabase → SQL Editor. آمن للتكرار (create or replace / drop trigger
-- if exists). مافيش جداول جديدة ولا أعمدة جديدة.
--
-- ليه:
--   ١) السلسلة كانت بتزيد لما الطالب **يفتح الداشبورد** (الكلاينت بيكتب
--      profiles.streak + last_study_day). ده خلّى وسام «ذاكر ٧ أيام» كذبة،
--      وخلّى السلاسل قابلة للتزوير من الكونسول، وربط كوينز streak_day
--      بزيارة صفحة مش بمذاكرة.
--   ٢) كان في **يومين** في نفس المنتج: السلسلة/المهام/البريك بـ UTC والكويز
--      بـ Africa/Cairo. طالب بيذاكر ١٢:٣٠ بالليل كان ممكن يخسر سلسلته أو
--      ما ياخدش كوينز اليوم.
--
-- اللي بيعمله الملف:
--   • public.cairo_day()      — تعريف واحد لليوم (القاهرة) تستخدمه الدوال كلها.
--   • public._streak_apply()  — داخلية: بتحسب وتكتب السلسلة (idempotent/يوم).
--   • public.touch_streak()   — RPC للطالب: بترفض لو مفيش مذاكرة حقيقية النهارده.
--   • complete_study_day()    — بقت بتنادي _streak_apply بعد ما اليوم يخلص.
--   • award_coins() + المهام + البريك + غرفة الهروب — كل مقارنات اليوم بـ Cairo،
--     وdaily_login بقى حضور نقي (المرجع = يوم القاهرة).
--   • trigger protect_profiles_streak — الكلاينت ممنوع يكتب streak/last_study_day
--     (نفس نمط protect_profiles_xp في db/economy-phase-b.sql).
--
-- ⚠️ مش بنستخدم revoke/grant على عمود: profiles عليها grant على مستوى
--    الجدول من Supabase، وسحب عمود واحد مابيسقطش الـ grant العام. الـ trigger
--    هو الحاجز اللي بيشتغل فعلاً، وهو نفس الحل المعتمد للـ XP.
--
-- ⚠️ award_coins هنا مبني على نسخة db/worship.sql (اللي فيها تحقق مصادر
--    العبادة الحقيقي) + فرع signup_bonus من db/economy-phase-4-foundation.sql،
--    لأن النسختين اتفرّقتوا. أي تعديل جاي على award_coins لازم يبدأ من هنا.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ٠) تعريف اليوم
-- ----------------------------------------------------------------------------
create or replace function public.cairo_day()
returns date
language sql
stable
set search_path = pg_catalog
as $$ select (now() at time zone 'Africa/Cairo')::date $$;

revoke all on function public.cairo_day() from public;
grant execute on function public.cairo_day() to authenticated, anon;

-- ----------------------------------------------------------------------------
-- ١) محرّك السلسلة (داخلي — مفيش grant للكلاينت)
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

  -- اتسجّل النهارده خلاص (أو تاريخ مستقبلي — بنتجاهله بدل ما نكسر السلسلة)
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

  /* مكافآت السلسلة عبر نفس مصدر الكوينز (السقف + الفهرس الفريد في
     award_coins). أي فشل هنا (مصدر لسه مش مهيّأ) مايكسرش تسجيل اليوم. */
  if v_new >= 2 then
    begin
      perform public.award_coins('streak_day', v_today::text);
    exception when others then
      null;
    end;
  end if;

  if v_new % 7 = 0 then
    begin
      perform public.award_coins('perfect_week', v_today::text);
    exception when others then
      null;
    end;
  end if;

  return query select v_new, true, v_today;
end;
$$;

revoke all on function public._streak_apply(uuid) from public;
revoke all on function public._streak_apply(uuid) from authenticated;

-- ----------------------------------------------------------------------------
-- ٢) RPC الطالب — بترفض لو مفيش مذاكرة حقيقية النهارده
-- ----------------------------------------------------------------------------
create or replace function public.touch_streak()
returns table (streak int, grew boolean, last_study_day date)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid   uuid := auth.uid();
  v_proof boolean;
begin
  if v_uid is null then
    raise exception 'touch_streak: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'touch_streak: سجّل حساب دائم الأول';
  end if;

  /* الدليل: صف day_done في السجل النهارده (بتوقيت القاهرة). الصف ده
     الداتابيز هي اللي كتبته بعد ما complete_study_day تحققت من ملكية
     اليوم وإنه اتعلّم مكتمل — يعني مفيش طريقة الكلاينت يزوّره. */
  select exists (
    select 1
      from public.coin_ledger l
     where l.user_id = v_uid
       and l.source = 'day_done'
       and l.source_type = 'earn'
       and l.created_at >= (public.cairo_day()::timestamp at time zone 'Africa/Cairo')
  ) into v_proof;

  if not v_proof then
    raise exception 'touch_streak: مفيش مرحلة مذاكرة مكتملة النهارده';
  end if;

  return query select * from public._streak_apply(v_uid);
end;
$$;

revoke all on function public.touch_streak() from public;
grant execute on function public.touch_streak() to authenticated;

-- ----------------------------------------------------------------------------
-- ٣) award_coins — يوم القاهرة + daily_login حضور نقي
--    (الأساس: db/worship.sql + فرع signup_bonus من Phase 4.0)
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
  /* يوم المستخدم بتوقيت القاهرة — نفس تعريف اليوم في السلسلة والمهام
     والبريك. مصدره now() على السيرفر، فساعة المتصفح مالهاش دخل. */
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

  /* التحقق من الحدث الفعلي — الدليل صف حقيقي في جدول تاني مملوك للمستخدم،
     مش كلام الكونسول. */
  case p_source
    -- ── Phase 4.0 Foundation: مكافأة التسجيل (مرة/عمر) ────────────────
    when 'signup_bonus' then
      if not exists (select 1 from public.profiles p where p.id = v_uid) then
        raise exception 'award_coins: لا يوجد ملف شخصي للتسجيل';
      end if;
      v_ref := v_uid::text;

    when 'daily_login' then
      /* دخول نقي: الحدث هو الحضور نفسه. السقف (١/يوم) والفهرس الفريد
         (user_id, source, ref_id = يوم القاهرة) هما اللي بيمنعوا التكرار.
         شرط last_study_day اتشال: بقى معناه «ذاكرت»، وده شغل streak_day. */
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
      /* بيتحقق من السجل نفسه مش من profiles.streak: coin_ledger مالوش
         سياسة insert خالص، فكل صف day_done/goal_done/badge جواه معناه
         يوم مذاكرة حقيقي. ⚠️ ٦ مش ٧: النداء بيحصل لحظة ما السلسلة توصل ٧،
         ويوم السلسلة السابع لسه ما اتسجّلش كمذاكرة في اللحظة دي. */
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
      /* السلسلة بقت سيرفر-أوثوريتاتيف: _streak_apply هي الوحيدة اللي
         بتكتب profiles.streak/last_study_day، وtrigger
         protect_profiles_streak بيمنع الكلاينت. الشرط هنا بيتأكد إن فيه
         مذاكرة حقيقية النهارده (بتوقيت القاهرة) وإن السلسلة شغّالة. */
      if not exists (
        select 1 from public.profiles p
         where p.id = v_uid
           and p.last_study_day = public.cairo_day()
           and coalesce(p.streak, 0) >= 2
      ) then
        raise exception 'award_coins: مفيش سلسلة شغّالة النهارده';
      end if;
      v_ref := v_day;

    /* ── مصادر العبادة الثلاثة ── */

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

  -- قفل صف المحفظة: من غيره طلبين متزامنين يعدّوا نفس السقف.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  if v_cap is not null then
    select count(*) into v_today_cnt
      from public.coin_ledger
     where user_id = v_uid
       and source  = p_source
       and source_type = 'earn'
       /* ⚠️ بداية اليوم لازم تتحسب بـ Cairo في **الخطوتين**، والصيغة دي
          مقصودة بالحرف:
            date_trunc('day', now())                 ← بيقطع بـ TimeZone الجلسة
            (cairo_day())::timestamptz               ← التاريخ صح والساعة غلط
            (cairo_day())::timestamp at time zone 'Africa/Cairo'  ← ✔
          التانية هي الفخ: date::timestamptz بيفسّر نص الليل بـ TimeZone
          الجلسة مش بالقاهرة. والتالتة بتعمله نص ليل بلا منطقة وتفسّره
          صريح — فالنتيجة نفسها مهما كانت TimeZone الجلسة، وده مهم لأن
          `alter role authenticated set timezone` بيزحلق الأوليين في سكوت. */
       and created_at >= (public.cairo_day()::timestamp
                          at time zone 'Africa/Cairo');

    if v_today_cnt >= v_cap then
      v_capped := true;
    end if;
  end if;

  if not v_capped then
    /* on conflict do nothing مقصود: الفهرس الفريد (user_id, source, ref_id)
       بيمنع إعادة نفس السبب، والإعادة بترجّع awarded = 0 بدل exception. */
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
-- ٤) complete_study_day — السلسلة بتتحرك هنا وبس
-- ----------------------------------------------------------------------------
create or replace function public.complete_study_day(p_day_id uuid)
returns table (xp_awarded int, coins_awarded int, new_xp int, new_level int, new_balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_xp_reward int;
  v_is_completed boolean;
  v_owner uuid;
  v_day_config uuid;
  v_new_xp int;
  v_new_level int;
  v_coins int := 0;
  v_balance int := 0;
  v_coin_result record;
begin
  if v_uid is null then
    raise exception 'complete_study_day: not authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'complete_study_day: anonymous not allowed — create account';
  end if;
  if p_day_id is null then
    raise exception 'complete_study_day: p_day_id required';
  end if;

  select xp_reward, is_completed, user_id, config_id
    into v_xp_reward, v_is_completed, v_owner, v_day_config
  from public.study_days
  where id = p_day_id
  for update;

  if not found then
    raise exception 'complete_study_day: day not found';
  end if;
  if v_owner != v_uid then
    raise exception 'complete_study_day: day does not belong to user';
  end if;

  -- idempotency: إذا مكتمل بالفعل، لا مكافأة إضافية ولا سلسلة جديدة
  if coalesce(v_is_completed, false) = true then
    select coalesce(xp,0) into v_new_xp from public.profiles where id = v_uid;
    v_new_level := floor(greatest(coalesce(v_new_xp,0),0) / 200) + 1;
    select coalesce(sum(amount),0)::int into v_balance from public.coin_ledger where user_id = v_uid;
    return query select 0::int, 0::int, v_new_xp::int, v_new_level::int, v_balance::int;
    return;
  end if;

  v_xp_reward := coalesce(v_xp_reward, 100);
  if v_xp_reward < 0 or v_xp_reward > 500 then
    raise exception 'complete_study_day: invalid xp_reward %', v_xp_reward;
  end if;

  update public.study_days set is_completed = true where id = p_day_id;

  perform set_config('app.xp_bypass', 'on', true);
  update public.profiles
  set xp = greatest(0, coalesce(xp,0) + v_xp_reward)
  where id = v_uid
  returning xp into v_new_xp;
  perform set_config('app.xp_bypass', 'off', true);

  if not found then
    raise exception 'complete_study_day: profile not found';
  end if;

  v_new_level := floor(greatest(v_new_xp,0) / 200) + 1;

  begin
    select awarded, balance into v_coins, v_balance
    from public.award_coins('day_done', p_day_id::text) limit 1;
  exception when others then
    v_coins := 0;
    select coalesce(sum(amount),0)::int into v_balance from public.coin_ledger where user_id = v_uid;
  end;

  /* 🔥 السلسلة بتتحرك هنا وبس: اليوم اتعلم مكتمل والـ XP والكوينز اتمنحوا
     فوق. مفيش أي مسار تاني بيغيّر profiles.streak (trigger بيقفل الكلاينت). */
  perform public._streak_apply(v_uid);

  return query select v_xp_reward::int, coalesce(v_coins,0)::int, v_new_xp::int, v_new_level::int, coalesce(v_balance,0)::int;
end;
$$;

revoke all on function public.complete_study_day(uuid) from public;
grant execute on function public.complete_study_day(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- ٥) البريك — يوم القاهرة (من db/break-zone.sql)
-- ----------------------------------------------------------------------------
create or replace function public.break_studied_today(p_uid uuid)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select exists (
    select 1 from public.coin_ledger
    where user_id = p_uid and source in ('day_done', 'goal_done') and source_type = 'earn'
      and created_at >= (public.cairo_day()::timestamp at time zone 'Africa/Cairo')
  );
$$;

create or replace function public.daily_break_riddle()
returns table(question text, hint text, attempts_left int, solved boolean, studied boolean)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_id text;
begin
  if v_uid is null then raise exception 'daily_break_riddle: لازم تكون داخل بحسابك'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'daily_break_riddle: سجّل حساب دائم للبريك'; end if;
  select id into v_id from public.break_riddles order by id offset (abs(hashtext(v_day::text)) % (select count(*) from public.break_riddles)) limit 1;
  insert into public.break_riddle_sessions(user_id, day, riddle_id) values(v_uid, v_day, v_id) on conflict do nothing;
  return query select r.question, r.hint, 3 - s.attempts, s.solved_at is not null, public.break_studied_today(v_uid)
    from public.break_riddle_sessions s join public.break_riddles r on r.id = s.riddle_id where s.user_id=v_uid and s.day=v_day;
end; $$;

create or replace function public.answer_break_riddle(p_answer text)
returns table(correct boolean, attempts_left int, coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_session public.break_riddle_sessions%rowtype; v_answer text; v_coins int := 0; v_xp int := 0;
begin
  if v_uid is null then raise exception 'answer_break_riddle: لازم تكون داخل بحسابك'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'answer_break_riddle: سجّل حساب دائم للبريك'; end if;
  perform public.daily_break_riddle();
  select * into v_session from public.break_riddle_sessions where user_id=v_uid and day=v_day for update;
  if v_session.solved_at is not null then return query select true, 3-v_session.attempts, 0, 0, 'حلّيتها بالفعل النهارده'; return; end if;
  if v_session.attempts >= 3 then return query select false, 0, 0, 0, 'خلصت محاولات النهارده — ارجع بكرة'; return; end if;
  update public.break_riddle_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into v_session;
  select answer into v_answer from public.break_riddles where id=v_session.riddle_id;
  if lower(trim(p_answer)) <> lower(trim(v_answer)) then return query select false, 3-v_session.attempts, 0, 0, 'إجابة قريبة؟ جرّب تاني'; return; end if;
  update public.break_riddle_sessions set solved_at=now() where user_id=v_uid and day=v_day;
  if public.break_studied_today(v_uid) then
    v_coins := case when now() - v_session.first_seen_at <= interval '5 minutes' then 20 else 15 end; v_xp := 20;
    insert into public.coin_ledger(user_id, source, amount, source_type, ref_id, metadata) values(v_uid,'break_riddle',v_coins,'earn','riddle:'||v_day,jsonb_build_object('riddle',v_session.riddle_id));
    update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid;
  end if;
  return query select true, 3-v_session.attempts, v_coins, v_xp, case when v_coins>0 then 'صح! مكافأة بريك محدودة نزلت' else 'صح! ذاكر نشاطًا اليوم لتفتح مكافآت البريك' end;
end; $$;

-- ----------------------------------------------------------------------------
-- ٦) كويز البريك + مكافأة اللعبة (من db/gamification.sql)
-- ----------------------------------------------------------------------------
create or replace function public.daily_break_quiz()
returns table(question text, attempts_left int, solved boolean, subject text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid:=auth.uid(); v_day date:=public.cairo_day(); v_config uuid; v_subject text; v_topic text;
begin
 if v_uid is null then raise exception 'daily_break_quiz: لازم تكون داخل بحسابك'; end if;
 select coalesce(p.active_config_id,(select c.id from public.study_configs c where c.user_id=v_uid order by c.created_at desc limit 1)) into v_config from public.profiles p where p.id=v_uid;
 select c.subject into v_subject from public.study_configs c where c.id=v_config and c.user_id=v_uid;
 select coalesce(nullif(d.topic,''),nullif(d.title,'')) into v_topic from public.study_days d where d.user_id=v_uid and d.config_id=v_config and not d.is_completed order by d.day_number limit 1;
 v_subject:=coalesce(v_subject,'مراجعة عامة'); v_topic:=coalesce(v_topic,v_subject);
 insert into public.break_quiz_sessions(user_id,day,config_id,question,answer) values(v_uid,v_day,v_config,'Quiz Rush: في مسار «'||v_subject||'»، ما موضوع المرحلة التالية؟',v_topic) on conflict do nothing;
 return query select q.question,3-q.attempts,q.solved_at is not null,v_subject from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day;
end; $$;

create or replace function public.answer_break_quiz(p_answer text)
returns table(correct boolean, attempts_left int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid:=auth.uid(); v_day date:=public.cairo_day(); q public.break_quiz_sessions%rowtype;
begin
 if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean,false) then raise exception 'answer_break_quiz: سجّل حساب دائم أولًا'; end if;
 perform public.daily_break_quiz(); select * into q from public.break_quiz_sessions where user_id=v_uid and day=v_day for update;
 if q.solved_at is not null then return query select true,3-q.attempts,'أنهيت Quiz Rush اليوم'; return; end if;
 if q.attempts>=3 then return query select false,0,'انتهت محاولات Quiz Rush اليوم'; return; end if;
 update public.break_quiz_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into q;
 if lower(trim(p_answer))<>lower(trim(q.answer)) then return query select false,3-q.attempts,'راجع عنوان المرحلة التالية ثم حاول مرة أخرى'; return; end if;
 update public.break_quiz_sessions set solved_at=now() where user_id=v_uid and day=v_day;
 return query select true,3-q.attempts,'إجابة صحيحة — استلم مكافأة اللعبة';
end; $$;

create or replace function public.claim_break_game(p_game text)
returns table(coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day();
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_break_game: سجّل حساب دائم للبريك'; end if;
  if p_game not in ('memory','reaction','quiz') then raise exception 'claim_break_game: لعبة غير معروفة'; end if;
  if p_game='quiz' and not exists(select 1 from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day and q.solved_at is not null) then return query select 0,0,'أجب عن سؤال Quiz Rush المرتبط بمادتك أولًا'; return; end if;
  if not public.break_studied_today(v_uid) then return query select 0,0,'ذاكر أو خلّص هدف الأول — البريك مكافأة للمذاكرة'; return; end if;
  if (select count(*) from public.break_game_claims where user_id=v_uid and day=v_day) >= 2 then return query select 0,0,'وصلت حد مكافآت الألعاب النهارده'; return; end if;
  insert into public.break_game_claims(user_id,day,game) values(v_uid,v_day,p_game) on conflict do nothing;
  if not found then return query select 0,0,'أخدت مكافأة اللعبة دي النهارده'; return; end if;
  insert into public.coin_ledger(user_id,source,amount,source_type,ref_id,metadata) values(v_uid,'break_game',5,'earn',p_game||':'||v_day,jsonb_build_object('game',p_game));
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select 5,10,'مبروك — ٥ كوين و١٠ XP ضمن حد النهارده';
end; $$;

-- ----------------------------------------------------------------------------
-- ٧) المهام اليومية (من db/gamification.sql)
-- ----------------------------------------------------------------------------
create or replace function public.daily_missions()
returns table(mission text, label text, done boolean, claimed boolean, coins int, xp int)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day();
begin
  if v_uid is null then raise exception 'daily_missions: لازم تكون داخل بحسابك'; end if;
  return query
  select m.id, m.label, m.done, exists(select 1 from public.daily_mission_claims c where c.user_id=v_uid and c.day=v_day and c.mission=m.id), 5, 10
  from (
    select 'study'::text id, 'أكمل خطوة مذاكرة'::text label, exists(select 1 from public.coin_ledger l where l.user_id=v_uid and l.source='day_done' and l.source_type='earn' and l.created_at >= (v_day::timestamp at time zone 'Africa/Cairo')) done
    union all select 'goal', 'أنجز هدفًا في المخطط', exists(select 1 from public.coin_ledger l where l.user_id=v_uid and l.source='goal_done' and l.source_type='earn' and l.created_at >= (v_day::timestamp at time zone 'Africa/Cairo'))
    union all select 'riddle', 'حل فزورة البريك', exists(select 1 from public.break_riddle_sessions s where s.user_id=v_uid and s.day=v_day and s.solved_at is not null)
    union all select 'game', 'أكمل لعبة بريك', exists(select 1 from public.break_game_claims g where g.user_id=v_uid and g.day=v_day)
  ) m;
end; $$;

create or replace function public.claim_daily_mission(p_mission text)
returns table(coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_done boolean;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_daily_mission: سجّل حساب دائم أولًا'; end if;
  select dm.done into v_done from public.daily_missions() dm where dm.mission=p_mission;
  if not found then raise exception 'claim_daily_mission: مهمة غير معروفة'; end if;
  if not v_done then return query select 0,0,'أكمل المهمة الأول ثم استلم مكافأتها'; return; end if;
  insert into public.daily_mission_claims(user_id,day,mission) values(v_uid,v_day,p_mission) on conflict do nothing;
  if not found then return query select 0,0,'استلمت مكافأة المهمة دي بالفعل'; return; end if;
  insert into public.coin_ledger(user_id,source,amount,source_type,ref_id,metadata) values(v_uid,'daily_mission',5,'earn','mission:'||p_mission||':'||v_day,jsonb_build_object('mission',p_mission));
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select 5,10,'تمت المهمة — ٥ كوين و١٠ XP';
end; $$;

-- ----------------------------------------------------------------------------
-- ٨) غرفة الهروب (من db/gamification.sql) — نفس يوم القاهرة
-- ----------------------------------------------------------------------------
create or replace function public.escape_room_status()
returns table(step int, subject text, question text, hint text, attempts_left int, solved boolean, studied boolean)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_config uuid; v_step int;
begin
 if v_uid is null then raise exception 'escape_room_status: لازم تكون داخل بحسابك'; end if;
 select coalesce(p.active_config_id,(select c.id from public.study_configs c where c.user_id=v_uid order by c.created_at desc limit 1)) into v_config from public.profiles p where p.id=v_uid;
 insert into public.escape_sessions(user_id,day,config_id) values(v_uid,v_day,v_config) on conflict do nothing;
 select s.step into v_step from public.escape_sessions s where s.user_id=v_uid and s.day=v_day;
 return query select s.step::int, ctx.subject, ctx.question, ctx.hint, 6-s.attempts, s.solved_at is not null, public.break_studied_today(v_uid)
 from public.escape_sessions s left join lateral public.escape_room_context(v_uid,s.config_id,least(s.step,3)) ctx on true where s.user_id=v_uid and s.day=v_day;
end; $$;

create or replace function public.solve_escape_step(p_answer text)
returns table(correct boolean, step int, attempts_left int, coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); s public.escape_sessions%rowtype; v_answer text; v_coins int:=0; v_xp int:=0;
begin
 if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean,false) then raise exception 'solve_escape_step: سجّل حساب دائم أولًا'; end if;
 perform public.escape_room_status(); select * into s from public.escape_sessions where user_id=v_uid and day=v_day for update;
 if s.solved_at is not null then return query select true,4,6-s.attempts,0,0,'أنهيت الغرفة اليوم'; return; end if;
 if s.attempts >= 6 then return query select false,s.step::int,0,0,0,'انتهت محاولات اليوم — ارجع بكرة'; return; end if;
 update public.escape_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into s;
 select ctx.answer into v_answer from public.escape_room_context(v_uid,s.config_id,s.step) ctx;
 if lower(trim(p_answer))<>lower(trim(v_answer)) then return query select false,s.step::int,6-s.attempts,0,0,'ليست الإجابة؛ استخدم التلميح وحاول ثانية'; return; end if;
 if s.step < 3 then update public.escape_sessions set step=step+1 where user_id=v_uid and day=v_day returning * into s; return query select true,s.step::int,6-s.attempts,0,0,'صحيح! فتحت اللغز التالي'; return; end if;
 update public.escape_sessions set step=4, solved_at=now() where user_id=v_uid and day=v_day;
 if public.break_studied_today(v_uid) then v_coins:=25; v_xp:=30; insert into public.coin_ledger(user_id,source,amount,source_type,ref_id,metadata) values(v_uid,'escape_room',v_coins,'earn','escape:'||v_day,'{}'); update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid; end if;
 return query select true,4,6-s.attempts,v_coins,v_xp,case when v_coins>0 then 'هربت! كسبت ٢٥ كوين و٣٠ XP' else 'هربت! ذاكر اليوم لتفتح المكافأة' end;
end; $$;

-- ----------------------------------------------------------------------------
-- ٩) قفل الكلاينت على السلسلة
-- ----------------------------------------------------------------------------
create or replace function public.protect_profiles_streak()
returns trigger
language plpgsql
as $$
begin
  -- security definer (postgres) أو bypass مؤقت = مسموح
  if current_setting('app.streak_bypass', true) = 'on' then
    return new;
  end if;
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if coalesce((auth.jwt() ->> 'role'), '') = 'service_role' then
    return new;
  end if;

  -- إنشاء البروفايل: السلسلة بتبدأ من ١ دايمًا، مهما بعت الكلاينت
  if tg_op = 'INSERT' then
    new.streak := 1;
    new.last_study_day := null;
    return new;
  end if;

  if old.streak is distinct from new.streak
     or old.last_study_day is distinct from new.last_study_day then
    raise exception 'profiles.streak: direct update forbidden — use touch_streak()';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profiles_streak on public.profiles;
create trigger trg_protect_profiles_streak
before insert or update on public.profiles
for each row execute function public.protect_profiles_streak();

-- ----------------------------------------------------------------------------
-- ١٠) الصلاحيات (إعادة تثبيت بعد الاستبدال)
-- ----------------------------------------------------------------------------
revoke all on function public.break_studied_today(uuid) from public;
revoke all on function public.daily_break_riddle() from public;
revoke all on function public.answer_break_riddle(text) from public;
revoke all on function public.daily_break_quiz() from public;
revoke all on function public.answer_break_quiz(text) from public;
revoke all on function public.claim_break_game(text) from public;
revoke all on function public.daily_missions() from public;
revoke all on function public.claim_daily_mission(text) from public;
revoke all on function public.escape_room_status() from public;
revoke all on function public.solve_escape_step(text) from public;

grant execute on function public.daily_break_riddle() to authenticated;
grant execute on function public.answer_break_riddle(text) to authenticated;
grant execute on function public.daily_break_quiz() to authenticated;
grant execute on function public.answer_break_quiz(text) to authenticated;
grant execute on function public.claim_break_game(text) to authenticated;
grant execute on function public.daily_missions() to authenticated;
grant execute on function public.claim_daily_mission(text) to authenticated;
grant execute on function public.escape_room_status() to authenticated;
grant execute on function public.solve_escape_step(text) to authenticated;
