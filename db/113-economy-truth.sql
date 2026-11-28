-- ============================================================================
-- 113 — ECONOMY TRUTH (P0-B/P0-C/P0-G) + DEV-M1 Economy Foundation
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القرارات: D-M-01..D-M-07 المعتمدة · docs/STORE_GAMES_REBUILD_PROPOSAL.md
-- يعتمد على: docs/PHASE_0_ECONOMY_TRUTH_PLAN.md + PHASE_0_PRODUCTION_RECONCILIATION.md
--
-- ⚠️⚠️ **ده الملف اللي بيتشغّل آخرًا دائمًا** بين ملفات الاقتصاد.
--    النسخ الوحيدة الصالحة من award_coins / _award_coins_variable هي اللي
--    هنا. ملفات قديمة (shop.sql، 43، 44، worship.sql، phase-4) شغّلتها
--    قبل كده عادي — لكن بعد 113 مينفعش تتشغّل تاني، لأن آخر واحدة
--    بتكتب فوق النسخة الموحّدة وترجّع الاقتصاد لفوضى النسخ الخمس.
--    (هيدر Deprecation اتضاف على رأس كل ملف قديم.)
--
-- ── إيه اللي الملف ده بيبنيه ──
--  ١) `source_class` على coin_ledger (additive، nullable) — فصل مصدر العملة
--     (دراسة / نشاط / ألعاب / إعلانات / شراء / إداري) للتقارير المالية،
--     **من غير ما نغيّر الرصيد الظاهر للطالب** (رصيد واحد زي التصميم).
--     الحركات القديمة بتفضل null وتتشتق وقت القراءة من view (لا Backfill).
--  ٢) `coin_source_rules` — السجل الكامل: كل المصادر القائمة + مصادر
--     الألعاب اللي كانت بتنادى من غير فرع ولا قاعدة (break_riddle /
--     break_riddle_fast / escape_room — F1/F3/F5 في Phase 0) + مصادر
--     DEV-M1 الجديدة (lesson_quiz_passed / review_done / exam_passed) و
--     مسارات فلوس (purchase / ad_reward) — كلها is_live=false لحد
--     إثبات السيرفر وتفعيلها بقرار.
--  ٣) `award_coins` — النسخة الموحّدة (canonical): نفس جسم db/43 (اليوم
--     بالقاهرة، التحقق من الحدث، القفل، السقف) + كل فروع الألعاب
--     + كتابة source_class.
--  ٤) `_award_coins_variable` — المسار الداخلي للمبالغ المتغيرة
--     (achievement / wheel / box_refund). ممنوع على anon/authenticated.
--  ٥) `add_coins_grant` — المسار الداخلي لعملات غير مكتسبة بالمذاكرة
--     (شراء D-M-01 / إعلانات / إداري). service_role فقط. هو **الطريق
--     الوحيد** اللي بيكتب source_class != 'study'/'games'/'activity'.
--  ٦) صلاحيات P0-G: revoke anon من كل دوال المكافآت.
--
-- ── اللي **مش** في الملف ده (مقصود) ──
--  - لا حذف ولا تعديل مبالغ للحركات القديمة (لا Backfill).
--  - حارس الكتابة المباشرة (trigger) في db/114 — بعد تحويل الكتابات.
--  - تفعيل شراء/إعلانات — DEV-M4.
--
-- ── خريطة مكافآت التصميم المعتمد ← المصادر ──
--   إكمال درس مستحق     → day_done (قائم، ٢٥)
--   اجتياز اختبار الدرس → lesson_quiz_passed (٥ — معلّق لحد إثبات سيرفري)
--   إكمال مجموعة دروس   → perfect_week (قائم، ١٢٠)
--   إكمال مراجعة        → review_done (١٠ — معلّق)
--   اختبار شامل         → exam_passed (٢٠ — معلّق؛ نطاق الامتحانات محمي
--                          OUT OF SCOPE — D-DEV-02، الربط قراره هناك)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) source_class — تصنيف مصدر العملة (additive)
-- ----------------------------------------------------------------------------
alter table public.coin_ledger add column if not exists source_class text;

-- view للقراءة: الحركات القديمة (source_class null) بتتشتق من المصدر.
create or replace view public.coin_ledger_classified as
select l.*,
       coalesce(
         l.source_class,
         case
           when l.source in ('day_done','goal_done','streak_day','streak_tier_3','streak_tier_30',
                             'badge','perfect_week','signup_bonus',
                             'lesson_quiz_passed','review_done','exam_passed') then 'study'
           when l.source in ('break_game','break_riddle','break_riddle_fast','break_quiz',
                             'escape_room','daily_mission','weekly_mission') then 'games'
           when l.source in ('worship_prayer','worship_quran','worship_adhkar') then 'activity'
           when l.source in ('purchase') then 'purchase'
           when l.source in ('ad_reward') then 'ads'
           when l.source in ('admin_grant') then 'admin'
           when l.source in ('wheel','box_refund','achievement') then 'system'
           else 'other'
         end
       ) as source_class_resolved
  from public.coin_ledger l;

-- ----------------------------------------------------------------------------
-- ٢) السجل الكامل — coin_source_rules (idempotent)
--    المبالغ مرايا لـ COIN_SOURCES في lib/shop/economy.ts (مصدر الحقيقة TS،
--    السييد بيتولّد من scripts/shop-seed.mjs — المبالغ هنا نفسها).
--    ⚠️ مصدر شغّال لازم يكون ليه daily_cap (قاعدة db/shop.sql رقم ٣).
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live) values
  -- الأساس القائم (Phase 4.0 + Retention + العبادة)
  ('signup_bonus',      20,   1,  true),
  ('daily_login',       10,   1,  true),
  ('day_done',          25,   3,  true),
  ('goal_done',         10,   5,  true),
  ('streak_day',         8,   1,  true),
  ('streak_tier_3',     15,   1,  true),
  ('streak_tier_30',   250,   1,  true),
  ('badge',             40,   3,  true),
  ('perfect_week',     120,   1,  true),
  ('worship_prayer',     3,   5,  true),
  ('worship_quran',      5,   1,  true),
  ('worship_adhkar',     3,   3,  true),
  -- مصادر الألعاب — كانت بتنادى award_coins من غير فرع/قاعدة (F1/F3/F5)
  -- escape_room = ٢٥ (D-1 — نفس قيمة الإنتاج، مش ٦٠)
  ('break_riddle',      15,   1,  true),
  ('break_riddle_fast', 20,   1,  true),
  ('break_game',         5,   2,  true),
  ('escape_room',       25,   1,  true),
  ('daily_mission',      5,   4,  true),
  ('weekly_mission',   150,   1,  true),
  -- DEV-M1 — مكافآت الإنجاز الجديدة (معلّقة لحد إثبات سيرفري للحدث)
  ('lesson_quiz_passed', 5,   1,  false),
  ('review_done',       10,   1,  false),
  ('exam_passed',       20,   1,  false),
  -- DEV-M4 — مسارات الفلوس (معلّقة بقرار D-M-01/D-M-05 — بيتفعّلوا بقرار +
  -- بمسار داخلي مخصص، مش award_coins)
  ('purchase',         100,   3,  false),
  ('ad_reward',          5,   3,  false),
  ('admin_grant',      100,  null, false),
  -- مستقبلي
  ('league_promo',     200,   1,  false),
  -- مصادر متغيّرة — المبلغ الحقيقي من جدول مرجعي (كتالوج/جوايز/تعويض)،
  -- وamount هنا تمثيلي. box_refund بدون سقف يومي بالتصميم (محدود
  -- بمعاملة الصندوق نفسها: تعويض < سعر).
  ('achievement',      100,   1,  true),
  ('wheel',             30,   1,  true),
  ('box_refund',       100,  null, true)
on conflict (id) do update set
  amount = excluded.amount,
  daily_cap = excluded.daily_cap,
  is_live = excluded.is_live;

-- ----------------------------------------------------------------------------
-- ٣) النسخة الموحّدة من award_coins — canonical
--    الأساس: جسم db/43 (اليوم بالقاهرة + التحقق من الحدث + القفل + السقف)
--    + فروع الألعاب + source_class + حماية الزائر.
-- ----------------------------------------------------------------------------
create or replace function public.cairo_day()
returns date
language sql
stable
set search_path = pg_catalog
as $$ select (now() at time zone 'Africa/Cairo')::date $$;

revoke all on function public.cairo_day() from public;
grant execute on function public.cairo_day() to authenticated, anon;

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
    when p_source in ('worship_prayer','worship_quran','worship_adhkar') then 'activity'
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
      if v_ref is null or v_ref !~ '^mission:[a-z]+:\d{4}-\d{2}-\d{2}$' then
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

    /* ── مصادر DEV-M1: بتتفعل لما يكون فيه إثبات سيرفري للحدث ──
       lesson_quiz_passed: مستني مسار تصحيح سيرفري لكويز الدرس
       (نمط G0 proof). review_done/exam_passed: نطاق الامتحانات محمي
       (D-DEV-02 OUT OF SCOPE) — الربط بيقرر مع فريق الامتحانات. */

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
    -- app.coin_bypass = تصريح الكتابة للحارس (db/114) — is_local=true
    -- يعني بيخلص مع الـ transaction لوحده.
    perform set_config('app.coin_bypass', 'on', true);
    insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
    values (v_uid, p_source, v_amount, 'earn', v_ref, coalesce(p_metadata, '{}'::jsonb), v_class)
    on conflict do nothing;
    perform set_config('app.coin_bypass', 'off', true);

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

revoke all on function public.award_coins(text, text, jsonb) from public, anon;
grant execute on function public.award_coins(text, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- ٤) _award_coins_variable — المبالغ المتغيرة (achievement / wheel / box_refund)
--    مسار داخلي: ممنوع على anon وauthenticated — بتُنادى من دوال definer فقط
--    (sync_achievements / spin_wheel / open_box بعد تحويلها في db/114).
--    المبلغ بيتحقق إنه ضمن حدود المصدر ومش من الكلاينت.
-- ----------------------------------------------------------------------------
create or replace function public._award_coins_variable(
  p_source   text,
  p_ref_id   text,          -- null مسموح (box_refund — قرار صريح في db/shop.sql)
  p_amount   int,
  p_metadata jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid     uuid := auth.uid();
  v_cap     int;
  v_live    boolean;
  v_bounds  int[];
  v_awarded int := 0;
  v_class   text;
begin
  /* حماية المسار: الدالة دي بتُنادى من دوال definer داخلية بس
     (sync_achievements / spin_wheel / open_box). المتصل الداخلي بيعمل
     set_config('app.coin_bypass','on',true) قبل النداء — اللي إعداده
     محليًا في جلسته (authenticated) مابيناديش الدالة أصلاً لأنها
     ممنوعة عليه بالـ REVOKE تحت. */
  if coalesce(current_setting('app.coin_bypass', true), '') <> 'on' then
    raise exception '_award_coins_variable: نداء من خارج المسار الداخلي';
  end if;

  select daily_cap, is_live
    into v_cap, v_live
    from public.coin_source_rules
   where id = p_source;

  if not found then
    raise exception '_award_coins_variable: مصدر مش معروف: %', p_source;
  end if;
  if not v_live then
    raise exception '_award_coins_variable: المصدر % لسه مش شغّال', p_source;
  end if;

  /* حدود المبلغ لكل مصدر متغيّر — مش من الكلاينت، من الدالة نفسها.
     achievement: كتالوج الإنجازات (والتحقق النهائي في الدالة المستدعية
     بمقارنة achievements_catalog.coins). wheel: جوايز العجلة.
     box_refund: جدول shop_refunds. الحدود هنا أوسع من القيم الحالية
     عن قصد — هي حاجز ضد التلاعب، مش مصدر الحقيقة للقيمة. */
  v_bounds := case p_source
    when 'achievement' then array[1, 500]
    when 'wheel'       then array[1, 500]
    when 'box_refund'  then array[1, 2000]
    else null
  end;

  if v_bounds is null then
    raise exception '_award_coins_variable: المصدر % مش مصدر متغيّر', p_source;
  end if;
  if p_amount is null or p_amount < v_bounds[1] or p_amount > v_bounds[2] then
    raise exception '_award_coins_variable: مبلغ % خارج حدود المصدر % (%)', p_source, p_amount, v_bounds;
  end if;

  v_class := case p_source
    when 'achievement' then 'system'
    when 'wheel'       then 'games'
    when 'box_refund'  then 'system'
    else 'other'
  end;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  perform 1 from public.coin_wallets where user_id = v_uid for update;

  if v_cap is not null then
    if (select count(*) from public.coin_ledger
         where user_id = v_uid
           and source = p_source
           and source_type = 'earn'
           and created_at >= (public.cairo_day()::timestamp
                              at time zone 'Africa/Cairo')) >= v_cap then
      return 0;
    end if;
  end if;

  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
  values (v_uid, p_source, p_amount, 'earn', p_ref_id, coalesce(p_metadata, '{}'::jsonb), v_class)
  on conflict do nothing;

  if found then
    v_awarded := p_amount;
  end if;

  return v_awarded;
end;
$$;

revoke all on function public._award_coins_variable(text, text, int, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- ٥) add_coins_grant — عملات مش مكتسبة بالمذاكرة (D-M-01 / D-M-05)
--    المسار الوحيد لـ source_class in ('purchase','ads','admin').
--    service_role فقط (باقات الشراء، SSV للإعلانات، تعويضات الإدارة).
--    DEV-M1 بيبني المسار ومش بيفعّله — التفعيل مع DEV-M4.
-- ----------------------------------------------------------------------------
create or replace function public.add_coins_grant(
  p_user_id      uuid,
  p_source       text,
  p_source_class text,
  p_ref_id       text,
  p_amount       int,
  p_metadata     jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_cap     int;
  v_live    boolean;
  v_awarded int := 0;
begin
  /* current_user = postgres (definer) يعني نداء داخلي من دالة definer —
     مسموح. نداء مباشر من service_role كمان مسموح. مستخدم عادي ممنوع
     بالـ REVOKE تحت + بفحص coin_bypass. */
  if current_user in ('authenticated', 'anon')
     and coalesce((auth.jwt() ->> 'role'), '') not in ('service_role', 'postgres')
  then
    raise exception 'add_coins_grant: مسار داخلي (service_role) بس';
  end if;
  if p_source_class not in ('purchase', 'ads', 'admin') then
    raise exception 'add_coins_grant: تصنيف غير مسموح: %', p_source_class;
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'add_coins_grant: مبلغ غير صالح: %', p_amount;
  end if;

  select daily_cap, is_live into v_cap, v_live
    from public.coin_source_rules where id = p_source;
  if not found then
    raise exception 'add_coins_grant: مصدر مش معروف: %', p_source;
  end if;
  if not v_live then
    raise exception 'add_coins_grant: المصدر % مقفول', p_source;
  end if;

  if v_cap is not null then
    if (select count(*) from public.coin_ledger
         where user_id = p_user_id
           and source = p_source
           and source_type = 'earn'
           and created_at >= (public.cairo_day()::timestamp
                              at time zone 'Africa/Cairo')) >= v_cap then
      return 0;
    end if;
  end if;

  insert into public.coin_wallets (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  perform 1 from public.coin_wallets where user_id = p_user_id for update;

  perform set_config('app.coin_bypass', 'on', true);
  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
  values (p_user_id, p_source, p_amount, 'earn', p_ref_id, coalesce(p_metadata, '{}'::jsonb), p_source_class)
  on conflict do nothing;
  perform set_config('app.coin_bypass', 'off', true);

  if found then
    v_awarded := p_amount;
  end if;

  return v_awarded;
end;
$$;

revoke all on function public.add_coins_grant(uuid, text, text, text, int, jsonb)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- ٦) P0-G — صلاحيات: anon ممنوع من كل دوال المكافآت
-- ----------------------------------------------------------------------------
revoke execute on function public.claim_break_game(text)    from anon;
revoke execute on function public.claim_daily_mission(text) from anon;
revoke execute on function public.claim_weekly_mission()    from anon;
revoke execute on function public.answer_break_riddle(text) from anon;
revoke execute on function public.answer_break_quiz(text)   from anon;
revoke execute on function public.solve_escape_step(text)   from anon;
revoke execute on function public.sync_achievements()       from anon;
revoke execute on function public.spin_wheel()              from anon;
revoke execute on function public.open_box(uuid)            from anon;
revoke execute on function public.purchase_item(text)       from anon;

-- ============================================================================
-- نهاية 113 — بعده: db/114-economy-route-writers.sql (التحويل + الحارس)
-- ============================================================================
