-- ============================================================================
-- G0-A (Engagement Engine) — Study/Learning Completion Proof
-- Date: 2026-11-21
-- Branch: feat/engagement-p1b2-discovery
--
-- GOAL:
--   Make a genuine Study/Learning completion eligible to produce ONE trusted
--   engagement event (`study_completed`), emitted by trusted database logic
--   through the existing P1-B2 ingestion path:
--     * registry row in `public.engagement_event_types`
--       (source_table='study_days', trust_level='server'),
--     * event emitted from inside `public.complete_study_day(uuid)` — the
--       single server-validated completion path — AFTER the completion is
--       confirmed, in the SAME transaction (atomic with the completion).
--
-- WHY complete_study_day (source identification):
--   * Both real study surfaces (`app/lesson/[dayId]/page.tsx`,
--     `app/dashboard/page.tsx`) complete days ONLY via this RPC.
--   * It derives the user from `auth.uid()` (never the request body),
--     locks the day row, verifies ownership, and is idempotent
--     (already-completed days return early without re-rewarding).
--   * The production guard trigger `trg_guard_study_days_client_writes`
--     blocks clients from setting/changing `is_completed` and protected
--     columns, so the ONLY path that can complete a day is this RPC.
--
-- PROOF CONTRACT (what qualifies as a completed study action):
--   * An authenticated, non-anonymous user (identity from the server session).
--   * An existing `study_days` row locked FOR UPDATE inside the transaction.
--   * The row belongs to the caller (server check, not client-supplied ID).
--   * The day was not previously completed (idempotent transition
--     false -> true; replays produce NO event and NO rewards).
--   * The event is committed atomically with the completion: if the
--     transaction rolls back, no event survives.
--
-- ⚠️ NO rewards/XP/coins/missions logic is changed here:
--    * `award_coins`, `coin_ledger`, `profiles.xp`, `_streak_apply` calls
--      are preserved byte-for-byte from the current definition (db/43).
--    * The ONLY addition is the engagement event emission, which is
--      exception-safe: a failure to record the event (e.g. hourly rate cap)
--      NEVER rolls back or blocks the student's completion.
--
-- TRUST CLASSIFICATION:
--   * `study_completed` is registered with trust_level='server'.
--   * `verified_by` is written by `record_engagement_event` itself (constant
--     'service_role'); the caller can never choose it.
--   * The ingestion function is executable by `service_role`/`postgres` only;
--     `anon`/`authenticated` are revoked, so no client can forge the event.
--
-- IDEMPOTENCY:
--   * source_id = study day UUID (text) ⇒ unique
--     (user_id, event_type, source_table, source_id) allows exactly one
--     `study_completed` event per study day per user, ever.
--   * Re-running complete_study_day on a completed day returns early and
--     emits nothing.
--
-- ROLLBACK:
--   delete from public.engagement_event_types where event_type = 'study_completed';
--   -- restore the previous function from db/43-retention-p0-streak.sql
--   -- (function recreation is idempotent; the pre-G0-A definition is the
--   --  same body minus the "G0-A" event emission block).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) سجل النوع: study_completed (إثبات إكمال يوم دراسة — server trust)
--    بذر idempotent بنفس أسلوب db/59.
-- ----------------------------------------------------------------------------
INSERT INTO public.engagement_event_types
  (event_type, source_table, trust_level, allowed_metadata_keys, max_metadata_bytes,
   max_events_per_hour, description, is_active)
VALUES
  ('study_completed', 'study_days', 'server',
     ARRAY['day_number', 'xp_reward'],
     2048, 30,
     'إكمال يوم دراسة موثّق: الحدث يُصدر داخل نفس معاملة complete_study_day بعد تأكيد الإكمال على السيرفر (هوية من الجلسة + ملكية اليوم + انتقال idempotent). لا يُصدر عند فتح الصفحة أو ترك الجلسة.',
     true)
ON CONFLICT (event_type) DO UPDATE SET
  source_table = EXCLUDED.source_table,
  trust_level = EXCLUDED.trust_level,
  allowed_metadata_keys = EXCLUDED.allowed_metadata_keys,
  max_metadata_bytes = EXCLUDED.max_metadata_bytes,
  max_events_per_hour = EXCLUDED.max_events_per_hour,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- ٢) إعادة إنشاء complete_study_day بنفس السلوك الحالي (db/43) + إصدار الحدث
--    بعد تأكيد الإكمال. كل منطق المكافآت (XP/Coins/streak) محفوظ كما هو.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_study_day(p_day_id uuid)
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
  v_day_number int;
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

  select xp_reward, is_completed, user_id, config_id, day_number
    into v_xp_reward, v_is_completed, v_owner, v_day_config, v_day_number
  from public.study_days
  where id = p_day_id
  for update;

  if not found then
    raise exception 'complete_study_day: day not found';
  end if;
  if v_owner != v_uid then
    raise exception 'complete_study_day: day does not belong to user';
  end if;

  -- idempotency: إذا مكتمل بالفعل، لا مكافأة إضافية ولا سلسلة جديدة ولا حدث
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

  -- G0-A: إصدار حدث الإكمال الموثّق عبر مسار الإدخال الموثوق (P1-B2).
  --   * بيتصدر فقط بعد تأكيد الإكمال فوق (يوم مملوك + انتقال false->true).
  --   * نفس المعاملة: لو المعاملة اترولدت، الحدث بيروح معاها.
  --   * فشل تسجيل الحدث (مثلًا السقف الساعي) لا يلغي إكمال الطالب ولا
  --     مكافآته — نفس سياسة award_coins فوق (exception-safe).
  --   * verified_by بتكتبها دالة الإدخال بنفسها ('service_role') —
  --     المستدعي لا يمكنه اختيارها.
  begin
    perform public.record_engagement_event(
      'study_completed',
      'study_days',
      p_day_id::text,
      v_uid,
      jsonb_build_object(
        'day_number', v_day_number,
        'xp_reward', v_xp_reward
      ),
      now()
    );
  exception when others then
    raise warning 'complete_study_day: engagement event emission failed: %', sqlerrm;
  end;

  return query select v_xp_reward::int, coalesce(v_coins,0)::int, v_new_xp::int, v_new_level::int, coalesce(v_balance,0)::int;
end;
$$;

COMMENT ON FUNCTION public.complete_study_day(uuid) IS
  'Unified server-validated study-day completion (XP/coins/streak preserved) + G0-A: emits one trusted `study_completed` engagement event per day via record_engagement_event, atomically with the completion.';

revoke all on function public.complete_study_day(uuid) from public;
grant execute on function public.complete_study_day(uuid) to authenticated;

COMMIT;
