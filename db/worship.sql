-- ============================================================================
-- العبادة × اقتصاد الكوينز الموجود — ملف الهجرة الوحيد للمهمة دي.
-- شغّله في Supabase → SQL Editor بعد ما تكون شغّلت الجزء بتاع جداول التقدّم
-- (نفس الملف ده بيتضمّنهم بالترتيب الصحيح). تشغيله أكتر من مرة آمن.
--
-- المحتوى:
--   ١) جدول تقدّم العبادات (الدليل اللي بيتمشي عليه التحقق) + مزامنة
--   ٢) إعدادات العبادة على البروفايل (موقع القرآن المستهدف للتحقق السيرفري)
--   ٣) ثلاث مصادر كوينز جديدة في coin_source_rules (المبالغ والسقوف الرسمية)
--   ٤) توسعة award_coins() الحالية بفروع تحقق للمصادر الثلاثة — بدون أي
--      RPC جديد وبدون لمس أي جدول موجود.
--
-- ⚠️ ليه بنوسّع award_coins نفسها؟ الدالة الحالية بترفض أي مصدر ملوش فرع
--    تحقق (`raise 'المصدر % شغّال من غير تحقق حدث'`). دي أهم حماية في
--    الاقتصاد — فالمصادر الجديدة لازم ليها دليل حدث حقيقي، زي day_done
--    بالظبط. الدليل هنا صفوف worship_progress اللي بيكتبها صاحبها بس (RLS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) تقدّم العبادات اليومي — الدليل. صف لكل (مستخدم، يوم)، مالكه بس.
-- ----------------------------------------------------------------------------
create table if not exists public.worship_progress (
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null,

  -- {"fajr": true, ...} للصلوات الخمس المفروضة فقط
  prayers     jsonb not null default '{}'::jsonb,
  -- {"morning": 33, ...} عدّاد كل تصنيف أذكار
  adhkar      jsonb not null default '{}'::jsonb,
  -- آيات ورد اليوم
  quran_ayahs int not null default 0 check (quran_ayahs >= 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (user_id, day)
);

alter table public.worship_progress enable row level security;

drop policy if exists "worship_progress: owner all" on public.worship_progress;
create policy "worship_progress: owner all" on public.worship_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists worship_progress_user_day_idx
  on public.worship_progress (user_id, day desc);

-- الكتابة من الواجهة عبر RPC واحد — يضمن وجود صف اليوم قبل أي مكافأة.
create or replace function public.upsert_worship_progress(
  p_prayers jsonb default null,
  p_adhkar jsonb default null,
  p_quran_ayahs int default null
)
returns void
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then
    raise exception 'upsert_worship_progress: لازم تكون داخل بحسابك';
  end if;

  insert into public.worship_progress (user_id, day)
  values (v_uid, v_day)
  on conflict (user_id, day) do nothing;

  update public.worship_progress
     set prayers = coalesce(p_prayers, prayers),
         adhkar = coalesce(p_adhkar, adhkar),
         quran_ayahs = greatest(coalesce(p_quran_ayahs, quran_ayahs), 0),
         updated_at = now()
   where user_id = v_uid and day = v_day;
end;
$$;

revoke all on function public.upsert_worship_progress(jsonb, jsonb, int) from public;
grant execute on function public.upsert_worship_progress(jsonb, jsonb, int) to authenticated;

-- ----------------------------------------------------------------------------
-- ٢) إعدادات العبادة على البروفايل — عمود واحد + قائمة بيضاء للحفظ.
--    هدف القرآن المحفوظ هنا هو اللي التحقق السيرفي بيقراه (fallback: ١٠).
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists worship_settings jsonb;

create or replace function public.get_worship_settings()
returns table (islamic_settings jsonb)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select p.worship_settings from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.get_worship_settings() from public;
grant execute on function public.get_worship_settings() to authenticated;

create or replace function public.save_worship_settings(p_settings jsonb)
returns boolean
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_clean jsonb;
begin
  if v_uid is null then
    raise exception 'save_worship_settings: لازم تكون داخل بحسابك';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'save_worship_settings: الإعدادات لازم تكون كائن JSON';
  end if;

  v_clean := jsonb_build_object(
    'city',
      case when length(coalesce(p_settings->>'city','')) between 1 and 80
           then left(p_settings->>'city', 80) end,
    'country',
      case when length(coalesce(p_settings->>'country','')) between 1 and 80
           then left(p_settings->>'country', 80) end,
    'latitude',
      case when (p_settings->>'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (p_settings->>'latitude')::numeric between -90 and 90
           then (p_settings->>'latitude')::numeric end,
    'longitude',
      case when (p_settings->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (p_settings->>'longitude')::numeric between -180 and 180
           then (p_settings->>'longitude')::numeric end,
    'timezone',
      case when length(coalesce(p_settings->>'timezone','')) between 1 and 64
           then left(p_settings->>'timezone', 64) end,
    'calculation_method',
      case when length(coalesce(p_settings->>'calculation_method','')) between 1 and 40
           then left(p_settings->>'calculation_method', 40) end,
    'madhab',
      case when p_settings->>'madhab' in ('shafi','hanafi')
           then p_settings->>'madhab' end,
    'quran_daily_target',
      case when coalesce((p_settings->>'quran_daily_target')::int, 0) between 1 and 100
           then (p_settings->>'quran_daily_target')::int end
  );

  update public.profiles
     set worship_settings = v_clean
   where id = v_uid;

  return found;
end;
$$;

revoke all on function public.save_worship_settings(jsonb) from public;
grant execute on function public.save_worship_settings(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- ٣) مصادر الكوينز الثلاثة — المبالغ والسقوف الرسمية للمهمة.
--    سقف اليوم الكلي من العبادة = 15 + 5 + 9 = 29 كوين.
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live) values
  ('worship_prayer', 3, 5, true),
  ('worship_quran',  5, 1, true),
  ('worship_adhkar', 3, 3, true)
on conflict (id) do update set
  amount = excluded.amount,
  daily_cap = excluded.daily_cap,
  is_live = excluded.is_live;

-- ----------------------------------------------------------------------------
-- ٤) توسعة award_coins() الموجودة — نفس الجسم بالحرف + فروع تحقق للمصادر
--    الثلاثة الجديدة. مفيش RPC جديد، ومفيش تغيير في التوقيع أو الجداول.
--
--    المراجع المتوقعة (بيبنيها الواجهة بشكل حتمي عشان الفهرس الفريد يمنع
--    التكرار في الداتابيز نفسها):
--      worship_prayer → 'YYYY-MM-DD-fajr'   (يوم UTC + اسم الصلاة)
--      worship_quran  → 'YYYY-MM-DD'        (مرة واحدة يوميًا عند بلوغ الهدف)
--      worship_adhkar → 'YYYY-MM-DD-morning'(يوم UTC + تصنيف الأذكار)
-- ----------------------------------------------------------------------------

-- نزيل التعريف القديم الأول مش ضروري — CREATE OR REPLACE كافي لأن
-- التوقيع و أعمدة الرجوع زي ما هما بالظبط.
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
  /* متغيرات تحقق مصادر العبادة: اليوم والاسم المشتقين من المرجع */
  v_wday      date;
  v_wname     text;
begin
  if v_uid is null then
    raise exception 'award_coins: لازم تكون داخل بحسابك';
  end if;

  /* الزائر لأ — نفس شرط المصادر الأخرى بالحرف. */
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'award_coins: الزائر مايكسبش كوينز — سجّل حساب';
  end if;

  -- المبلغ من الجدول، مش من الكلاينت.
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

  /* التحقق من الحدث الفعلي — نفس نمط day_done/goal_done: الدليل صف حقيقي
     في جدول تاني مملوك للمستخدم، مش كلام الكونسول. */
  case p_source
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

    when 'daily_login' then
      if not exists (
        select 1 from public.profiles p
         where p.id = v_uid
           and p.last_study_day = (now() at time zone 'utc')::date
      ) then
        raise exception 'award_coins: الزيارة مش مسجّلة النهارده';
      end if;
      v_ref := v_day;

    /* ── مصادر العبادة الثلاثة ── */

    when 'worship_prayer' then
      -- المرجع 'YYYY-MM-DD-fajr': لازم الصلاة دي متسجّلة مكتملة في صف يومه.
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
      -- المرجع 'YYYY-MM-DD': لازم آيات اليوم ≥ الهدف المحفوظ (افتراضي ١٠).
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
      -- المرجع 'YYYY-MM-DD-morning': التصنيف لازم يكون له عدّاد مسجّل يومه.
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
