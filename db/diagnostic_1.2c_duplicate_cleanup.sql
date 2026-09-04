-- Phase 1.2C DUPLICATE CLEANUP — verified 30 rows → 10 unique (3 copies each)
-- Executed only after confirming actual counts (A-L) from DB
-- Keep earliest per question_text (min id / created_at); delete others
-- Must NOT delete unique questions
-- Status preserved = verified (not published)
-- Source reference preserved
-- Subject preserved (6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec)

-- A. SELECT verification (run first)
SELECT 'before' AS stage,
       COUNT(*) AS total_rows,
       COUNT(DISTINCT question_text) AS unique_questions,
       COUNT(*) FILTER (WHERE status='verified') AS verified,
       COUNT(*) FILTER (WHERE status='published') AS published,
       COUNT(*) FILTER (WHERE correct_option_index IS NULL) AS missing_answer,
       COUNT(*) FILTER (WHERE subject_id = '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec') AS math_subject,
       COUNT(DISTINCT source_reference) AS unique_sources
FROM public.diagnostic_question_bank;

-- B. Identify duplicates per question_text (for verification)
SELECT question_text, COUNT(*) AS duplicate_count, MIN(id::text) AS keep_id, MIN(created_at) AS keep_time
FROM public.diagnostic_question_bank
GROUP BY question_text
HAVING COUNT(*) > 1;

-- C. DELETE — keep earliest id per question_text, delete rest
-- Note: uses ctid for precise row targeting (PostgreSQL)
DELETE FROM public.diagnostic_question_bank
WHERE ctid NOT IN (
    SELECT MIN(ctid)
    FROM public.diagnostic_question_bank
    GROUP BY question_text
);

-- D. Verify after
SELECT 'after' AS stage,
       COUNT(*) AS total_rows,
       COUNT(DISTINCT question_text) AS unique_questions,
       COUNT(*) FILTER (WHERE status='verified') AS verified,
       COUNT(*) FILTER (WHERE status='published') AS published,
       COUNT(*) FILTER (WHERE correct_option_index IS NULL) AS missing_answer,
       COUNT(*) FILTER (WHERE subject_id = '6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec') AS math_subject,
       COUNT(DISTINCT source_reference) AS unique_sources
FROM public.diagnostic_question_bank;
