-- ============================================================================
-- Phase 4.3 — copy the verified questions into the exam bank
-- ----------------------------------------------------------------------------
-- Copy and verify. The source table is NOT touched: nothing is deleted,
-- nothing is archived, nothing is written back to
-- diagnostic_question_bank. Dropping it is a separate migration, to be
-- considered only after the diagnostic has been switched over in Phase
-- 4.4 and proven against the new source.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT MOVES
-- ════════════════════════════════════════════════════════════════════════════
--   question_text, question_type, marks, topic_id, difficulty,
--   options_json, correct_option_index
--
-- moved as-is. Difficulty is not reclassified and the answer key is not
-- rebuilt from the question text: the bank already holds the reviewed
-- values and re-deriving them here would be a second, silent source of
-- truth.
--
--   marks is NOT copied. diagnostic_question_bank has no marks column, so
--   the source does not know the mark allocation either. past_exam_questions
--   .marks stays null rather than carrying a guessed 1, which would
--   misrepresent an exam we have not seen a mark scheme for.
--
--   explanation is not copied either. The bank has an explanation column
--   and past_exam_questions has no equivalent; past_exam_answers is where a
--   model answer belongs, and filling that is a separate step.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT IS ADDED, AND WHY IT IS NOT TAKEN FROM THE SOURCE
-- ════════════════════════════════════════════════════════════════════════════
--   verification_status = 'verified'
--     The ten questions were extracted from a Ministry paper model, keyed
--     and human-checked before they were ingested. That check is real and
--     it carries over.
--
--     What it does NOT carry over is any claim about where the paper came
--     from. The bank's source_name reads
--     "moe_mathematica_exam_2023_first_round_verified" while the exam
--     title says 2024 and the academic year is 2023-2024, with
--     exam_date null. The slug asserts a year and a round that nothing in
--     the database corroborates. "verified" therefore speaks only to the
--     question, its answer key and its metadata.
--
--   source_note
--     "Imported from the verified diagnostic question bank; see bank
--      source_reference."
--
--     Deliberately free of a year. The conflicting values are the reason:
--     naming 2023 would read as a provenance claim the data does not
--     support, and so would naming 2024.
--
--   exam_code stays NULL.
--     Same reason. A code is meant to be a stable identity, and
--     MATH-2024-FINAL-R1 would assert both a year and a round that are
--     currently contradictory. It is set when the official source
--     settles the identity, in a separate step.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE GATES
-- ════════════════════════════════════════════════════════════════════════════
-- The insert is inside a DO block that raises rather than copying a
-- partial set. Every one of these is checked at execution time, not
-- trusted from this comment:
--
--   the exam exists, and exactly one exam exists to copy into
--   exactly 10 source rows are published
--   every source row has a topic_id that resolves to a live topic
--   every source row has options_json and a correct_option_index
--   no question for this exam already exists in the target
--
-- The topic check is the one that matters most. Mapping a topic by name
-- would be a guess; leaving it null would produce a question the
-- diagnostic cannot select by topic, which is the whole point of the
-- move. Neither is acceptable, so the migration stops.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- The copy is additive and the source is intact, so undoing it means
-- deleting what was added:
--
--   delete from public.past_exam_questions
--    where source_note =
--      'Imported from the verified diagnostic question bank; see bank source_reference.';
--
-- The diagnostic is still reading diagnostic_question_bank, so removing
-- the copies changes nothing a student can observe.
-- ============================================================================

-- ============================================================================
-- THE COPY
-- ============================================================================

do $$
declare
  v_exam       uuid;
  v_exam_count integer;
  v_src_count  integer;
  v_bad_topic  integer;
  v_no_options integer;
  v_no_answer  integer;
  v_duplicates integer;
  v_inserted   integer := 0;
  v_note constant text :=
    'Imported from the verified diagnostic question bank; see bank source_reference.';
begin
  -- 1) exactly one exam, and it is the one the questions belong to.
  select count(*) into v_exam_count from public.past_exams;
  if v_exam_count <> 1 then
    raise exception
      'PHASE4_3_ABORT: expected exactly 1 past_exams row, found % — copy cannot pick a target',
      v_exam_count;
  end if;
  select id into v_exam from public.past_exams;

  -- 2) exactly the ten published questions.
  select count(*) into v_src_count
  from public.diagnostic_question_bank where status = 'published';
  if v_src_count <> 10 then
    raise exception
      'PHASE4_3_ABORT: expected 10 published source questions, found %', v_src_count;
  end if;

  -- 3) every topic_id must resolve. A null topic would make the question
  --    invisible to a topic-scoped diagnostic; a name-matched topic would
  --    be a guess. Both stop the copy.
  select count(*) into v_bad_topic
  from public.diagnostic_question_bank b
  where b.status = 'published'
    and (b.topic_id is null
         or not exists (select 1 from public.diagnostic_topics t where t.id = b.topic_id));
  if v_bad_topic > 0 then
    raise exception
      'PHASE4_3_ABORT: % source question(s) have no resolvable topic', v_bad_topic;
  end if;

  -- 4) the answer key must be present and complete. Auto-grading reads it.
  select count(*) into v_no_options
  from public.diagnostic_question_bank
  where status = 'published'
    and (options_json is null or jsonb_array_length(options_json) = 0);
  if v_no_options > 0 then
    raise exception
      'PHASE4_3_ABORT: % source question(s) carry no options', v_no_options;
  end if;

  select count(*) into v_no_answer
  from public.diagnostic_question_bank
  where status = 'published' and correct_option_index is null;
  if v_no_answer > 0 then
    raise exception
      'PHASE4_3_ABORT: % source question(s) carry no answer key', v_no_answer;
  end if;

  -- 5) the target must be empty for this exam, so the copy cannot land
  --    twice if the migration is re-run.
  select count(*) into v_duplicates
  from public.past_exam_questions q
  where q.exam_id = v_exam
    and q.source_note = 'Imported from the verified diagnostic question bank; see bank source_reference.';
  if v_duplicates > 0 then
    raise exception
      'PHASE4_3_ABORT: % question(s) from this import already exist in the target', v_duplicates;
  end if;

  -- 6) copy. question_number is derived from the source order so the two
  --    tables can be compared row for row afterwards.
  insert into public.past_exam_questions (
    exam_id, question_number, question_text, question_type,
    topic_id, difficulty, options_json, correct_option_index,
    verification_status, source_note
  )
  select
    v_exam,
    row_number() over (order by b.created_at, b.id),
    b.question_text,
    coalesce(b.question_type, 'mcq'),
    b.topic_id,
    b.difficulty,
    b.options_json,
    b.correct_option_index,
    'verified',
    'Imported from the verified diagnostic question bank; see bank source_reference.'
  from public.diagnostic_question_bank b
  where b.status = 'published'
  order by b.created_at, b.id;

  get diagnostics v_inserted = row_count;

  if v_inserted <> v_src_count then
    raise exception
      'PHASE4_3_ABORT: copied % row(s) but read % from the source', v_inserted, v_src_count;
  end if;
end
$$;

-- ============================================================================
-- RLS
-- ============================================================================
-- Untouched. The copy runs as the table owner with DATABASE_URL, which is
-- how every other ingest has happened since Phase 4.0 revoked the client
-- write grants.

-- ============================================================================
-- VERIFICATION (run after — this is the point of the phase)
-- ============================================================================
-- 1. Ten rows arrived, and the source is still ten:
--    select (select count(*) from past_exam_questions)  as target,
--           (select count(*) from diagnostic_question_bank where status='published') as source;
--    EXPECTED: 10, 10
--
-- 2. Every imported row is verified, and says where it came from:
--    select verification_status, source_note, count(*)
--      from past_exam_questions group by 1,2;
--    EXPECTED: verified, the neutral note, 10
--
-- 3. Row-for-row agreement on the content that matters. This is the query
--    that would catch a mis-mapped topic or a shifted answer key:
--    select count(*) as mismatches
--      from past_exam_questions t
--      join diagnostic_question_bank b
--        on b.question_text = t.question_text
--     where t.topic_id             is distinct from b.topic_id
--        or t.difficulty           is distinct from b.difficulty
--        or t.options_json         is distinct from b.options_json
--        or t.correct_option_index is distinct from b.correct_option_index
--        or t.question_type        is distinct from coalesce(b.question_type,'mcq');
--    EXPECTED: 0
--
-- 4. Every topic resolves, and the spread matches the source:
--    select t.name as topic, count(*)
--      from past_exam_questions q join diagnostic_topics t on t.id = q.topic_id
--     group by 1 order by 1;
--
-- 5. exam_code is still null — the identity is not settled yet:
--    select exam_code from past_exams;
--    EXPECTED: null
--
-- 6. The diagnostic is untouched and still reading its own bank:
--    select count(*) from diagnostic_sessions where status = 'completed';
--    EXPECTED: unchanged from before this migration
-- ============================================================================
