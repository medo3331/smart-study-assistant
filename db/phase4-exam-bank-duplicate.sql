-- ============================================================================
-- Phase 4.1 — Remove the duplicate past exam
-- ----------------------------------------------------------------------------
-- Two rows describe the same exam:
--   KEEP    d585d352-5ee0-44ec-a555-0a53e137c75d  (older, 2026-09-03)
--   DELETE  cb474fda-25b1-41e1-b55c-0de26bff46e6  (newer, 2026-09-04)
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY THE OLDER ROW
-- ════════════════════════════════════════════════════════════════════════════
-- The two are identical in every column that carries information, and the
-- rest are null on both: title, subject_id, academic_year_id, exam_date,
-- total_marks, duration_minutes, source_name, source_url, exam_file_path,
-- answer_file_path, is_published. With the rows indistinguishable, the
-- choice is a convention rather than a fact, and "keep the first" is the
-- one that does not silently prefer an id nobody has referenced yet.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE GUARD
-- ════════════════════════════════════════════════════════════════════════════
-- The DO block re-derives every fact at delete time rather than trusting
-- this comment. If anything below is false, the block raises and the
-- delete does not happen:
--
--   • the row to delete still exists
--   • the row to keep still exists
--   • the two are still identical on every compared column
--   • the row to delete still has no children, counted live
--
-- children = past_exam_questions.exam_id (ON DELETE CASCADE)
--          + curriculum_exams.past_exam_reference_id (ON DELETE SET NULL)
--
-- The cascade is why the children check is not optional: a question
-- written between the audit and now would be deleted silently.
--
-- ════════════════════════════════════════════════════════════════════════════
-- SCOPE
-- ════════════════════════════════════════════════════════════════════════════
-- One row. No schema change: exam_code and the question metadata columns
-- are Phase 4.2, deliberately not mixed in here. Nothing is inserted or
-- updated, and the read policies from Phase 4.0 are untouched.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- The row is recoverable only from the audit log or a dump, so take one
-- first if the data matters:
--
--   pg_dump "$DATABASE_URL" -t public.past_exams > past_exams-before-4-1.sql
--
-- After that, restoring means re-inserting the row with the original id:
--
--   insert into public.past_exams
--     (id, title, subject_id, academic_year_id, source_name, source_url)
--   values ('cb474fda-25b1-41e1-b55c-0de26bff46e6',
--           'Thanaweya Amma — General Secondary — Final Mathematics — 2024',
--           '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec',
--           '7161282c-9f5e-43a7-9bfa-7dbe77d40123',
--           'Ministry of Education — Egypt (MOE)',
--           'https://moe.gov.eg/ar/elearningenterypage/e-learning');
--
-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Exactly one exam remains, and it is the canonical id:
--    select id, title from past_exams;
--    EXPECTED: one row, d585d352-...
--
-- 2. Nothing else moved:
--    select (select count(*) from past_exams)          as exams,
--           (select count(*) from past_exam_questions) as questions,
--           (select count(*) from past_exam_answers)   as answers;
--    EXPECTED: 1, 0, 0
-- ============================================================================

do $$
declare
  v_keep constant uuid := 'd585d352-5ee0-44ec-a555-0a53e137c75d';
  v_del  constant uuid := 'cb474fda-25b1-41e1-b55c-0de26bff46e6';
  v_diff integer := 0;
  v_children integer := 0;
begin
  -- 1. the row to delete must still be there
  if not exists (select 1 from public.past_exams where id = v_del) then
    raise exception 'PHASE4_1_ABORT: % does not exist, nothing to delete', v_del;
  end if;

  -- 2. the row to keep must still be there
  if not exists (select 1 from public.past_exams where id = v_keep) then
    raise exception 'PHASE4_1_ABORT: canonical row % is missing', v_keep;
  end if;

  -- 3. they must still be identical on every informative column
  select count(*) into v_diff
  from public.past_exams k, public.past_exams d
  where k.id = v_keep and d.id = v_del
    and (
      k.title              is distinct from d.title
   or k.subject_id         is distinct from d.subject_id
   or k.academic_year_id   is distinct from d.academic_year_id
   or k.exam_date          is distinct from d.exam_date
   or k.total_marks        is distinct from d.total_marks
   or k.duration_minutes   is distinct from d.duration_minutes
   or k.source_name        is distinct from d.source_name
   or k.source_url         is distinct from d.source_url
   or k.exam_file_path     is distinct from d.exam_file_path
   or k.answer_file_path   is distinct from d.answer_file_path
   or k.is_published       is distinct from d.is_published
    );

  if v_diff > 0 then
    raise exception 'PHASE4_1_ABORT: the two rows are no longer identical';
  end if;

  -- 4. the row to delete must have no children, counted now
  select
      (select count(*) from public.past_exam_questions where exam_id = v_del)
    + (select count(*) from public.curriculum_exams where past_exam_reference_id = v_del)
  into v_children;

  if v_children > 0 then
    raise exception
      'PHASE4_1_ABORT: the duplicate now has % child row(s); deleting would cascade',
      v_children;
  end if;

  -- all four gates passed
  delete from public.past_exams where id = v_del;
end
$$;
