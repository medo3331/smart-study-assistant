-- ============================================================================
-- Phase 4.4-H fix — ON CONFLICT needs the partial index predicate
-- ----------------------------------------------------------------------------
-- The live smoke test found this: every submit returned 400 with
--
--   42P10  there is no unique or exclusion constraint matching
--          the ON CONFLICT specification
--
-- The canonical guard is a PARTIAL unique index, created in 4.4-B:
--
--   create unique index diagnostic_answers_session_bank_question_uniq
--     on diagnostic_answers (session_id, bank_question_id)
--    where bank_question_id is not null;
--
-- and the function said only:
--
--   on conflict (session_id, bank_question_id) do nothing;
--
-- A partial index can only be inferred by ON CONFLICT when the statement
-- repeats its predicate. Without the WHERE clause Postgres looks for a full
-- unique index on those two columns, finds none, and refuses to parse the
-- statement -- so the function existed, was SECURITY DEFINER, had correct
-- ownership checks, and failed on every single call.
--
-- The function was never executed between 4.4-D and here. Four phases of
-- static tests asserted the text "on conflict (session_id, bank_question_id)"
-- was present, which it was; none of them ran the function, so a statement
-- that cannot execute passed as correct. The live smoke is what found it,
-- which is the whole argument for having one.
--
-- refresh_topic_mastery was checked for the same class of bug: it uses bare
-- `on conflict do nothing` with no conflict target, so there is no inference
-- to get wrong. write_diagnostic_recommendations targets
-- (session_id, weak_topic), backed by a real full unique constraint. Neither
-- is affected.
--
-- CREATE OR REPLACE rather than DROP and CREATE, so the function's OID,
-- ownership and grants are untouched.
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
  v_legacy  uuid;
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
  --    question_id -- is simply never looked at.
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
    select (q.correct_option_index = v_sel), q.source_question_id
      into v_ok, v_legacy
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

    -- 5. Lineage is carried forward, never invented. A question imported
    --    from the old bank keeps its legacy id so historical tooling and the
    --    Phase 4.5 drop can still trace it; a question authored here has
    --    none, and stores null -- which the column allows.
    --
    --    !! THE FIX !!
    --    The WHERE clause is required, not decorative. Without it Postgres
    --    cannot infer the partial index and rejects the whole statement with
    --    42P10, which is what the live smoke caught. It repeats the index
    --    predicate exactly, so if the index is ever redefined this has to
    --    change with it -- and the failure will be immediate and explicit
    --    rather than silent.
    insert into public.diagnostic_answers
      (session_id, question_id, bank_question_id, selected_option_index, is_correct)
    values
      (p_session_id, v_legacy, v_bqid, v_sel, v_ok)
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
-- 1. The statement parses. Postgres validates ON CONFLICT inference at
--    CREATE time, so a successful apply is itself the proof:
--    select proname from pg_proc
--     where proname = 'submit_diagnostic_answers';
--    EXPECTED: one row
--
-- 2. The predicate is present and matches the index exactly:
--    select pg_get_functiondef(p.oid) ~ 'where bank_question_id is not null' as has_predicate
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'submit_diagnostic_answers';
--    EXPECTED: true
--
-- 3. The function is still the only writer, and still runs as its owner:
--    select prosecdef, proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'submit_diagnostic_answers';
--    EXPECTED: true, {search_path=public,pg_temp}
--
-- 4. Retry safety is real, not theoretical. A live submit followed by an
--    identical resubmit must store 10 answers, not 20:
--    select count(*) from diagnostic_answers where session_id = '<session>';
--    EXPECTED: 10 after two identical calls
-- ============================================================================
