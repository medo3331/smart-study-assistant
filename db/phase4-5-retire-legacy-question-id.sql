-- ============================================================================
-- Phase 4.5 — retire diagnostic_answers.question_id
-- ----------------------------------------------------------------------------
-- Phase 4.5-D dropped the column and its foreign key, and every submit
-- started failing with 400. The function was still naming it in the INSERT
-- column list.
--
-- This is a miss in the preflight audit, and it is worth recording why. The
-- gate asked whether any function READS the legacy column, and the answer was
-- a clean no -- the scorer reads bank_question_id and the answer key comes
-- from past_exam_questions. A read check is not a write check. The column was
-- being written on every single submit, the gate did not look, and the drop
-- turned a working RPC into a failing one.
--
-- The fix is to stop writing a column whose table is going away. The lineage
-- it carried was never the point: bank_question_id is canonical, and
-- past_exam_questions.source_question_id keeps the record of where each
-- question originally came from, on the question rather than on every answer
-- that referenced it.
--
-- v_legacy goes with it. It was only ever read to populate that column, and
-- q.source_question_id is still selected nowhere else, so the SELECT narrows
-- to the answer key.
-- ============================================================================

create or replace function public.submit_diagnostic_answers(
  p_session_id uuid,
  p_answers    jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_user    uuid;
  v_subject uuid;
  v_rows    integer := 0;
  v_correct integer := 0;
  v_item    jsonb;
  v_bqid    uuid;
  v_sel     integer;
  v_ok      boolean;
begin
  -- 1. Ownership. user_id and subject_id come from the session row, never from
  --    a parameter, so they cannot be spoofed.
  select s.user_id, s.subject_id
    into v_user, v_subject
  from public.diagnostic_sessions s
  where s.id = p_session_id
      and s.user_id = auth.uid()
      and s.status = 'in_progress';

  if v_user is null then
    raise exception 'session_not_found_or_not_yours'
      using errcode = 'no_data_found';
  end if;

  -- 2. Shape validation: must be a non-empty array of objects.
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'answers_must_be_an_array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_answers) = 0 then
    raise exception 'answers_cannot_be_empty' using errcode = '22023';
  end if;

  -- 3. We read ONLY bank_question_id and selected_option_index. Any other key
  --    the client smuggled in -- is_correct, correct_option_index, score,
  --    a legacy question id -- is simply never looked at.
  for v_item in select value from jsonb_array_elements(p_answers)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each_answer_must_be_an_object' using errcode = '22023';
    end if;

    v_bqid := (v_item ->> 'bank_question_id')::uuid;
    v_sel  := (v_item ->> 'selected_option_index')::integer;

    if v_bqid is null or v_sel is null then
      raise exception 'bank_question_id_and_selected_option_index_required'
        using errcode = '22023';
    end if;

    -- 4. THE ONLY SOURCE OF TRUTH -- computed here, on the server.
    --
    --    The subject check is a JOIN through the exam, not a column on the
    --    question. past_exam_questions has no subject_id by design -- it
    --    belongs to an exam -- so "is this question in this session's subject"
    --    means walking question -> exam -> subject. Without it a student
    --    could take a question id from one subject and submit it inside a
    --    session for another.
    --
    --    verification_status and topic_id are enforced here rather than
    --    assumed from the start route. This function is reachable on its
    --    own, so it has to hold the line itself: only a verified question
    --    with a topic may be answered, because both the mastery cache and
    --    the study plan are built from the topic.
    --
    --    The answer key is read here and nowhere else. correct_option_index
    --    is never returned and never accepted from the client.
    select (q.correct_option_index = v_sel)
      into v_ok
    from public.past_exam_questions q
    join public.past_exams e on e.id = q.exam_id
    where q.id = v_bqid
      and e.subject_id = v_subject
      and q.verification_status = 'verified'
      and q.topic_id is not null;

    -- A question outside the verified bank for this subject is skipped rather
    -- than failing the whole submit, so the session still scores on what was
    -- valid. Same behaviour the old function had and for the same reason: a
    -- stale client should not lose an entire session.
    if v_ok is null then
      continue;
    end if;

    -- 5. The answer records the exam bank's id and nothing else. There is no
    --    second pointer to keep in step, and therefore no second pointer that
    --    can go stale or block a drop.
    --
    --    The WHERE clause is required, not decorative: the canonical guard is
    --    a PARTIAL unique index, and without repeating its predicate Postgres
    --    cannot infer it and rejects the statement with 42P10.
    insert into public.diagnostic_answers
      (session_id, bank_question_id, selected_option_index, is_correct)
    values
      (p_session_id, v_bqid, v_sel, v_ok)
    on conflict (session_id, bank_question_id)
      where bank_question_id is not null
    do nothing;
  end loop;

  -- 6. Recount from the table, not from the loop, so the returned numbers
  --    reflect what is actually stored (including earlier retries).
  select count(*), count(*) filter (where is_correct)
    into v_rows, v_correct
  from public.diagnostic_answers
  where session_id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'answers_stored', v_rows,
    'correct_count', v_correct
  );
end;
$fn$;

-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- 1. The function no longer names the dropped column, checked against the
--    live definition with comments stripped so prose cannot satisfy it:
--    select pg_get_functiondef(p.oid) ~ '(session_id, question_id,'
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'submit_diagnostic_answers';
--    EXPECTED: false
--
-- 2. Still SECURITY DEFINER with a pinned search_path, and still executable
--    by the client role that actually calls it:
--    select prosecdef, proconfig from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'submit_diagnostic_answers';
--    select has_function_privilege('authenticated',
--      'public.submit_diagnostic_answers(uuid,jsonb)'::regprocedure, 'EXECUTE');
--    EXPECTED: true, {search_path=public,pg_temp}, true
--
-- 3. The audit that missed this, run the right way round. A read check is
--    not a write check; strip comments and look for the column anywhere:
--    select count(*) from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.prokind in ('f','p')
--       and regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--           ~ '(?<![_a-z])question_id';
--    EXPECTED: 0
--
-- 4. A real submit works, and an identical resubmit stores the same number
--    of rows rather than doubling it.
-- ============================================================================
