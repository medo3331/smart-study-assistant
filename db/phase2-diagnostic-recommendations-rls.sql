-- ============================================================================
-- Phase 2 (follow-up) — recommendations are server-authored
-- ----------------------------------------------------------------------------
-- Split out of db/phase2-diagnostic-security.sql on purpose. That file had
-- already been applied to production before the live smoke test found these
-- two problems, so this is a separate migration: the repo must record what
-- actually happened rather than rely on an older file having covered it.
--
-- ════════════════════════════════════════════════════════════════════════════
-- BEFORE
-- ════════════════════════════════════════════════════════════════════════════
-- Two things were wrong, both found by scripts/smoke-test-diagnostic-live.mjs
-- against the real database.
--
-- 1. SCHEMA DRIFT. db/diagnostic-1.2e-study-plan-integration.sql declares a
--    column `content_refs jsonb`. The table that actually exists in
--    production has none of that. Its real columns are:
--        source_content_type  text     default 'none'
--        source_content_id    uuid
--        source_content_title text
--    The route was writing content_refs, and PostgREST answered:
--        PGRST204 Could not find the 'content_refs' column
--    so /api/diagnostic/submit returned 202 and no recommendation row was
--    ever stored. The first live run passed 42/45 with all three failures
--    tracing back to this.
--
--    We are NOT adding content_refs to the table. The live schema is the
--    truth; the migration file is the stale artefact. The route was corrected
--    to write source_content_type instead.
--
-- 2. RLS OPEN TO EVERYONE. The table carried:
--        "diag_recs: user insert"  INSERT  roles = {public}
--    Role PUBLIC includes anon. Anyone who guessed a session_id could author
--    a recommendation. A recommendation is an OUTPUT of scoring, not an
--    input: the client never needs to write one.
--
--    AFTER, the grants are:
--        SELECT   → the owner, through the session row
--        INSERT   → nobody
--        UPDATE   → nobody
--        DELETE   → nobody
--        writes   → public.write_diagnostic_recommendations(), SECURITY
--                    DEFINER, invoked from the server route only
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY AN RPC INSTEAD OF A POSTGREST UPSERT
-- ════════════════════════════════════════════════════════════════════════════
-- An upsert would have needed UPDATE for authenticated to work on rows that
-- already exist. Granting that reopens the audit trail for no reason, and it
-- contradicts the model already applied to diagnostic_answers. Instead the
-- write lives in a SECURITY DEFINER function carrying
-- ON CONFLICT (session_id, weak_topic) DO NOTHING, so an internal replay
-- still cannot duplicate a row. Idempotency comes from the database, not
-- from an extra privilege.
--
-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after, as admin)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. No write privilege for anon or authenticated:
--    select grantee, privilege_type
--      from information_schema.role_table_grants
--     where table_name = 'diagnostic_recommendations'
--       and privilege_type in ('INSERT','UPDATE','DELETE')
--     order by grantee;
--    EXPECTED: postgres + service_role only.
--              'anon' and 'authenticated' MUST NOT appear.
--
-- 2. Policies: no INSERT, owner-scoped SELECT:
--    select policyname, cmd, roles::text from pg_policies
--     where tablename = 'diagnostic_recommendations' order by policyname;
--    EXPECTED: 'diag_recs: admin manage' (ALL) and 'diag_recs: user reads'
--              (SELECT). No INSERT policy.
--
-- 3. The writer exists and is SECURITY DEFINER:
--    select proname, prosecdef from pg_proc
--     where proname = 'write_diagnostic_recommendations';
--    EXPECTED: one row, prosecdef = true.
--
-- 4. The function is granted to authenticated only:
--    select proname, proacl from pg_proc
--     where proname = 'write_diagnostic_recommendations';
--
-- 5. Negative control — authenticated cannot write (permission denied):
--      set local role authenticated;
--      insert into public.diagnostic_recommendations
--        (session_id, weak_topic) values (gen_random_uuid(), 'x');
--      reset role;
--
-- 6. Negative control — anon cannot write (permission denied):
--      set local role anon;
--      insert into public.diagnostic_recommendations
--        (session_id, weak_topic) values (gen_random_uuid(), 'x');
--      reset role;
--
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- Fully reversible; nothing here destroys data.
--
--   drop function if exists public.write_diagnostic_recommendations(uuid, jsonb);
--
--   drop policy if exists "diag_recs: user reads"
--     on public.diagnostic_recommendations;
--   create policy "diag_recs: user reads"
--     on public.diagnostic_recommendations
--     for select using (true);   -- ⚠️ the old broad read
--
--   create policy "diag_recs: user insert"
--     on public.diagnostic_recommendations
--     for insert with check (true);   -- ⚠️ the old hole
--   grant insert on public.diagnostic_recommendations to authenticated;
--
-- ⚠️ Rolling back restores the open INSERT, which is what the smoke test
--    found. Only do it to unblock an incident, and re-apply afterwards.
--
-- ⚠️ The recommendations table itself is untouched: no column is added,
--    dropped or retyped, and no row is deleted by this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 4e — recommendations are server-authored, client read-only
-- ---------------------------------------------------------------------------
-- ❗ Found by the Phase 2 live smoke test. Two problems:
--
--    1. The migration in db/diagnostic-1.2e-study-plan-integration.sql declares
--       a column `content_refs jsonb`, but the table that actually exists in
--       production has source_content_type / source_content_id /
--       source_content_title instead. The route was writing content_refs and
--       PostgREST answered PGRST204. We are NOT "fixing" the table to match the
--       stale migration -- the live schema is the truth.
--
--    2. "diag_recs: user insert" was granted to {public}, i.e. role PUBLIC,
--       which includes anon. A recommendation is an OUTPUT of scoring, not an
--       input: the client has no business writing one.
--
-- So: the client may read its own recommendations, and nothing else. The
-- write moves into a SECURITY DEFINER function, the same shape as
-- submit_diagnostic_answers and refresh_topic_mastery.

-- 2a) Remove the public INSERT path.
drop policy if exists "diag_recs: user insert" on public.diagnostic_recommendations;
revoke insert, update, delete on public.diagnostic_recommendations from public, anon, authenticated;

-- Owner-only reads stay. Re-asserted with authenticated explicitly rather than
-- relying on whatever role PUBLIC the original policy was written against.
drop policy if exists "diag_recs: user reads" on public.diagnostic_recommendations;
create policy "diag_recs: user reads"
  on public.diagnostic_recommendations
  for select
  using (
    session_id in (select id from public.diagnostic_sessions where user_id = auth.uid())
  );

-- 2b) The writer. Idempotent by construction: UNIQUE(session_id, weak_topic)
--     plus ON CONFLICT DO NOTHING, so a replay cannot duplicate a row. It
--     also validates ownership from the session row, so nobody can write
--     recommendations onto somebody else's session.
create or replace function public.write_diagnostic_recommendations(
  p_session_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_rows integer := 0;
  v_item jsonb;
begin
  select s.user_id into v_user
  from public.diagnostic_sessions s
  where s.id = p_session_id and s.user_id = auth.uid();

  if v_user is null then
    raise exception 'session_not_found_or_not_yours'
      using errcode = 'no_data_found';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items_must_be_an_array' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each_item_must_be_an_object' using errcode = '22023';
    end if;

    -- We read only these four keys. accuracy and priority are recomputed
    -- server-side; a client-supplied value is simply never looked at.
    insert into public.diagnostic_recommendations (
      session_id,
      weak_topic,
      accuracy,
      content_available,
      source_content_type,
      recommendation_text,
      priority
    )
    values (
      p_session_id,
      (v_item ->> 'weak_topic'),
      (v_item ->> 'accuracy')::numeric,
      coalesce((v_item ->> 'content_available')::boolean, false),
      coalesce(v_item ->> 'source_content_type', 'none'),
      v_item ->> 'recommendation_text',
      coalesce(v_item ->> 'priority', 'medium')
    )
    on conflict (session_id, weak_topic) do nothing;
  end loop;

  select count(*) into v_rows
  from public.diagnostic_recommendations
  where session_id = p_session_id;

  return jsonb_build_object('recommendations_stored', v_rows);
end;
$$;

comment on function public.write_diagnostic_recommendations(uuid, jsonb) is
  'Phase 2 — the ONLY writer for diagnostic_recommendations. Server-authored output of scoring; the client may read its own but never write. Idempotent via ON CONFLICT (session_id, weak_topic) DO NOTHING.';

revoke all on function public.write_diagnostic_recommendations(uuid, jsonb) from public;
grant execute on function public.write_diagnostic_recommendations(uuid, jsonb) to authenticated;

