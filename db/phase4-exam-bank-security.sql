-- ============================================================================
-- Phase 4.0 — Security lockdown: the exam bank is read-only to clients
-- ----------------------------------------------------------------------------
-- Run this FIRST, before any data migration. It changes no rows.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE HOLE
-- ════════════════════════════════════════════════════════════════════════════
-- Phase 1.1 granted every write privilege to anon and authenticated, and the
-- admin policies never compensated for it:
--
--     create policy "past_exams: admin writes" on public.past_exams
--       for all using (auth.uid() in (select past_exams.id from site_admins));
--
-- That subquery selects past_exams.id, not site_admins.user_id, so the
-- predicate compares the caller's uuid against exam ids. It is always false,
-- the admin policy has never admitted anyone, and the GRANTs are what
-- actually decide writes. Which means an anonymous visitor could insert
-- questions, rewrite them, or run:
--
--     delete from past_exams;          -- wipe the whole bank
--     truncate past_exam_questions;    -- and the question bank with it
--
-- The same broken predicate appears on all three tables, and all three have
-- full INSERT/UPDATE/DELETE/TRUNCATE for anon and authenticated.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE MODEL WE ARE KEEPING
-- ════════════════════════════════════════════════════════════════════════════
-- The client reads. The server writes. Same shape as diagnostic_answers and
-- diagnostic_recommendations in Phase 2: the sensitive write is server-side
-- (service_role or a SECURITY DEFINER function), never a table grant.
--
--   anon          SELECT (published only, via RLS)   writes DENIED
--   authenticated SELECT (published only, via RLS)   writes DENIED
--   service_role  everything, RLS bypassed            ALLOWED
--
-- ════════════════════════════════════════════════════════════════════════════
-- BEFORE
-- ════════════════════════════════════════════════════════════════════════════
--   table                 anon                authenticated
--   past_exams            I/U/D/T             I/U/D/T
--   past_exam_questions   I/U/D/T             I/U/D/T
--   past_exam_answers     I/U/D/T             I/U/D/T
--
--   the same three also own the public "read published" policies, which are
--   correct and are left alone.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY THE ADMIN POLICIES ARE DROPPED, NOT REPAIRED
-- ════════════════════════════════════════════════════════════════════════════
-- Fixing the predicate to site_admins.user_id would give a browser session
-- whose uid is in site_admins direct table writes. That is a real capability
-- the project does not need: admin content is ingested by scripts running
-- with DATABASE_URL, which bypasses RLS as the table owner. So the policies
-- are removed rather than repaired. If an admin path ever needs to work
-- from a request, it gets a SECURITY DEFINER function that checks
-- site_admins itself — not a blanket grant.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- Fully reversible, and reverting re-opens the hole:
--
--   grant insert, update, delete, truncate
--     on public.past_exams, public.past_exam_questions, public.past_exam_answers
--     to anon, authenticated;
--
-- Do not roll back. If a legitimate write path breaks, fix the path.
--
-- Nothing in this file inserts, updates or deletes a row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Revoke every write privilege from the client roles
-- ---------------------------------------------------------------------------
-- revoke is idempotent: re-running changes nothing.

revoke insert, update, delete, truncate
  on public.past_exams from anon, authenticated;

revoke insert, update, delete, truncate
  on public.past_exam_questions from anon, authenticated;

revoke insert, update, delete, truncate
  on public.past_exam_answers from anon, authenticated;

-- REFERENCES/TRIGGER are not useful to a client against these tables and
-- are revoked for the same reason.
revoke references, trigger
  on public.past_exams from anon, authenticated;
revoke references, trigger
  on public.past_exam_questions from anon, authenticated;
revoke references, trigger
  on public.past_exam_answers from anon, authenticated;

-- SELECT is kept. The "public read published" policies decide what a client
-- can actually see, so the grant stays and the policy does the work.


-- ---------------------------------------------------------------------------
-- 2) Drop the never-working admin policies
-- ---------------------------------------------------------------------------
-- Their predicate is wrong (it compares against the guarded table's own id),
-- so they admit nobody. Dropping them changes no reachable behaviour while
-- removing a policy that reads as if it grants access.

drop policy if exists "past_exams: admin writes" on public.past_exams;
drop policy if exists "past_exam_questions: admin writes" on public.past_exam_questions;
drop policy if exists "past_exam_answers: admin writes" on public.past_exam_answers;


-- ---------------------------------------------------------------------------
-- 3) Make the intent explicit for the next reader
-- ---------------------------------------------------------------------------

comment on table public.past_exams is
  'Exam bank. Phase 4.0: read-only to anon and authenticated. Content is ingested server-side (service_role / table owner via DATABASE_URL), which bypasses RLS. The "public read published" policy is the only client-visible path.';

comment on table public.past_exam_questions is
  'Questions of a past exam. Phase 4.0: read-only to clients. MCQ auto-grading will use correct_option_index; past_exam_answers holds the reference/model answer and stays a separate concern.';

comment on table public.past_exam_answers is
  'Reference or model answers per question. Kept separate from the question row on purpose: correct_option_index is for deterministic MCQ scoring, answer_text is for explanations, essays and human review. Phase 4.0: read-only to clients.';


-- ============================================================================
-- VERIFICATION (run after, then run scripts/verify-exam-bank-security.mjs)
-- ============================================================================
-- 1. The client roles hold no write privilege at all:
--    select table_name, grantee, privilege_type
--      from information_schema.role_table_grants
--     where table_name in ('past_exams','past_exam_questions','past_exam_answers')
--       and grantee in ('anon','authenticated')
--       and privilege_type <> 'SELECT'
--     order by 1,2,3;
--    EXPECTED: zero rows.
--
-- 2. The broken admin policies are gone:
--    select tablename, policyname from pg_policies
--     where tablename in ('past_exams','past_exam_questions','past_exam_answers')
--     order by 1,2;
--    EXPECTED: only the "public read ..." policies remain.
--
-- 3. Row counts are untouched (this migration must not change data):
--    select 'past_exams' t, count(*) from past_exams
--    union all select 'past_exam_questions', count(*) from past_exam_questions
--    union all select 'past_exam_answers', count(*) from past_exam_answers;
--    EXPECTED before and after: 2, 0, 0.
-- ============================================================================
