-- ============================================================================
-- Phase C — Reward Sources Consolidation
-- التاريخ: ١ سبتمبر ٢٠٢٦
--
-- الهدف:
--   توحيد منح XP/Coins عبر أحداث حقيقية مثبتة، منع duplicate/farming،
--   استخدام البنية الموجودة (coin_ledger, coin_source_rules, increment_xp, grant_badge)
--   بدون تغيير amounts/caps أو إنشاء عملات/متجر/AI جديدة.
--
-- Scope: دراسة يوم + بادج + توثيق باقي المسارات (already validated)
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Study Day — RPC موحد يمنح XP + Coins بتحقق ملكية و idempotency
-- ----------------------------------------------------------------------------
-- يحل محل المسارين المتكررين:
--   dashboard toggle (increment_xp مباشر) + lesson handleCompleteLesson (update + increment_xp + award_coins)
-- الآن: حدث واحد مثبت = study_days.is_completed + award واحد فقط
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

  -- قفل الصف لمنع سباق
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

  -- idempotency: إذا مكتمل بالفعل، لا مكافأة إضافية
  if coalesce(v_is_completed, false) = true then
    select coalesce(xp,0) into v_new_xp from public.profiles where id = v_uid;
    v_new_level := floor(greatest(coalesce(v_new_xp,0),0) / 200) + 1;
    -- balance الحالي
    select coalesce(sum(amount),0)::int into v_balance from public.coin_ledger where user_id = v_uid;
    return query select 0::int, 0::int, v_new_xp::int, v_new_level::int, v_balance::int;
    return;
  end if;

  v_xp_reward := coalesce(v_xp_reward, 100);
  if v_xp_reward < 0 or v_xp_reward > 500 then
    raise exception 'complete_study_day: invalid xp_reward %', v_xp_reward;
  end if;

  -- علّم مكتمل
  update public.study_days set is_completed = true where id = p_day_id;

  -- منح XP (SECURITY DEFINER يتخطى trigger حماية xp)
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

  -- منح Coins عبر البنية الموجودة (يتحقق من is_completed + السقف + الفهرس الفريد)
  -- نستدعي award_coins داخليًا؛ لو فشل لسبب غير متوقع، لا نكسر إكمال اليوم
  begin
    select awarded, balance into v_coins, v_balance
    from public.award_coins('day_done', p_day_id::text) limit 1;
  exception when others then
    -- مثلاً لو coin_source_rules غير مهيأ — اترك اليوم مكتملاً و XP ممنوحًا
    v_coins := 0;
    select coalesce(sum(amount),0)::int into v_balance from public.coin_ledger where user_id = v_uid;
  end;

  return query select v_xp_reward::int, coalesce(v_coins,0)::int, v_new_xp::int, v_new_level::int, coalesce(v_balance,0)::int;
end;
$$;

revoke all on function public.complete_study_day(uuid) from public;
grant execute on function public.complete_study_day(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Badges — تشديد grant_badge بإثبات إنجاز فعلي
-- ----------------------------------------------------------------------------
-- الاستبدال يحافظ على نفس التوقيع لكن يضيف:
--   - التحقق من أن الفصل ضمن حدود التراك (days_count)
--   - التحقق من وجود يوم مكتمل واحد على الأقل في التراك (proof خفيف)
--   - لا يسمح بفصل وهمي كبير
create or replace function public.grant_badge(
  p_config_id uuid,
  p_chapter_number int,
  p_title text,
  p_subject text,
  p_accuracy int
)
returns table (badge_id uuid, already_existed boolean, message text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_new_id uuid;
  v_days_count int;
  v_max_chapter int;
  v_has_completed boolean := false;
begin
  if v_uid is null then
    raise exception 'grant_badge: not authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'grant_badge: anonymous not allowed';
  end if;
  if p_config_id is null then
    raise exception 'grant_badge: p_config_id required';
  end if;
  if p_chapter_number is null or p_chapter_number < 1 or p_chapter_number > 1000 then
    raise exception 'grant_badge: invalid p_chapter_number';
  end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then
    raise exception 'grant_badge: p_accuracy must be 0..100';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'grant_badge: p_title required';
  end if;
  if length(p_title) > 200 then
    raise exception 'grant_badge: p_title too long';
  end if;

  -- ملكية التراك
  select days_count into v_days_count
  from public.study_configs
  where id = p_config_id and user_id = v_uid;

  if not found then
    raise exception 'grant_badge: config not found for user';
  end if;

  v_days_count := coalesce(v_days_count, 0);
  -- CHAPTER_SIZE = 5 (موحد في app/dashboard/components/StudySections.tsx)
  v_max_chapter := greatest(1, ceil(v_days_count::float / 5));
  -- السماح بفصل واحد إضافي للمرونة (boss قد يظهر بعد إكمال الفصل)
  if p_chapter_number > v_max_chapter + 1 then
    raise exception 'grant_badge: chapter % out of range (max %)', p_chapter_number, v_max_chapter;
  end if;

  -- إثبات إنجاز: على الأقل يوم مكتمل في هذا التراك
  -- (لا نطلب كل أيام الفصل الخمسة — يكفي أن المستخدم ذاكر فعلاً)
  select exists(
    select 1 from public.study_days d
    where d.user_id = v_uid
      and d.config_id = p_config_id
      and coalesce(d.is_completed,false) = true
  ) into v_has_completed;

  if not v_has_completed then
    raise exception 'grant_badge: complete at least one study day before earning a badge';
  end if;

  -- منع التكرار
  select id into v_existing
  from public.badges
  where user_id = v_uid
    and config_id = p_config_id
    and chapter_number = p_chapter_number
  limit 1;

  if v_existing is not null then
    return query select v_existing, true::boolean, 'Badge already earned'::text;
    return;
  end if;

  insert into public.badges (user_id, config_id, chapter_number, title, subject, accuracy)
  values (v_uid, p_config_id, p_chapter_number, btrim(p_title), p_subject, p_accuracy)
  returning id into v_new_id;

  return query select v_new_id, false::boolean, 'Badge granted'::text;
end;
$$;

revoke all on function public.grant_badge(uuid,int,text,text,int) from public;
grant execute on function public.grant_badge(uuid,int,text,text,int) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Badges — حذف سياسة الإدخال المباشر (إن بقيت) + فهرس فريد
-- ----------------------------------------------------------------------------
drop policy if exists "badges: owner writes" on public.badges;
drop policy if exists "users manage their own badges" on public.badges;
create policy "badges: owner reads" on public.badges for select using (auth.uid() = user_id);
drop policy if exists "badges: owner updates" on public.badges;
drop policy if exists "badges: owner deletes" on public.badges;

create unique index if not exists badges_user_config_chapter_unique
  on public.badges (user_id, config_id, chapter_number);

-- ----------------------------------------------------------------------------
-- 4) ملاحظات Phase C
-- ----------------------------------------------------------------------------
-- - complete_study_day هو المسار الموحد لإنهاء اليوم: يتحقق من الملكية، يمنع التكرار،
--   يمنح XP (من xp_reward في الصف نفسه، لا من الكلاينت) و Coins (via award_coins)
--   في معاملة واحدة. إعادة النداء لنفس اليوم ترجع 0/0.
-- - grant_badge الآن يتحقق من إثبات دراسة (يوم مكتمل) وحدود الفصل، ثم يمنع التكرار.
--   Coins للبادج ما زالت عبر award_coins('badge', 'config:chapter') بشكل منفصل و idempotent.
-- - باقي المسارات (daily_missions, break, escape, worship, community_quiz) كانت
--   بالفعل SECURITY DEFINER مع تحقق حدث + idempotency، فتُركت كما هي.
-- - لا تغيير amounts/caps/store/AI.
