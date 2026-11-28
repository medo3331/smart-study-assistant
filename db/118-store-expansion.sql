-- ============================================================================
-- 118 — STORE EXPANSION + STUDY REWARDS PROOF + WEEKLY CHAMPIONS (DEV-M3)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القرارات: D-M-04 (مكافآت الدراسة بإثبات سيرفري) · D-M-06 · التصميم §7
-- يعتمد على: db/113 (الاقتصاد الكانون — آخر ملف اقتصاد شامل) + db/116/117
--
-- ⚠️ award_coins / add_coins_grant / coin_ledger_classified هنا هي **النسخ
--    الوحيدة الصالحة** بعد الملف ده — مبنية على أجسام db/113 بالحرف مع
--    الإضافات المعلّمة (db/118). ممنوع تشغيل ملفات قديمة بعدها.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) عناصر جديدة في الكتالوج (DEV-M3 — مرآة lib/shop/catalog.ts)
--    أسعار مضبوطة على نطاقات الندرة (BANDS) — الاختبار العكري بيمسك أي فرق.
--    append فقط: عناصر db/shop.sql القديمة ما اتلمستش.
-- ----------------------------------------------------------------------------
insert into public.shop_catalog (id, slot, price, credits_price, unlock, rarity, metadata) values
  ('avatar.graduate',   'avatar',  700, null, null, 'rare',      '{}'::jsonb),
  ('avatar.scientist',  'avatar',  200, null, null, 'uncommon',  '{}'::jsonb),
  ('avatar.books',      'avatar',  250, null, null, 'uncommon',  '{}'::jsonb),
  ('avatar.rocket',     'avatar',  620, null, null, 'rare',      '{}'::jsonb),
  ('avatar.brain',      'avatar', 1400, null, null, 'epic',      '{}'::jsonb),
  ('avatar.alien',      'avatar',  900, null, null, 'epic',      '{}'::jsonb),
  ('avatar.wizard',     'avatar', 2070, null, null, 'legendary', '{}'::jsonb),
  ('avatar.astronaut',  'avatar', 2330, null, null, 'legendary', '{}'::jsonb),
  ('title.quiz-master', 'title',   450, null, null, 'rare',      '{}'::jsonb),
  ('title.scholar',     'title',   280, null, null, 'uncommon',  '{}'::jsonb),
  ('title.champion',    'title',  1400, null, null, 'epic',      '{}'::jsonb),
  ('title.timekeeper',  'title',   200, null, null, 'uncommon',  '{}'::jsonb),
  ('companion.bunny',   'companion',  580, null, null, 'rare', '{}'::jsonb),
  ('companion.hamster', 'companion', 1400, null, null, 'epic', '{}'::jsonb)
on conflict (id) do update set
  price = excluded.price,
  credits_price = excluded.credits_price,
  unlock = excluded.unlock,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot;

-- ----------------------------------------------------------------------------
-- ٢) إثبات سيرفري لكويز الدرس (D-M-04) — تفعيل المصدر فوق جدول المحاولات
--    ⚠️ الجدول موجود في الإنتاج من قبل (بمخطط أغنى: status/answers/
--    expires_at/completed_at) — create if not exists للبيئات الجديدة بس،
--    بنفس المخطط الحي بالحرف.
--    التوليد (/api/lesson-quiz) بيسجّل المحاولة status='pending'، والتصحيح
--    بيحصل في /api/lesson-quiz/submit على السيرفر — المبلغ من
--    coin_source_rules (award_coins) والمرجع الفريد attempt id بيمنع
--    المنح مرتين.
-- ----------------------------------------------------------------------------
create table if not exists public.lesson_quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  day_id         uuid,
  status         text not null default 'pending',
  questions      jsonb not null,
  answers        jsonb,
  score          int,
  total          int,
  passed         boolean,
  content_hash   text,
  prompt_version text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

alter table public.lesson_quiz_attempts enable row level security;

drop policy if exists "quiz_attempts: own rows" on public.lesson_quiz_attempts;
create policy "quiz_attempts: own rows" on public.lesson_quiz_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- الجدول القائم كان service بس — المسار الجديد (توليد/تسليم من الكلاينت)
-- محتاج صلاحيات للطالب، والـ RLS أعلاه بتحصرها في صفوفه هو.
grant select, insert, update on public.lesson_quiz_attempts to authenticated;

-- الاختبار ممكن يتولّد من موضوع حر (من غير يوم خطة) — day_id اختياري.
alter table public.lesson_quiz_attempts alter column day_id drop not null;

-- تفعيل المصدر: ٥ كوينز لكل اختبار ناجح، سقف ٥ اختبارات/يوم
-- (قابل للتعديل من Economy Balancing — D-M-06).
update public.coin_source_rules
   set is_live = true, daily_cap = 5
 where id = 'lesson_quiz_passed';

-- ----------------------------------------------------------------------------
-- ٣) Magicly Weekly Champions (التصميم §7) — جوائز على الأداء الدراسي
--    الترتيب بمكافآت الدراسة (source_class='study') المشتركة في الأسبوع
--    المنتهي — مش بعدد الكوينز المشتراة (D-M-01).
-- ----------------------------------------------------------------------------
create table if not exists public.coin_champion_awards (
  id         bigint generated always as identity primary key,
  week_start date not null,            -- بداية أسبوع القاهرة (الاثنين)
  champ_rank int not null check (champ_rank between 1 and 3),
  user_id    uuid not null,
  coins      int not null,
  created_at timestamptz not null default now(),
  unique (week_start, champ_rank),
  unique (week_start, user_id)
);

alter table public.coin_champion_awards enable row level security;

drop policy if exists "champions: signed in reads" on public.coin_champion_awards;
create policy "champions: signed in reads" on public.coin_champion_awards
  for select using (auth.uid() is not null);
-- الكتابة من grant_weekly_champion_prizes بس (service_role بيتخطى RLS).

-- قاعدة الجائزة — المسار add_coins_grant بصنف 'rewards'
insert into public.coin_source_rules (id, amount, daily_cap, is_live) values
  ('champion_weekly', 200, 1, true)
on conflict (id) do update set
  amount = excluded.amount, daily_cap = excluded.daily_cap, is_live = excluded.is_live;

-- منح الجوائز — idempotent: unique (week_start, champ_rank) + مرجع الأسبوع
-- الفريد في coin_ledger. لو اتنادت مرتين مفيش كوينز تانية.
drop function if exists public.grant_weekly_champion_prizes();
create or replace function public.grant_weekly_champion_prizes()
returns table (out_week_start date, out_rank int, out_user_id uuid, out_coins int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_week_start date;
  v_prizes     int[] := array[200, 150, 100];
  v_rank       int;
  r            record;
begin
  if current_user in ('authenticated', 'anon')
     and coalesce((auth.jwt() ->> 'role'), '') not in ('service_role', 'postgres') then
    raise exception 'grant_weekly_champion_prizes: مسار داخلي (service_role) بس';
  end if;

  -- الأسبوع المنتهي: الاثنين الحالي ناقص ٧ — [الاثنين الماضي، الاثنين الحالي)
  v_week_start := (date_trunc('week', public.cairo_day())::date - 7);

  v_rank := 0;
  for r in
    select l.user_id, sum(l.amount) as total
      from public.coin_ledger l
     where l.source_type = 'earn'
       and coalesce(l.source_class,
             case when l.source in ('day_done','goal_done','streak_day','streak_tier_3','streak_tier_30',
                                    'badge','perfect_week','signup_bonus',
                                    'lesson_quiz_passed','review_done','exam_passed')
                  then 'study' end) = 'study'
       and l.created_at >= (v_week_start::timestamp at time zone 'Africa/Cairo')
       and l.created_at < ((v_week_start + 7)::timestamp at time zone 'Africa/Cairo')
     group by l.user_id
     order by sum(l.amount) desc, min(l.created_at) asc
     limit 3
  loop
    v_rank := v_rank + 1;
    insert into public.coin_champion_awards (week_start, champ_rank, user_id, coins)
      values (v_week_start, v_rank, r.user_id, v_prizes[v_rank])
      on conflict (week_start, champ_rank) do nothing;
    if found then
      perform public.add_coins_grant(r.user_id, 'champion_weekly', 'rewards',
                                     v_week_start::text, v_prizes[v_rank],
                                     jsonb_build_object('rank', v_rank,
                                                        'week_start', v_week_start));
      out_week_start := v_week_start;
      out_rank := v_rank;
      out_user_id := r.user_id;
      out_coins := v_prizes[v_rank];
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.grant_weekly_champion_prizes()
  from public, anon, authenticated;

-- لوحة الأبطال — الأسبوع الحالي (حتى الآن) + الفائزين بالأسبوع الماضي.
-- الأسماء من نفس جوين get_xp_leaderboard (profiles + social_profiles).
create or replace function public.weekly_champions_board()
returns table (scope text, rank int, user_id uuid, display_name text, avatar_url text, coins int)
language sql
stable
security definer
set search_path = public
as $$
  with current_week as (
    select row_number() over (order by sum(l.amount) desc, min(l.created_at) asc) as rk,
           l.user_id, sum(l.amount) as total
      from public.coin_ledger l
     where l.source_type = 'earn'
       and coalesce(l.source_class,
             case when l.source in ('day_done','goal_done','streak_day','streak_tier_3','streak_tier_30',
                                    'badge','perfect_week','signup_bonus',
                                    'lesson_quiz_passed','review_done','exam_passed')
                  then 'study' end) = 'study'
       and l.created_at >= (date_trunc('week', public.cairo_day())::timestamp
                            at time zone 'Africa/Cairo')
     group by l.user_id
     order by 1
     limit 3
  )
  select 'current' as scope, t.rk::int as rank, t.user_id as user_id,
         coalesce(sp.display_name, p.display_name, 'طالب') as display_name,
         sp.avatar_url as avatar_url,
         t.total::int as coins
    from current_week t
    join public.profiles p on p.id = t.user_id
    left join public.social_profiles sp on sp.user_id = t.user_id
  union all
  select 'last_week' as scope, a.champ_rank as rank, a.user_id as user_id,
         coalesce(sp.display_name, p.display_name, 'طالب') as display_name,
         sp.avatar_url as avatar_url, a.coins as coins
    from public.coin_champion_awards a
    join public.profiles p on p.id = a.user_id
    left join public.social_profiles sp on sp.user_id = a.user_id
   where a.week_start = (date_trunc('week', public.cairo_day())::date - 7)
  order by scope asc, rank asc;
$$;

revoke all on function public.weekly_champions_board() from public, anon;
grant execute on function public.weekly_champions_board() to authenticated;

-- ----------------------------------------------------------------------------
-- ٤) award_coins — الكانون (db/113) + فرع lesson_quiz_passed بإثباته
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


    when 'lesson_quiz_passed' then
      -- الإثبات (D-M-04): محاولة كويز اتصحّحت من السيرفر (db/118) ونجاحها
      -- مسجّل على حسابك. المعرّف هو attempt id — مرجع attempt في coin_ledger
      -- الفريد (user_id, source, ref_id) بيمنع منح نفس المحاولة مرتين.
      if v_ref is null
         or v_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'award_coins: lesson_quiz_passed محتاج معرّف محاولة (uuid)';
      end if;
      if not exists (
        select 1 from public.lesson_quiz_attempts a
         where a.id::text = v_ref
           and a.user_id = v_uid
           and a.completed_at is not null
           and a.passed = true
      ) then
        raise exception 'award_coins: مفيش محاولة كويز ناجحة بالمرجع ده على حسابك';
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

revoke all on function public.award_coins(text, text, jsonb) from public, anon;
grant execute on function public.award_coins(text, text, jsonb) to authenticated;
-- ----------------------------------------------------------------------------
-- ٥) add_coins_grant — الكانون (db/113) + تصنيف 'rewards' (جوائز الأبطال)
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
     بالـ REVOKE تحت. */
  if current_user in ('authenticated', 'anon')
     and coalesce((auth.jwt() ->> 'role'), '') not in ('service_role', 'postgres')
  then
    raise exception 'add_coins_grant: مسار داخلي (service_role) بس';
  end if;
  if p_source_class not in ('purchase', 'ads', 'admin', 'rewards') then
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

  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
  values (p_user_id, p_source, p_amount, 'earn', p_ref_id, coalesce(p_metadata, '{}'::jsonb), p_source_class)
  on conflict do nothing;

  if found then
    v_awarded := p_amount;
  end if;

  return v_awarded;
end;
$$;

revoke all on function public.add_coins_grant(uuid, text, text, text, int, jsonb)
  from public, anon, authenticated;
-- ----------------------------------------------------------------------------
-- ٦) coin_ledger_classified — التصنيف المشتق + champion_weekly
-- ----------------------------------------------------------------------------
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
           when l.source in ('champion_weekly') then 'rewards'
           when l.source in ('wheel','box_refund','achievement') then 'system'
           else 'other'
         end
       ) as source_class_resolved
  from public.coin_ledger l;
