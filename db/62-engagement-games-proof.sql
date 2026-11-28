-- ============================================================================
-- G0-B (Engagement Engine) — Games Proof
-- Date: 2026-11-21
-- Branch: feat/engagement-p1b2-discovery
--
-- GOAL:
--   Turn server-validated game outcomes into ONE trusted engagement event
--   each, emitted by trusted database logic through the existing P1-B2
--   ingestion path (`public.record_engagement_event`).
--
-- GAME INVENTORY (actual production games — G0-B audit):
--   1. Break Riddle (`answer_break_riddle`)  → ✅ ADOPTED: `break_riddle_solved`
--   2. Quiz Rush    (`answer_break_quiz`)    → ✅ ADOPTED: `break_quiz_solved`
--   3. Escape Room  (`solve_escape_step`)    → ✅ ADOPTED: `escape_room_solved`
--      (final solve only — the step=4 transition, NOT intermediate steps)
--   4. Break games memory/reaction (`claim_break_game`)
--      → ❌ NOT adopted: the claim row is server-recorded, but the play
--        outcome itself is computed client-side. No real outcome proof
--        exists, so it stays OUTSIDE the reward-proof system.
--   5. Community Quiz (`submit_quiz_result`)
--      → ❌ NOT adopted: score is client-supplied (Tier C).
--
-- PROOF CONTRACT (what qualifies as a completed game action):
--   * Authenticated, non-anonymous user (identity from the server session).
--   * The answer is validated SERVER-SIDE inside a SECURITY DEFINER
--     function (the client never submits a score or a "won" flag).
--   * The solve is the real state transition in the session row
--     (`solved_at: null -> now()`), attempted within daily limits
--     (riddle: 3 attempts/day, quiz: 3/day, escape: 6 attempts, 3 steps).
--   * The event is emitted in the SAME transaction as the solve — a
--     rollback removes both.
--   * One event per (user, event, Cairo day) — source_id = the Cairo day,
--     matching each session table's PK (user_id, day).
--
-- TRUST MODEL:
--   * All three types are registered with trust_level='server'.
--   * `verified_by` is written by `record_engagement_event` itself
--     (constant 'service_role'); callers cannot choose it.
--   * The ingestion function remains executable by service_role/postgres
--     only (anon/authenticated revoked in db/59).
--
-- IDEMPOTENCY:
--   * unique (user_id, event_type, source_table, source_id) + source_id =
--     the Cairo day string ⇒ exactly one event per solve-type per day,
--     even if the RPC is replayed after solving (the replay returns
--     before the emission point).
--
-- ⚠️ NO rewards/XP/coins logic is changed: every reward statement is
--    preserved byte-for-byte from the current PRODUCTION definitions
--    (captured in docs/artifacts/g0b-production-game-functions.sql —
--    the live bodies, which use award_coins + cairo_day and DIFFER from
--    the older db/43 / db/break-zone.sql / db/gamification.sql files).
--    The ONLY addition is the exception-safe event emission block.
--
-- DEPLOYMENT NOTE:
--   Do not apply to production without explicit authorization. Verify on
--   local/staging first (scripts/g0b-games-proof-verify.mjs refuses
--   production connections by design).
--
-- ROLLBACK:
--   delete from public.engagement_event_types
--     where event_type in ('break_riddle_solved','break_quiz_solved','escape_room_solved');
--   -- restore the three functions from
--   -- docs/artifacts/g0b-production-game-functions.sql (pre-G0-B bodies).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) سجل الأنواع: ثلاثة أحداث إثبات ألعاب (server trust) — بذر idempotent
-- ----------------------------------------------------------------------------
INSERT INTO public.engagement_event_types
  (event_type, source_table, trust_level, allowed_metadata_keys, max_metadata_bytes,
   max_events_per_hour, description, is_active)
VALUES
  ('break_riddle_solved', 'break_riddle_sessions', 'server',
     ARRAY['attempts_used', 'riddle_id'],
     2048, 5,
     'حل فزورة البريك: الإجابة تم التحقق منها على السيرفر داخل answer_break_riddle (SECURITY DEFINER)، والحدث يُصدر مع انتقال solved_at في نفس المعاملة. حدث واحد كحد أقصى لكل يوم كايرو.',
     true),
  ('break_quiz_solved', 'break_quiz_sessions', 'server',
     ARRAY['attempts_used'],
     2048, 5,
     'حل Quiz Rush: الإجابة (موضوع المرحلة التالية) تم التحقق منها على السيرفر داخل answer_break_quiz، والحدث يُصدر مع انتقال solved_at في نفس المعاملة.',
     true),
  ('escape_room_solved', 'escape_sessions', 'server',
     ARRAY['attempts_used'],
     2048, 5,
     'إكمال غرفة الهروب: الخطوات الثلاث تم التحقق منها على السيرفر داخل solve_escape_step؛ الحدث يُصدر عند الحل النهائي (step=4 + solved_at) في نفس المعاملة — لا يُصدر لخطوة وسيطة.',
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
-- ٢) answer_break_riddle — المصدر الإنتاجي الحرفي + إصدار الحدث
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.answer_break_riddle(p_answer text)
 RETURNS TABLE(correct boolean, attempts_left integer, coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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

  -- G0-B: إصدار حدث الحل الموثّق عبر مسار الإدخال الموثوق (P1-B2).
  --   * بعد تأكيد الحل (انتقال solved_at: null -> now()) وفوق حدود المحاولات.
  --   * نفس المعاملة: لو اترولدت، الحدث بيروح معاها.
  --   * فشل تسجيل الحدث لا يلغي الحل ولا مكافأته (exception-safe).
  begin
    perform public.record_engagement_event(
      'break_riddle_solved',
      'break_riddle_sessions',
      v_day::text,
      v_uid,
      jsonb_build_object(
        'attempts_used', v_session.attempts,
        'riddle_id', v_session.riddle_id
      ),
      now()
    );
  exception when others then
    raise warning 'answer_break_riddle: engagement event emission failed: %', sqlerrm;
  end;

  if public.break_studied_today(v_uid) then
    v_coins := 0; v_xp := 20;
    select awarded into v_coins from public.award_coins(
      case when now() - v_session.first_seen_at <= interval '5 minutes'
           then 'break_riddle_fast' else 'break_riddle' end,
      'riddle:' || v_day
    );
    update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid;
  end if;
  return query select true, 3-v_session.attempts, v_coins, v_xp, case when v_coins>0 then 'صح! مكافأة بريك محدودة نزلت' else 'صح! ذاكر نشاطًا اليوم لتفتح مكافآت البريك' end;
end; $function$;

-- ----------------------------------------------------------------------------
-- ٣) answer_break_quiz — المصدر الإنتاجي الحرفي + إصدار الحدث
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.answer_break_quiz(p_answer text)
 RETURNS TABLE(correct boolean, attempts_left integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid(); v_day date:=public.cairo_day(); q public.break_quiz_sessions%rowtype;
begin
 if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean,false) then raise exception 'answer_break_quiz: سجّل حساب دائم أولًا'; end if;
 perform public.daily_break_quiz(); select * into q from public.break_quiz_sessions where user_id=v_uid and day=v_day for update;
 if q.solved_at is not null then return query select true,3-q.attempts,'أنهيت Quiz Rush اليوم'; return; end if;
 if q.attempts>=3 then return query select false,0,'انتهت محاولات Quiz Rush اليوم'; return; end if;
 update public.break_quiz_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into q;
 if lower(trim(p_answer))<>lower(trim(q.answer)) then return query select false,3-q.attempts,'راجع عنوان المرحلة التالية ثم حاول مرة أخرى'; return; end if;
 update public.break_quiz_sessions set solved_at=now() where user_id=v_uid and day=v_day;

 -- G0-B: إصدار حدث الحل الموثّق (نفس المعاملة، exception-safe).
 begin
   perform public.record_engagement_event(
     'break_quiz_solved',
     'break_quiz_sessions',
     v_day::text,
     v_uid,
     jsonb_build_object('attempts_used', q.attempts),
     now()
   );
 exception when others then
   raise warning 'answer_break_quiz: engagement event emission failed: %', sqlerrm;
 end;

 return query select true,3-q.attempts,'إجابة صحيحة — استلم مكافأة اللعبة';
end; $function$;

-- ----------------------------------------------------------------------------
-- ٤) solve_escape_step — المصدر الإنتاجي الحرفي + إصدار الحدث عند الحل النهائي
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solve_escape_step(p_answer text)
 RETURNS TABLE(correct boolean, step integer, attempts_left integer, coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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

 -- G0-B: إصدار حدث الحل النهائي الموثّق (بعد تأكيد step=4 + solved_at،
 --   نفس المعاملة، exception-safe). الخطوات الوسيطة لا تُصدر حدثًا.
 begin
   perform public.record_engagement_event(
     'escape_room_solved',
     'escape_sessions',
     v_day::text,
     v_uid,
     jsonb_build_object('attempts_used', s.attempts),
     now()
   );
 exception when others then
   raise warning 'solve_escape_step: engagement event emission failed: %', sqlerrm;
 end;

 if public.break_studied_today(v_uid) then v_coins:=0; v_xp:=30; select awarded into v_coins from public.award_coins('escape_room', 'escape:' || v_day); update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid; end if;
 return query select true,4,6-s.attempts,v_coins,v_xp,case when v_coins>0 then 'هربت! كسبت ٢٥ كوين و٣٠ XP' else 'هربت! ذاكر اليوم لتفتح المكافأة' end;
end; $function$;

-- ----------------------------------------------------------------------------
-- ٥) إعادة تثبيت الصلاحيات (نفس حدود ما قبل الترحيل)
-- ----------------------------------------------------------------------------
revoke all on function public.answer_break_riddle(text) from public;
revoke all on function public.answer_break_quiz(text) from public;
revoke all on function public.solve_escape_step(text) from public;

grant execute on function public.answer_break_riddle(text) to authenticated;
grant execute on function public.answer_break_quiz(text) to authenticated;
grant execute on function public.solve_escape_step(text) to authenticated;

COMMIT;
