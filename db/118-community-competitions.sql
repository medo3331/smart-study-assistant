-- ============================================================================
-- MAGICLY — db/118: المسابقات المخصصة (C16) + إصلاح كوينز التحديات
-- ----------------------------------------------------------------------------
-- يعتمد على:
--   db/113 + db/118-economy + db/121  — award_coins / coin_source_rules
--   db/116                            — community_challenges
-- المحتوى:
--   ١) مصدر كوينز 'custom_quiz' (٥٠ كوين — مرتين/يوم كحد أقصى)
--   ٢) community_competitions           — مسابقات الكويز اللي الأدمن بيعملها
--   ٣) community_competition_attempts   — محاولة واحدة لكل مستخدم × مسابقة
--   ٤) إصلاح award_coins: فروع تحقق 'challenge' و'custom_quiz'
--      (الفروع كانت ناقصة — فوز التحدي كان بياخد ٠ كوين بصمت)
--   ٥) RPCs: إنشاء/إدارة (أدمن) + لعب وتسجيل (طلاب)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) مصدر الكوينز
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live)
values ('custom_quiz', 50, 2, true)
on conflict (id) do update set is_live = true;

-- ----------------------------------------------------------------------------
-- ٢) الجداول
-- ----------------------------------------------------------------------------
create table if not exists public.community_competitions (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  emoji              text not null default '🏆',
  subject            text,
  questions          jsonb not null default '[]'::jsonb,
  time_limit_seconds int,
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz not null default now() + interval '7 days',
  status             text not null default 'active' check (status in ('active','ended')),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_community_competitions_active
  on public.community_competitions (status, ends_at desc);

create table if not exists public.community_competition_attempts (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.community_competitions (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  score          int  not null default 0,
  total          int  not null default 0,
  awarded        boolean not null default false,
  answers        jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  unique (competition_id, user_id)
);

create index if not exists idx_competition_attempts_comp
  on public.community_competition_attempts (competition_id, score desc);

-- ----------------------------------------------------------------------------
-- ٣) RLS — مقفولة تمامًا (نمط C2): كل الوصول عبر RPCs
-- ----------------------------------------------------------------------------
alter table public.community_competitions         enable row level security;
alter table public.community_competition_attempts enable row level security;

-- ----------------------------------------------------------------------------
-- ٤) إصلاح award_coins — إعادة تعريف بنفس جسم db/121 + فرعا تحقق جديد
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
                      'escape_room','daily_mission','weekly_mission',
                      'challenge','custom_quiz') then 'games'
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
         or v_ref !~ '^quiz:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
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

    when 'challenge' then
      -- C14: الدليل = مشاركة فائزة بالتحدي على حساب المستخدم
      if v_ref is null then
        raise exception 'award_coins: challenge محتاج معرّف التحدي';
      end if;
      if not exists (
        select 1 from public.community_challenge_entries e
         where e.challenge_id::text = v_ref
           and e.user_id = v_uid
           and e.status = 'winner'
      ) then
        raise exception 'award_coins: مفيش فوز تحدي بالمرجع ده على حسابك';
      end if;

    when 'custom_quiz' then
      -- C16: الدليل = محاولة مسابقة ناجحة (٦٠٪+) على حساب المستخدم
      if v_ref is null then
        raise exception 'award_coins: custom_quiz محتاج معرّف المسابقة';
      end if;
      if not exists (
        select 1 from public.community_competition_attempts a
         where a.competition_id::text = v_ref
           and a.user_id = v_uid
           and a.total > 0
           and a.score * 10 >= a.total * 6
      ) then
        raise exception 'award_coins: مفيش محاولة ناجحة بالمرجع ده على حسابك';
      end if;

    else
      raise exception 'award_coins: المصدر % شغّال من غير تحقق حدث', p_source;
  end case;

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
revoke all on function public.award_coins(text, text, jsonb) from public, anon;
grant execute on function public.award_coins(text, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- ٥) RPCs — الأدمن: إنشاء وإدارة
-- ----------------------------------------------------------------------------

create or replace function public.admin_create_competition(
  p_title text,
  p_questions jsonb,
  p_description text default null,
  p_emoji text default '🏆',
  p_subject text default null,
  p_time_limit_seconds int default null,
  p_days int default 7
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_q  jsonb;
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_title is null or length(trim(p_title)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'bad_title');
  end if;
  if not (jsonb_typeof(p_questions) = 'array') or jsonb_array_length(p_questions) = 0 then
    return jsonb_build_object('ok', false, 'code', 'no_questions');
  end if;

  -- تنظيف الأسئلة: نص + اختيارات (٢-٦) + إجابة صحيحة داخل النطاق
  v_q := coalesce((
    select jsonb_agg(jsonb_build_object(
      'q',       left(trim(q ->> 'q'), 500),
      'options', (select jsonb_agg(left(trim(o), 200))
                   from jsonb_array_elements_text(coalesce(q -> 'options', '[]'::jsonb)) o),
      'correct', greatest(0, least(coalesce((q ->> 'correct')::int, 0), 3))
    ))
    from jsonb_array_elements(p_questions) q
    where length(coalesce(q ->> 'q', '')) > 0
       and jsonb_typeof(coalesce(q -> 'options', '[]'::jsonb)) = 'array'
       and jsonb_array_length(coalesce(q -> 'options', '[]'::jsonb)) between 2 and 6
  ), '[]'::jsonb);

  if jsonb_array_length(v_q) = 0 then
    return jsonb_build_object('ok', false, 'code', 'no_valid_questions');
  end if;

  insert into public.community_competitions
    (title, description, emoji, subject, questions, time_limit_seconds, ends_at, created_by)
  values
    (left(trim(p_title), 120), p_description, coalesce(nullif(p_emoji, ''), '🏆'),
     p_subject, v_q, p_time_limit_seconds,
     now() + greatest(1, least(coalesce(p_days, 7), 90)) * interval '1 day',
     auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'questions', jsonb_array_length(v_q));
end;
$$;

create or replace function public.admin_list_competitions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'competitions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           c.id,
      'title',        c.title,
      'description',  c.description,
      'emoji',        c.emoji,
      'subject',      c.subject,
      'questions',    c.questions,
      'time_limit_seconds', c.time_limit_seconds,
      'starts_at',    c.starts_at,
      'ends_at',      c.ends_at,
      'status',       c.status,
      'players',      (select count(*) from public.community_competition_attempts a where a.competition_id = c.id),
      'winners',      (select count(*) from public.community_competition_attempts a
                        where a.competition_id = c.id and a.total > 0 and a.score * 10 >= a.total * 6)
    ) order by c.created_at desc)
    from public.community_competitions c
  ), '[]'::jsonb));
end;
$$;

create or replace function public.admin_set_competition_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_status not in ('active','ended') then
    return jsonb_build_object('ok', false, 'code', 'bad_status');
  end if;
  update public.community_competitions set status = p_status where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- ٦) RPCs — الطلاب: عرض ولعب
-- ----------------------------------------------------------------------------

create or replace function public.active_community_competitions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  return jsonb_build_object('ok', true, 'competitions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',          c.id,
      'title',       c.title,
      'description', c.description,
      'emoji',       c.emoji,
      'subject',     c.subject,
      'question_count', jsonb_array_length(c.questions),
      'time_limit_seconds', c.time_limit_seconds,
      'reward_coins', 50,
      'ends_at',     c.ends_at,
      'players',     (select count(*) from public.community_competition_attempts a where a.competition_id = c.id),
      'my_attempt', case when m.score is null then null
                         else jsonb_build_object('score', m.score, 'total', m.total) end
    ) order by c.ends_at asc)
    from public.community_competitions c
    left join public.community_competition_attempts m
      on m.competition_id = c.id and m.user_id = v_me
    where c.status = 'active' and now() between c.starts_at and c.ends_at
  ), '[]'::jsonb));
end;
$$;

-- جلب أسئلة مسابقة للعب (بدون الإجابات الصحيحة)
create or replace function public.get_competition_questions(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_c  public.community_competitions;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
  end if;
  select * into v_c from public.community_competitions
   where id = p_id and status = 'active' and now() between starts_at and ends_at;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_active');
  end if;
  if exists (select 1 from public.community_competition_attempts
             where competition_id = p_id and user_id = v_me) then
    return jsonb_build_object('ok', false, 'code', 'already_played');
  end if;
  return jsonb_build_object('ok', true, 'title', v_c.title, 'emoji', v_c.emoji,
    'time_limit_seconds', v_c.time_limit_seconds,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('q', q ->> 'q', 'options', q -> 'options')
                        order by ord)
      from jsonb_array_elements(v_c.questions) with ordinality t(q, ord)
    ), '[]'::jsonb));
end;
$$;

-- تسجيل المحاولة: التصحيح سيرفر سايد + صرف الكوينز عبر award_coins
create or replace function public.submit_competition_attempt(
  p_competition_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_c   public.community_competitions;
  v_ans jsonb;
  v_score int := 0;
  v_total int;
  v_awarded int := 0;
  v_i  int;
  v_pick int;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
  end if;
  select * into v_c from public.community_competitions
   where id = p_competition_id and status = 'active' and now() between starts_at and ends_at;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_active');
  end if;

  -- محاولة واحدة لكل مستخدم × مسابقة
  insert into public.community_competition_attempts (competition_id, user_id)
  values (p_competition_id, v_me)
  on conflict (competition_id, user_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'already_played');
  end if;

  v_total := jsonb_array_length(v_c.questions);
  if v_total = 0 then
    return jsonb_build_object('ok', false, 'code', 'empty');
  end if;

  -- التصحيح: كل سؤال إجابته رقم — نقارن فهرس الاختيار
  v_ans := coalesce(p_answers, '[]'::jsonb);
  for v_i in 0 .. v_total - 1 loop
    v_pick := null;
    begin
      v_pick := (v_ans -> v_i)::int;
    exception when others then
      v_pick := null;
    end;
    if v_pick is not null
       and v_pick = coalesce((v_c.questions -> v_i ->> 'correct')::int, -1) then
      v_score := v_score + 1;
    end if;
  end loop;

  update public.community_competition_attempts
     set score = v_score, total = v_total, answers = v_ans
   where competition_id = p_competition_id and user_id = v_me;

  -- الكوينز: نجاح ٦٠٪+ — عبر المسار المركزي (قاعدة custom_quiz أعلاه)
  if v_score * 10 >= v_total * 6 then
    begin
      select awarded into v_awarded from public.award_coins(
        'custom_quiz', p_competition_id::text,
        jsonb_build_object('score', v_score, 'total', v_total)
      );
    exception when others then
      v_awarded := 0;
    end;
    update public.community_competition_attempts set awarded = v_awarded > 0
     where competition_id = p_competition_id and user_id = v_me;
  end if;

  return jsonb_build_object('ok', true, 'score', v_score, 'total', v_total,
    'coins_awarded', v_awarded);
end;
$$;

-- ----------------------------------------------------------------------------
-- ٧) الصلاحيات
-- ----------------------------------------------------------------------------
grant execute on function public.admin_create_competition(text, jsonb, text, text, text, int, int) to authenticated;
grant execute on function public.admin_list_competitions()                to authenticated;
grant execute on function public.admin_set_competition_status(uuid, text) to authenticated;
grant execute on function public.active_community_competitions()          to authenticated;
grant execute on function public.get_competition_questions(uuid)          to authenticated;
grant execute on function public.submit_competition_attempt(uuid, jsonb)  to authenticated;
