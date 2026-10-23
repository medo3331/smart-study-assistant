-- ============================================================================
-- Phase 4.4-B-security — close the diagnostic_answers write hole
-- ----------------------------------------------------------------------------
-- Found while auditing the exam-bank switch, and it is worse than the
-- INSERT hole the phase was going to address.
--
-- WHAT WAS ALREADY TRUE
-- diagnostic_answers was locked down correctly for authenticated. The
-- revokes at db/phase2-diagnostic-security.sql:266 and :306 did land, and
-- probes confirm an authenticated client cannot insert, update or delete
-- an answer. That part of the design works and is untouched here.
--
-- WHAT WAS NOT
-- anon still held INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES.
--
-- The INSERT and the row-level operations turned out to be harmless in
-- practice, which is exactly why this would have survived a casual look:
--
--   anon INSERT   -> blocked 42501, no INSERT policy for anon
--   anon UPDATE   -> allowed by the grant, but RLS filtered it to 0 rows
--   anon DELETE   -> allowed by the grant, but RLS filtered it to 0 rows
--
-- RLS made those three safe without anyone deciding they were safe. The
-- fourth is not protected by anything:
--
--   anon TRUNCATE -> SUCCEEDED. 295 rows -> 0.
--
-- TRUNCATE does not evaluate row-level security policies at all. The two
-- policies on this table, "diag_answers: user reads" and "diag_answers:
-- admin manage", are irrelevant to it. The privilege alone is the whole
-- check, and anon had it. Every probe ran inside a transaction that was
-- rolled back, so the 295 rows are still there.
--
-- WHY THIS MATTERED ENOUGH TO FIX FIRST
-- diagnostic_answers is the audit trail that user_weaknesses is rebuilt
-- from. DELETE and TRUNCATE both destroy it, and the cache is derived —
-- with the trail gone there is nothing left to recompute from, and the
-- phase about to migrate mastery onto the exam bank would have been
-- building on data an anonymous request could erase.
--
-- The same probe found anon can TRUNCATE user_weaknesses as well. That
-- table is the derived cache itself, so it is closed here too rather than
-- left as the same hole one table over.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. diagnostic_answers
-- ----------------------------------------------------------------------------
-- The grant is revoked rather than relied upon. A REVOKE is the honest
-- statement of intent, and unlike "RLS will probably stop it" it keeps
-- being true if a policy is ever added, loosened, or dropped by a later
-- migration. RLS was never the control here; it was the accident that
-- covered two of the seven.

revoke insert, update, delete, truncate, trigger, references
  on public.diagnostic_answers from anon;

-- authenticated keeps exactly what it had, restated so the end state is
-- visible in one place rather than inferred from a file that may or may
-- not have been applied. SELECT only.
revoke insert, update, delete, truncate, trigger, references
  on public.diagnostic_answers from authenticated;

grant select on public.diagnostic_answers to authenticated;

-- service_role keeps the narrow direct-write path Phase 2 documented on
-- purpose: an admin repair or a backfill should not have to impersonate a
-- student to fix a row. It bypasses RLS and is only reachable from the
-- server environment via SUPABASE_SERVICE_ROLE_KEY, never from a browser.
grant insert, update, delete on public.diagnostic_answers to service_role;

-- Student writes continue to go through submit_diagnostic_answers, which is
-- SECURITY DEFINER (verified) and therefore unaffected by the revoke above.
-- That is what makes this safe: the RPC writes as its owner, and it is the
-- only thing that does.

-- ----------------------------------------------------------------------------
-- 2. user_weaknesses
-- ----------------------------------------------------------------------------
-- The derived mastery cache, rebuilt by refresh_topic_mastery — also
-- SECURITY DEFINER, also reachable only as its owner.

revoke insert, update, delete, truncate, trigger, references
  on public.user_weaknesses from anon;

-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- 1. The grants, read straight from the catalog:
--    select grantee, string_agg(privilege_type, ',' order by privilege_type)
--      from information_schema.table_privileges
--     where table_schema='public' and table_name='diagnostic_answers'
--       and grantee in ('anon','authenticated','service_role')
--     group by 1;
--    EXPECTED: anon -> SELECT only; authenticated -> SELECT only;
--              service_role -> the write set
--
-- 2. anon must not be able to truncate. This is the probe that matters and
--    the one that would have caught the hole, so it is written as an
--    attempted TRUNCATE rather than a grant listing:
--    begin; set local role anon; truncate diagnostic_answers; rollback;
--    EXPECTED: ERROR 42501 permission denied for table diagnostic_answers
--
-- 3. Same for user_weaknesses:
--    begin; set local role anon; truncate user_weaknesses; rollback;
--    EXPECTED: ERROR 42501
--
-- 4. The RPC path still works, because it is SECURITY DEFINER and must be:
--    begin;
--    select has_function_privilege('authenticated',
--      'public.submit_diagnostic_answers(uuid,jsonb)'::regprocedure, 'EXECUTE');
--    rollback;
--    EXPECTED: true
--
-- 5. Nothing was lost. The 295 answers and the mastery rows are the same
--    rows, untouched, because every probe above rolled back:
--    select (select count(*) from diagnostic_answers)::int answers,
--           (select count(*) from diagnostic_sessions)::int sessions,
--           (select count(*) from user_weaknesses)::int weaknesses;
--    EXPECTED: 295, 40, 18
-- ============================================================================


revoke insert, update, delete, truncate, trigger, references
  on public.user_weaknesses from authenticated;

grant select on public.user_weaknesses to authenticated;
grant insert, update, delete on public.user_weaknesses to service_role;

commit;
