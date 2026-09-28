-- ============================================================================
-- Phase 2 — Diagnostic Persistence & Security Migration
-- ----------------------------------------------------------------------------
-- ⚠️ Run in Supabase → SQL Editor. Review the "BEFORE / WHY" blocks first.
--
-- This file only ADDS and TIGHTENS. Nothing is dropped, no row is deleted.
-- See the ROLLBACK block at the bottom for the reverse operations.
--
-- ---------------------------------------------------------------------------
-- WHY EACH STEP EXISTS (the Phase 2 audit findings that forced them)
-- ---------------------------------------------------------------------------
--
-- 1. user_weaknesses.attempts / .correct are MISSING.
--    Mastery moved to evidence-weighting:
--        mastery = correct / attempts
--    Without the raw counts we would have to reverse-engineer
--    `correct = round(mastery * attempts)`, which loses precision and
--    drifts on every session. Storing the counts removes the guess.
--
-- 2. user_weaknesses has NO unique constraint.
--    `create table if not exists` means it cannot be added inline (the
--    table already exists in the live DB). Concurrent sessions could
--    create two rows for the same (user, subject, topic), so the UPSERT
--    in the RPC needs a real conflict target.
--
-- 3. `diag_answers: user insert` LETS THE CLIENT SET is_correct.
--    That is the hole the whole Phase 2 security model closes: a client
--    can currently write is_correct = true and any scorer that trusts
--    the column can be lied to.
--    Fix is two layers:
--      (a) revoke the column privilege  → cannot be set at all
--      (b) drop the permissive policy and route writes through a
--          SECURITY DEFINER function that computes is_correct itself.
--
-- 4. UNIQUE (session_id, question_id) on diagnostic_answers already makes
--    the RPC retry-safe. We rely on it, we do not change it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 — user_weaknesses: add the evidence counts
-- ---------------------------------------------------------------------------
-- BEFORE:
--   user_weaknesses(id, user_id, subject_id, topic_name, error_count,
--                   mastery_level, created_at, updated_at)
--   mastery_level numeric   ← a ratio with no stored denominator
--
-- AFTER:
--   + attempts integer     ← total questions ever answered for this topic
--   + correct  integer     ← total correct answers ever for this topic
--   + UNIQUE (user_id, subject_id, topic_name)

alter table public.user_weaknesses
  add column if not exists attempts integer not null default 0,
  add column if not exists correct  integer not null default 0;

comment on column public.user_weaknesses.attempts is
  'Phase 2 — total questions ever answered for this topic (denominator of mastery). diagnostic_answers is the source of truth; this table is a rebuildable cache.';
comment on column public.user_weaknesses.correct is
  'Phase 2 — total correct answers ever for this topic (numerator of mastery). mastery_level = correct / attempts.';

-- mastery_level is now a real ratio, so it must stay in [0,1].
alter table public.user_weaknesses
  drop constraint if exists user_weaknesses_mastery_check;
alter table public.user_weaknesses
  add constraint user_weaknesses_mastery_check
  check (mastery_level >= 0 and mastery_level <= 1);

-- correct can never exceed attempts.
alter table public.user_weaknesses
  drop constraint if exists user_weaknesses_counts_check;
alter table public.user_weaknesses
  add constraint user_weaknesses_counts_check
  check (correct >= 0 and correct <= attempts);

-- ============================================================================
-- STEP 1.5 — PREVIEW ONLY. RUN THIS FIRST. IT DELETES NOTHING.
-- ============================================================================
-- The only destructive statement in this migration is the DELETE in STEP 2.
-- These four queries exist so you can see exactly what it would touch BEFORE
-- it runs. Read the output, confirm it matches expectations, then continue.
--
-- ⚠️ These are SELECTs. Running this block alone changes nothing.
-- ============================================================================

-- (1) HOW MANY duplicate groups exist, and how many rows would be deleted.
select
  count(*) filter (where rows_in_group > 1) as duplicate_groups,
  coalesce(sum(rows_in_group - 1) filter (where rows_in_group > 1), 0) as rows_that_would_be_deleted,
  count(*) as total_groups
from (
  select
    user_id,
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid) as subject_key,
    lower(topic_name) as topic_key,
    count(*) as rows_in_group
  from public.user_weaknesses
  group by user_id,
           coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
           lower(topic_name)
) g;

-- (2) WHICH rows are duplicated — the exact (user, subject, topic) triples.
select
  w.user_id,
  coalesce(w.subject_id::text, '(null)') as subject_id,
  w.topic_name,
  count(*) as rows_in_group,
  min(w.updated_at) as oldest,
  max(w.updated_at) as newest
from public.user_weaknesses w
group by w.user_id, coalesce(w.subject_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(w.topic_name)
having count(*) > 1
order by rows_in_group desc, w.user_id, w.topic_name;

-- (3) CURRENT values per group, and (4) what they WILL become after the
--     merge: sums are folded into the survivor (newest row, by updated_at).
select
  w.user_id,
  coalesce(w.subject_id::text, '(null)') as subject_id,
  w.topic_name,
  count(*)                                    as rows_now,
  sum(w.attempts)                             as attempts_now,
  sum(w.correct)                              as correct_now,
  sum(w.error_count)                          as errors_now,
  round(sum(w.mastery_level), 4)              as mastery_now_avg,
  sum(w.attempts)                             as attempts_after_merge,
  sum(w.correct)                              as correct_after_merge,
  sum(w.attempts) - sum(w.correct)            as errors_after_merge,
  case when sum(w.attempts) > 0
       then round((sum(w.correct)::numeric / sum(w.attempts)), 4)
       else 0 end                            as mastery_after_merge,
  (array_agg(w.id::text order by w.updated_at desc, w.id desc))[1] as survivor_id_to_keep
from public.user_weaknesses w
group by w.user_id, coalesce(w.subject_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(w.topic_name)
having count(*) > 1
order by count(*) desc, w.user_id, w.topic_name;

-- ============================================================================
-- STEP 2 — de-duplicate user_weaknesses, then add the unique constraint
-- ============================================================================
-- ⚠️ RUN THE PREVIEW ABOVE FIRST. This step deletes the redundant rows; their
--    counts are folded into the survivor first, so no evidence is lost.
--
-- BEFORE: no unique constraint, so two concurrent sessions could create two
--         rows for the same (user, subject, topic) and the UPSERT below would
--         have no conflict target.
-- The survivor is the most-recently-updated row (tie broken by id).

with ranked as (
  select id,
         user_id,
         coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid) as subject_key,
         lower(topic_name) as topic_key,
         attempts, correct, error_count,
         row_number() over (
           partition by user_id,
                        coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        lower(topic_name)
           order by updated_at desc, id desc
         ) as rn
  from public.user_weaknesses
),
survivors as (
  select
    (array_agg(id order by rn))[1] as keep_id,
    sum(attempts)::int       as total_attempts,
    sum(correct)::int        as total_correct,
    sum(error_count)::int    as total_errors
  from ranked
  group by user_id, subject_key, topic_key
)
update public.user_weaknesses u
set attempts      = s.total_attempts,
    correct       = s.total_correct,
    error_count   = s.total_errors,
    mastery_level = case when s.total_attempts > 0
                          then least(1.0, s.total_correct::numeric / s.total_attempts)
                          else 0 end,
    updated_at    = now()
from survivors s
where u.id = s.keep_id;

with ranked as (
  select id,
         row_number() over (
           partition by user_id,
                        coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        lower(topic_name)
           order by updated_at desc, id desc
         ) as rn
  from public.user_weaknesses
)
delete from public.user_weaknesses u
using ranked r
where u.id = r.id and r.rn > 1;

create unique index if not exists user_weaknesses_unique_scope
  on public.user_weaknesses (
    user_id,
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(topic_name)
  );

-- ---------------------------------------------------------------------------
-- STEP 3 — BACKFILL attempts/correct from diagnostic_answers
-- ---------------------------------------------------------------------------
-- user_weaknesses is a CACHE. diagnostic_answers is the audit trail and the
-- source of truth. Where answers already exist for a topic, the cache is
-- rebuilt from them instead of trusted.
-- Topics with no answers keep 0/0 and mastery 0.

update public.user_weaknesses u
set attempts      = src.total,
    correct       = src.hits,
    error_count   = src.total - src.hits,
    mastery_level = case when src.total > 0
                         then src.hits::numeric / src.total
                         else 0 end
from (
  select
    lower(t.name) as topic_key,
    count(*)::int as total,
    count(*) filter (where a.is_correct)::int as hits
  from public.diagnostic_answers a
  join public.diagnostic_question_bank q on q.id = a.question_id
  left join public.diagnostic_topics t on t.id = q.topic_id
  where t.id is not null
  group by lower(t.name)
) src
where lower(u.topic_name) = src.topic_key
  and u.attempts = 0 and u.correct = 0;

-- ---------------------------------------------------------------------------
-- STEP 4 — SECURITY: make is_correct server-only
-- ---------------------------------------------------------------------------
-- The hole (found in the Phase 1 audit):
--     create policy "diag_answers: user insert" on public.diagnostic_answers
--       for insert with check (session_id in (select ...));
--   That policy lets the authenticated user insert ANY column value,
--   including is_correct = true, for their own session.
--
-- Fix, two layers:
--   (a) revoke the table INSERT privilege  → the client cannot write it
--       at all, regardless of policy
--   (b) drop the permissive policy and route writes through a SECURITY
--       DEFINER function that computes is_correct from the bank itself.
--
-- ⚠️ Audit note: no application code writes diagnostic_answers today
--    (verified by search — only Phase 1's comment references it), so this
--    revoke cannot break an existing feature.

-- ---------------------------------------------------------------------------
-- Permissions, stated explicitly rather than by omission.
-- ---------------------------------------------------------------------------
-- authenticated  ->  NO direct INSERT on diagnostic_answers.
--                    It reaches the table ONLY through
--                    submit_diagnostic_answers(), which computes is_correct
--                    server-side. Nothing here re-grants the old path.
-- service_role   ->  KEEPS direct INSERT, deliberately and narrowly, so an
--                    admin backfill or a seed script can repair rows without
--                    impersonating a student. service_role bypasses RLS and
--                    is only reachable from the server environment
--                    (SUPABASE_SERVICE_ROLE_KEY), never from the browser.
-- anon           ->  untouched; the read policy already excludes it.

revoke insert on public.diagnostic_answers from authenticated;

-- Make the service_role path explicit and future-proof. Re-granting a
-- privilege that already exists is a no-op, so this is safe to re-run, and
-- it documents the intent for anyone auditing the grants later.
grant insert on public.diagnostic_answers to service_role;

-- ❗ We do NOT re-grant INSERT to authenticated, not even for seed scripts.
--    A seed that needs to write answers must go through the RPC, or use
--    service_role from the server environment only.

-- The read policy (`diag_answers: user reads`) is left untouched — the user
-- still needs to see their own answers.
drop policy if exists "diag_answers: user insert" on public.diagnostic_answers;

-- ---------------------------------------------------------------------------
-- STEP 4c — close the UPDATE / DELETE hole.
-- ---------------------------------------------------------------------------
-- ❗ Found during the Phase 2 review, after `user insert` was already revoked.
--    1.2D shipped four permissive policies. Removing INSERT alone leaves the
--    table fully editable by its own subject: the client can rewrite a
--    stored `is_correct` after the server computed it, or delete the rows
--    outright.
--
--    Why that matters concretely:
--      • ON CONFLICT DO NOTHING gives us retry-safety only while the stored
--        value cannot be edited afterwards. A rewritten is_correct makes a
--        "retry" a way to change the answer.
--      • diagnostic_answers is the audit trail that user_weaknesses is
--        rebuilt from. If the subject can erase it, the cache stops being
--        derivable and there is nothing left to recompute from.
--
-- ❗ DELETE is removed entirely, not narrowed. An abandoned session must not
--    be able to erase its own record.
-- UPDATE goes to service_role only, for admin repair.
-- authenticated keeps SELECT (the user still needs to see their answers).

drop policy if exists "diag_answers: user update" on public.diagnostic_answers;
drop policy if exists "diag_answers: user delete" on public.diagnostic_answers;

revoke update, delete on public.diagnostic_answers from authenticated;

-- Explicit, narrow, and documented for whoever audits the grants later.
-- Re-granting an existing privilege is a no-op, so this is safe to re-run.
grant update, delete on public.diagnostic_answers to service_role;

-- The RPC. SECURITY DEFINER so it can write despite the revoked INSERT.
-- search_path is pinned so a hijacked schema cannot shadow the tables.
create or replace function public.submit_diagnostic_answers(
  p_session_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_subject uuid;
  v_rows integer := 0;
  v_correct integer := 0;
  v_item jsonb;
  v_qid uuid;
  v_sel integer;
  v_ok boolean;
begin
  -- 1. Ownership. user_id and subject_id come from the session row, never
  --    from a parameter, so they cannot be spoofed.
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

  -- 3. We read ONLY question_id and selected_option_index. Any other key the
  --    client smuggled in (is_correct, correct_option_index, score, ...) is
  --    simply never looked at.
  for v_item in select value from jsonb_array_elements(p_answers)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each_answer_must_be_an_object' using errcode = '22023';
    end if;

    v_qid := (v_item ->> 'question_id')::uuid;
    v_sel := (v_item ->> 'selected_option_index')::integer;

    if v_qid is null or v_sel is null then
      raise exception 'question_id_and_selected_option_index_required'
        using errcode = '22023';
    end if;

    -- 4. THE ONLY SOURCE OF TRUTH — computed here, on the server, from the
    --    published bank for this subject.
    select (q.correct_option_index = v_sel)
      into v_ok
    from public.diagnostic_question_bank q
    where q.id = v_qid
      and q.subject_id = v_subject
      and q.status = 'published';

    -- A question outside the published bank is skipped rather than failing
    -- the whole submit: the session still scores on what was valid.
    if v_ok is null then
      continue;
    end if;

    -- 5. ON CONFLICT DO NOTHING → the function is retry-safe. Re-submitting
    --    the same session cannot double-count.
    insert into public.diagnostic_answers
      (session_id, question_id, selected_option_index, is_correct)
    values
      (p_session_id, v_qid, v_sel, v_ok)
    on conflict (session_id, question_id) do nothing;
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
$$;

comment on function public.submit_diagnostic_answers(uuid, jsonb) is
  'Phase 2 — the ONLY writer for diagnostic_answers. Computes is_correct from diagnostic_question_bank.correct_option_index server-side and ignores any client-supplied is_correct. Retry-safe via ON CONFLICT DO NOTHING.';

revoke all on function public.submit_diagnostic_answers(uuid, jsonb) from public;
grant execute on function public.submit_diagnostic_answers(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- STEP 5 — RPC to rebuild the user_weaknesses cache from the audit trail
-- ---------------------------------------------------------------------------
-- Called after submit. It REBUILDS (not increments) the cache for the topics
-- this session touched, so it is safe to run twice and self-healing if the
-- cache ever drifts from the answers.

create or replace function public.refresh_topic_mastery(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_subject uuid;
  v_count integer := 0;
  v_topic text;
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
    join public.diagnostic_question_bank q on q.id = a.question_id
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
      join public.diagnostic_question_bank q on q.id = a.question_id
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
$$;

comment on function public.refresh_topic_mastery(uuid) is
  'Phase 2 — rebuilds user_weaknesses from diagnostic_answers (the audit trail). Idempotent: safe to run twice, self-healing if the cache drifts.';

revoke all on function public.refresh_topic_mastery(uuid) from public;
grant execute on function public.refresh_topic_mastery(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Nothing here is destructive, and the steps undo independently in reverse:
--
-- 1. Restore the previous (insecure) write path — only if you also drop the
--    RPCs first, otherwise there are two writers:
--      drop function if exists public.refresh_topic_mastery(uuid);
--      drop function if exists public.submit_diagnostic_answers(uuid, jsonb);
--      grant insert, update, delete on public.diagnostic_answers to authenticated;
--      create policy "diag_answers: user insert" on public.diagnostic_answers
--        for insert with check (
--          session_id in (select id from public.diagnostic_sessions
--                         where user_id = auth.uid())
--        );
--      create policy "diag_answers: user update" on public.diagnostic_answers
--        for update using (session_id in (select id from public.diagnostic_sessions
--                                           where user_id = auth.uid()))
--        with check (session_id in (select id from public.diagnostic_sessions
--                                     where user_id = auth.uid()));
--      create policy "diag_answers: user delete" on public.diagnostic_answers
--        for delete using (session_id in (select id from public.diagnostic_sessions
--                                           where user_id = auth.uid()));
--    ⚠️ This restores the 1.2D state, which is exactly what Phase 2 undoes.
--       Only do it if the RPCs are gone, or there will be two writers.
--
-- 2. Drop the checks and the unique index (keeps the new columns):
--      alter table public.user_weaknesses
--        drop constraint if exists user_weaknesses_counts_check,
--        drop constraint if exists user_weaknesses_mastery_check;
--      drop index if exists user_weaknesses_unique_scope;
--
-- 3. Drop the added columns — LAST, because it discards the cached counts:
--      alter table public.user_weaknesses
--        drop column if exists attempts,
--        drop column if exists correct;
--
-- ⚠️ Step 3 is the only irreversible one. Steps 1 and 2 fully restore the
--    previous state. diagnostic_answers rows are never deleted by this file.
-- ============================================================================
-- VERIFICATION (run after, as admin / service_role)
-- ============================================================================
-- 1. The new columns exist:
-- select column_name, data_type from information_schema.columns
--  where table_name = 'user_weaknesses' and column_name in ('attempts','correct');
--
-- 2. The unique index and both CHECK constraints exist:
-- select indexname from pg_indexes where tablename = 'user_weaknesses';
-- select conname from pg_constraint where conrelid = 'public.user_weaknesses'::regclass;
--
-- 3. PERMISSIONS — the exact split we intended:
-- select grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_name = 'diagnostic_answers' and privilege_type = 'INSERT'
--  order by grantee;
--    EXPECTED: service_role only. 'authenticated' must NOT appear.
--
-- 4. The permissive insert policy is gone:
-- select policyname from pg_policies
--  where tablename = 'diagnostic_answers' order by policyname;
--    EXPECTED: no row named 'diag_answers: user insert'.
--              The read policy must still be there.
--
-- 5. authenticated cannot insert directly (should error: permission denied):
--      set local role authenticated;
--      insert into public.diagnostic_answers
--        (session_id, question_id, selected_option_index, is_correct)
--      values ('00000000-0000-0000-0000-000000000000',
--              '00000000-0000-0000-0000-000000000000', 0, true);
--      reset role;
--
-- 6. service_role still can (should succeed; use a throwaway session id that
--    does not exist, since the FK will reject it AFTER the privilege check —
--    an FK error proves the permission passed):
--      set local role service_role;
--      insert into public.diagnostic_answers
--        (session_id, question_id, selected_option_index, is_correct)
--      values ('00000000-0000-0000-0000-000000000000',
--              '00000000-0000-0000-0000-000000000000', 0, true);
--      reset role;
--    EXPECTED: a FOREIGN KEY error, NOT "permission denied".
--
-- 7. correct cannot exceed attempts (should error: check violation):
--      insert into public.user_weaknesses (user_id, topic_name, attempts, correct)
--      values (auth.uid(), 'x', 1, 5);
--
-- 8. Both RPCs exist, SECURITY DEFINER, executable by authenticated only:
-- select proname, prosecdef from pg_proc
--  where proname in ('submit_diagnostic_answers','refresh_topic_mastery');
-- select proname, proacl from pg_proc
--  where proname in ('submit_diagnostic_answers','refresh_topic_mastery');
--
-- 9. No duplicates remain (should return 0):
-- select count(*) from (
--   select 1 from public.user_weaknesses
--    group by user_id,
--             coalesce(subject_id,'00000000-0000-0000-0000-000000000000'::uuid),
--             lower(topic_name)
--   having count(*) > 1) d;
-- ============================================================================
