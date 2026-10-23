-- ============================================================================
-- Phase 4.4-D — move the diagnostic RPCs onto the exam bank
-- ----------------------------------------------------------------------------
-- Two functions and one schema change. The scoring source moves from
-- diagnostic_question_bank to past_exam_questions, and bank_question_id
-- becomes mandatory.
--
--   submit_diagnostic_answers   reads the answer key from the exam bank,
--                               takes bank_question_id from the client, and
--                               validates the question against the session
--   refresh_topic_mastery      derives topics from the exam bank
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE INPUT CONTRACT CHANGES, AND THAT IS THE POINT
-- ════════════════════════════════════════════════════════════════════════════
-- The client now sends bank_question_id, not question_id. There is no fallback
-- that accepts the old key: a dual-key contract would leave the legacy path
-- reachable forever, and closing it is the reason this phase exists. A client
-- on the old contract gets a clean validation error rather than a silent
-- downgrade.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY question_id HAS TO BECOME NULLABLE
-- ════════════════════════════════════════════════════════════════════════════
-- question_id is NOT NULL and references diagnostic_question_bank. The new RPC
-- resolves lineage by walking back the other way:
--
--     bank_question_id -> past_exam_questions.source_question_id
--                      -> legacy question_id
--
-- That works for the ten imported questions and nothing else. A question
-- authored directly in the exam bank has source_question_id = NULL because it
-- was never imported, so there is no legacy id to write. With the column
-- NOT NULL the insert fails and the RPC cannot store an answer for it at all —
-- the exam bank could be read from but never written to, which is the exact
-- opposite of what this phase is for.
--
-- So question_id drops to nullable. Nothing is lost: the foreign key stays, so
-- every non-null value still resolves to a real old question, and all 295
-- historical rows keep their values untouched. What changes is that the
-- legacy column stops being a requirement and becomes what it should have
-- been all along — optional lineage on a table being retired.
--
-- bank_question_id goes the other way and becomes NOT NULL. That is the one
-- guarantee this phase buys: no future row can be written without a canonical
-- exam-bank question behind it.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- STEP 1 — preflight. Nothing is enforced until the data can support it.
-- ----------------------------------------------------------------------------
-- bank_question_id can only become NOT NULL if every existing row already has
-- one. Checking in the same transaction means the constraint and the data
-- that satisfies it land together or not at all.

do $$
declare
  v_total  integer;
  v_filled integer;
  v_orphan integer;
begin
  select count(*) into v_total from public.diagnostic_answers;
  if v_total <> 295 then
    raise exception 'PHASE44D_ABORT: expected 295 answers, found %', v_total;
  end if;

  select count(*) into v_filled
  from public.diagnostic_answers where bank_question_id is not null;
  if v_filled <> 295 then
    raise exception
      'PHASE44D_ABORT: % of 295 answers still lack a bank_question_id', 295 - v_filled;
  end if;

  -- An orphan would pass the NOT NULL check and then fail later inside the
  -- RPC, so it is caught here where the message can say what it means.
  select count(*) into v_orphan
  from public.diagnostic_answers a
  where not exists (select 1 from public.past_exam_questions t where t.id = a.bank_question_id);
  if v_orphan > 0 then
    raise exception
      'PHASE44D_ABORT: % answer(s) point at a bank_question_id that does not exist', v_orphan;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- STEP 2 — the nullability change, in both directions
-- ----------------------------------------------------------------------------
alter table public.diagnostic_answers
  alter column question_id drop not null;

comment on column public.diagnostic_answers.question_id is
  'Legacy pointer to diagnostic_question_bank.id. Nullable: an exam-bank question authored directly has no legacy id. Retained through Phase 4.5 so historical answers keep resolving; the FK still applies to every non-null value.';

alter table public.diagnostic_answers
  alter column bank_question_id set not null;

comment on column public.diagnostic_answers.bank_question_id is
  'past_exam_questions.id. NOT NULL as of Phase 4.4-D: no answer can be written without a canonical exam-bank question behind it.';

-- Both uniqueness guards are kept, deliberately.
--   UNIQUE(session_id, question_id)          legacy, retained until 4.4-G
--                                            confirms nothing still needs it
--   UNIQUE(session_id, bank_question_id)     canonical
-- They defend the same invariant from two directions during the transition,
-- and the 295 historical rows are 1:1 between the two so they cannot disagree.
-- The legacy index goes later, in its own step.

-- ----------------------------------------------------------------------------
-- STEP 3 — submit_diagnostic_answers
-- ----------------------------------------------------------------------------
-- Three things change and the rest of the function is deliberately unchanged:
-- the input key, the table the answer key is read from, and the subject check,
-- which now goes through the exam rather than a column on the question.

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
  --    the client smuggled in — is_correct, correct_option_index, score,
  --    question_id — is simply never looked at.
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

    -- 4. THE ONLY SOURCE OF TRUTH — computed here, on the server.
    --
    --    The subject check is a JOIN through the exam, not a column on the
    --    question. past_exam_questions has no subject_id by design — it
    --    belongs to an exam — so "is this question in this session's subject"
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

    -- 5. Lineage is carried forward, never invented. A question imported from
    --    the old bank keeps its legacy id so historical tooling and the
    --    Phase 4.5 drop can still trace it; a question authored here has
    --    none, and stores null — which the column now allows.
    --
    --    ON CONFLICT targets the canonical guard, so retry-safety is
    --    enforced on the new identity. The legacy unique index stays as a
    --    second line for rows that still carry an old id.
    insert into public.diagnostic_answers
      (session_id, question_id, bank_question_id, selected_option_index, is_correct)
    values
      (p_session_id, v_legacy, v_bqid, v_sel, v_ok)
    on conflict (session_id, bank_question_id) do nothing;
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

-- ----------------------------------------------------------------------------
-- STEP 4 — refresh_topic_mastery
-- ----------------------------------------------------------------------------
-- The same join, twice. This is what actually moves the mastery cache onto the
-- exam bank: the topic for an answer is now read from past_exam_questions, so
-- a rebuild no longer depends on diagnostic_question_bank existing at all.

create or replace function public.refresh_topic_mastery(
  p_session_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_user    uuid;
  v_subject uuid;
  v_count   integer := 0;
  v_topic   text;
begin
  select s.user_id, s.subject_id
    into v_user, v_subject
  from public.diagnostic_sessions s
  where s.id = p_session_id and s.user_id = auth.uid();

  if v_user is null then
    raise exception 'session_not_found_or_not_yours'
      using errcode = 'no_data_found';
  end if;

  for v_topic in
    select distinct lower(coalesce(t.name, 'general'))
    from public.diagnostic_answers a
    join public.past_exam_questions q on q.id = a.bank_question_id
    left join public.diagnostic_topics t on t.id = q.topic_id
    where a.session_id = p_session_id
  loop
    insert into public.user_weaknesses
      (user_id, subject_id, topic_name, attempts, correct, error_count, mastery_level)
    select
      v_user, v_subject, v_topic, 0, 0, 0, 0
    on conflict do nothing;

    -- Rebuild from the audit trail, not increment from the cache.
    update public.user_weaknesses u
    set attempts      = agg.total,
        correct       = agg.hits,
        error_count   = agg.total - agg.hits,
        mastery_level = case when agg.total > 0
                             then agg.hits::numeric / agg.total
                             else 0 end,
        updated_at    = now()
    from (
      select
        count(*)::int as total,
        count(*) filter (where a.is_correct)::int as hits
      from public.diagnostic_answers a
      join public.past_exam_questions q on q.id = a.bank_question_id
      left join public.diagnostic_topics t on t.id = q.topic_id
      where a.session_id = p_session_id
        and lower(coalesce(t.name, 'general')) = v_topic
    ) agg
    where u.user_id = v_user
      and u.subject_id is not distinct from v_subject
      and lower(u.topic_name) = v_topic;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('topics_refreshed', v_count);
end;
$fn$;

commit;

-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- 1. The nullability swap landed in the intended directions:
--    select column_name, is_nullable from information_schema.columns
--     where table_name='diagnostic_answers'
--       and column_name in ('question_id','bank_question_id');
--    EXPECTED: question_id YES, bank_question_id NO
--
-- 2. No function still reads the old bank. This is the assertion that makes
--    the Phase 4.5 drop possible, so it is written against pg_proc rather than
--    against a grep:
--    select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.prokind='f'
--       and pg_get_functiondef(p.oid) ~ 'diagnostic_question_bank';
--    EXPECTED: zero rows
--
-- 3. The exam bank is now the only source for both paths:
--    select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.prokind='f'
--       and pg_get_functiondef(p.oid) ~ 'past_exam_questions';
--    EXPECTED: submit_diagnostic_answers, refresh_topic_mastery
--
-- 4. Both uniqueness guards are still present:
--    select indexname from pg_indexes where schemaname='public'
--      and indexname in ('diagnostic_answers_session_id_question_id_key',
--                        'diagnostic_answers_session_bank_question_uniq');
--    EXPECTED: 2
--
-- 5. The data is untouched — this phase changes code, not history:
--    select (select count(*) from diagnostic_answers)::int answers,
--           (select count(*) from diagnostic_answers where question_id is not null)::int legacy,
--           (select count(*) from diagnostic_answers where question_id is null)::int nulls,
--           (select count(*) from user_weaknesses)::int weaknesses,
--           (select count(*) from diagnostic_sessions)::int sessions;
--    EXPECTED: 295, 295, 0, 18, 40
--
-- 6. Mastery rebuilds to the same numbers. Run this for a completed session
--    and compare against the stored score, which was computed on the old bank:
--      select s.id, s.score, s.correct_count,
--             (select count(*) from diagnostic_answers a
--               where a.session_id=s.id and a.is_correct)::int recomputed
--        from diagnostic_sessions s
--       where s.status='completed' and s.question_count > 0
--       order by s.completed_at desc limit 5;
--    EXPECTED: recomputed equals correct_count for every row
--
-- 7. The answer key never leaves the database. The function reads
--    correct_option_index and returns only counts:
--    select proname, pg_get_functiondef(p.oid) ~ 'correct_option_index' as reads_key
--      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname='submit_diagnostic_answers';
--    EXPECTED: reads_key = true, and the return block is jsonb_build_object
--    of session_id / answers_stored / correct_count only
-- ============================================================================
