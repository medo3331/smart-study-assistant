-- ============================================================================
-- DRAFT — DO NOT EXECUTE
-- Sprint 2b.2 P1 — Student Memory Schema (design + migration draft ONLY)
-- ============================================================================
-- !!! FILE ONLY. DO NOT EXECUTE against any database without explicit,
-- !!! separate approval AND production read-only verification of both
-- !!! gates (see report §0.5). This draft was NOT executed in P1.
--
-- What this draft does (additive only, on public.ai_memories):
--   1. Adds provenance/lifecycle columns: layer, source, confidence,
--      language, subject_id, topic_key, conversation_id, evidence_ref,
--      created_at, last_used_at, expires_at, status. All nullable-or-
--      defaulted so legacy reads/writes keep working unchanged.
--   2. Widens the kind CHECK to the 6 legacy kinds + 6 new Layer-2 kinds.
--   3. Backfills every legacy row deterministically from (kind, value,
--      updated_at). NO row deletions, NO value rewrites.
--   4. Adds retrieval indexes and an atomic session-replace RPC.
--   5. Contains PRE-CHECK / VERIFICATION SELECTs (read-only) and a
--      commented ROLLBACK block.
--
-- What this draft does NOT do:
--   - Does NOT touch profiles, user_weaknesses, chat_conversations,
--     chat_messages, or any RLS policy text.
--   - Does NOT depend on db/36-chat-conversation-summary.sql in either
--     direction. conversation_id FK target (chat_conversations.id)
--     exists in the base schema (db/chat.sql) with or without column
--     `summary`.
--   - Does NOT promote legacy weak/mistake rows into facts. They become
--     `legacy_unknown`, low confidence, 90-day expiry — reconfirmed only
--     by the student or by diagnostic evidence in P2+.
--
-- File ordering note: base table is defined in db/ai-learning.sql.
-- This draft assumes that file has already been applied to the target.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PRE-CHECK (read-only — safe to run, changes nothing). These prove the
-- target is in the expected state BEFORE the ALTERs below are approved.
-- ----------------------------------------------------------------------------

-- 1) ai_memories exists?
-- select to_regclass('public.ai_memories') as ai_memories;

-- 2) Baseline row counts. Post-migration counts MUST match these exactly.
-- select count(*) as baseline_rows from public.ai_memories;
-- select kind, count(*) as n from public.ai_memories group by kind order by kind;

-- 3) Session-kind duplication check (pre-existing data may already hold
--    multiple recent_subject / recent_lesson rows per user from the P0
--    race). This reports them; it does NOT delete them.
-- select user_id, kind, count(*) as rows_per_user_kind
--   from public.ai_memories
--  where kind in ('recent_subject','recent_lesson')
--  group by user_id, kind
-- having count(*) > 1
--  order by rows_per_user_kind desc;

-- 4) Confirm Migration 36 independence: does chat_conversations.summary
--    exist? This draft is valid either way (see header).
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='chat_conversations'
--    and column_name='summary';


-- ============================================================================
-- STEP 1 — Additive columns (all nullable-or-defaulted)
-- ============================================================================

alter table public.ai_memories
  add column if not exists layer text,
  add column if not exists source text,
  add column if not exists confidence numeric(4,3),
  add column if not exists language text,
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists topic_key text,
  add column if not exists conversation_id uuid references public.chat_conversations(id) on delete set null,
  add column if not exists evidence_ref jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_used_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists status text not null default 'active';

-- New-column CHECK constraints (dropped + re-added so the file is re-runnable
-- and so a legacy row can never be rejected by a half-applied draft).

alter table public.ai_memories
  drop constraint if exists ai_memories_layer_check;
alter table public.ai_memories
  add constraint ai_memories_layer_check
  check (layer is null or layer in ('profile','behavior','progress_hint','conversation'));

alter table public.ai_memories
  drop constraint if exists ai_memories_source_check;
alter table public.ai_memories
  add constraint ai_memories_source_check
  check (source is null or source in (
    'explicit_student','confirmed_by_student','system_observed',
    'diagnostic_evidence','inferred_ai','legacy_unknown'));

alter table public.ai_memories
  drop constraint if exists ai_memories_confidence_check;
alter table public.ai_memories
  add constraint ai_memories_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table public.ai_memories
  drop constraint if exists ai_memories_language_check;
alter table public.ai_memories
  add constraint ai_memories_language_check
  check (language is null or language in ('ar','en','mixed'));

alter table public.ai_memories
  drop constraint if exists ai_memories_status_check;
alter table public.ai_memories
  add constraint ai_memories_status_check
  check (status in ('active','superseded','expired'));

-- created_at for rows that predate the column: best available timestamp.
update public.ai_memories
   set created_at = updated_at
 where created_at is null;


-- ============================================================================
-- STEP 2 — Widen the kind CHECK (legacy 6 + new Layer-2 kinds, §3 of report)
-- ============================================================================

alter table public.ai_memories
  drop constraint if exists ai_memories_kind_check;
alter table public.ai_memories
  add constraint ai_memories_kind_check
  check (kind in (
    -- Legacy (Sprint 2b.1 / P0) — kept for backward compatibility
    'weak_topic','preferred_style','recent_subject','recent_lesson',
    'completed_topic','common_mistake',
    -- New Layer-2 durable kinds — explicit/confirmed/evidence-gated only
    'explicit_style','example_domain','language_pref','goal_note',
    'misconception_note','interest_topic'
  ));

-- NOTE: the app-side whitelist (MEMORY_KINDS in app/api/ai/memory/route.ts)
-- must be widened in the SAME release as this migration, otherwise the API
-- will 400 on the new kinds while the DB would accept them. That code change
-- is P2 scope — deliberately NOT part of this draft.


-- ============================================================================
-- STEP 3 — Deterministic backfill of legacy rows (no deletions/rewrites)
-- ============================================================================
-- Rules (report §5):
--   recent_*      -> layer=conversation, source=system_observed, conf=1.0,
--                    expires = updated_at + 30 days
--   preferred_style -> layer=behavior, source=legacy_unknown, conf=0.5,
--                    expires = updated_at + 90 days
--   weak/mistake/completed -> layer=progress_hint, source=legacy_unknown,
--                    conf=0.3, expires = updated_at + 90 days
--   topic_key     -> lower(trim(value)) for every legacy row
--   subject_id / conversation_id / evidence_ref stay NULL (unknown, not guessed)

update public.ai_memories
   set layer   = case kind
                   when 'recent_subject' then 'conversation'
                   when 'recent_lesson'  then 'conversation'
                   when 'preferred_style' then 'behavior'
                   when 'weak_topic' then 'progress_hint'
                   when 'common_mistake' then 'progress_hint'
                   when 'completed_topic' then 'progress_hint'
                   else 'conversation'
                 end,
       source  = case kind
                   when 'recent_subject' then 'system_observed'
                   when 'recent_lesson'  then 'system_observed'
                   else 'legacy_unknown'
                 end,
       confidence = case kind
                      when 'recent_subject' then 1.0
                      when 'recent_lesson'  then 1.0
                      when 'preferred_style' then 0.5
                      else 0.3
                    end,
       topic_key  = lower(btrim(value)),
       expires_at = case kind
                      when 'recent_subject' then updated_at + interval '30 days'
                      when 'recent_lesson'  then updated_at + interval '30 days'
                      else updated_at + interval '90 days'
                    end
 where layer is null or source is null;


-- ============================================================================
-- STEP 4 — Indexes (CONCURRENTLY recommended at execution time; the flag is
-- deliberately left out of the draft body so a failed run never leaves an
-- INVALID index behind ambiguity — execution PR owner to add it)
-- ============================================================================

create index if not exists ai_memories_user_layer_updated_idx
  on public.ai_memories (user_id, layer, updated_at desc);

create index if not exists ai_memories_user_expires_idx
  on public.ai_memories (user_id, expires_at)
  where expires_at is not null;

create index if not exists ai_memories_user_subject_topic_idx
  on public.ai_memories (user_id, subject_id, topic_key);


-- ============================================================================
-- STEP 5 — Atomic session-replace RPC (the §0.4 race fix; app wiring in P2)
-- ============================================================================
-- SECURITY DEFINER with pinned search_path, mirroring
-- submit_diagnostic_answers / refresh_topic_mastery. Ownership is checked
-- against auth.uid() — p_user_id is NEVER trusted from the client.
-- Locking: per-user advisory xact lock serializes concurrent writers for
-- the same student (different users never block each other).

create or replace function public.replace_session_memories(
  p_user_id uuid,
  p_subject text,
  p_lesson text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'not_your_memory' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Replace, don't accumulate: one active session subject + lesson per user.
  delete from public.ai_memories
   where user_id = p_user_id
     and kind in ('recent_subject','recent_lesson');

  if p_subject is not null and btrim(p_subject) <> ''
     and btrim(p_subject) <> 'المادة الحالية' then
    insert into public.ai_memories
      (user_id, kind, value, updated_at, layer, source, confidence,
       topic_key, expires_at, status)
    values
      (p_user_id, 'recent_subject', left(btrim(p_subject), 300), now(),
       'conversation', 'system_observed', 1.0,
       lower(btrim(p_subject)), now() + interval '30 days', 'active')
    on conflict (user_id, kind, value) do update
       set updated_at = excluded.updated_at,
           expires_at = excluded.expires_at,
           status = 'active';
  end if;

  if p_lesson is not null and btrim(p_lesson) <> ''
     and btrim(p_lesson) <> 'الدرس الحالي' then
    insert into public.ai_memories
      (user_id, kind, value, updated_at, layer, source, confidence,
       topic_key, expires_at, status)
    values
      (p_user_id, 'recent_lesson', left(btrim(p_lesson), 300), now(),
       'conversation', 'system_observed', 1.0,
       lower(btrim(p_lesson)), now() + interval '30 days', 'active')
    on conflict (user_id, kind, value) do update
       set updated_at = excluded.updated_at,
           expires_at = excluded.expires_at,
           status = 'active';
  end if;
end;
$$;

comment on function public.replace_session_memories(uuid, text, text) is
  'Sprint 2b.2 P1 draft — atomic replace for session memories. One transaction, per-user advisory lock, ownership-checked via auth.uid(). Replaces the P0 delete->upsert race.';

revoke all on function public.replace_session_memories(uuid, text, text) from public;
grant execute on function public.replace_session_memories(uuid, text, text) to authenticated;

-- Expiration helper (called by a P2 cron/maintenance path, not on request).
create or replace function public.expire_stale_memories()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.ai_memories
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.expire_stale_memories() is
  'Sprint 2b.2 P1 draft — flips active rows past expires_at to expired. Retrieval also filters by expires_at, so this is maintenance, not a correctness gate.';

revoke all on function public.expire_stale_memories() from public;
-- Deliberately NOT granted to authenticated: run via service_role/cron only.

-- RLS is unchanged by design. The four owner-only policies from
-- db/ai-learning.sql remain the access gate; the RPCs above enforce
-- ownership explicitly before touching rows.


-- ----------------------------------------------------------------------------
-- VERIFICATION (read-only — run after, to prove the draft did what it says)
-- ----------------------------------------------------------------------------

-- 1) Row count unchanged by migration? Compare against PRE-CHECK baseline.
-- select count(*) as rows_after from public.ai_memories;

-- 2) Every legacy row now carries layer/source/confidence?
-- select count(*) as unbackfilled from public.ai_memories
--  where layer is null or source is null or confidence is null;

-- 3) Backfill distribution (review against §5 expectations).
-- select layer, source, kind, count(*) as n
--   from public.ai_memories group by layer, source, kind
--  order by layer, source, kind;

-- 4) New columns/indexes/RPCs exist?
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='ai_memories'
--  order by ordinal_position;
-- select indexname from pg_indexes
--  where schemaname='public' and tablename='ai_memories';
-- select proname, prosecdef from pg_proc
--  where proname in ('replace_session_memories','expire_stale_memories');

-- 5) RLS still owner-only (should show the 4 legacy policies, unchanged).
-- select policyname, cmd from pg_policies
--  where schemaname='public' and tablename='ai_memories' order by policyname;


-- ============================================================================
-- ROLLBACK (commented — execute in reverse order ONLY if the draft was
-- actually applied and P2 explicitly approves reverting it)
-- ============================================================================

-- drop function if exists public.expire_stale_memories();
-- drop function if exists public.replace_session_memories(uuid, text, text);
-- drop index if exists public.ai_memories_user_subject_topic_idx;
-- drop index if exists public.ai_memories_user_expires_idx;
-- drop index if exists public.ai_memories_user_layer_updated_idx;
--
-- -- Restore the 6-kind CHECK (safe only if no new-kind rows exist — verify:
-- -- select count(*) from public.ai_memories
-- --  where kind in ('explicit_style','example_domain','language_pref',
-- --                 'goal_note','misconception_note','interest_topic');
-- alter table public.ai_memories drop constraint if exists ai_memories_kind_check;
-- alter table public.ai_memories
--   add constraint ai_memories_kind_check check (kind in (
--     'weak_topic','preferred_style','recent_subject','recent_lesson',
--     'completed_topic','common_mistake'));
--
-- alter table public.ai_memories
--   drop column if exists status,
--   drop column if exists expires_at,
--   drop column if exists last_used_at,
--   drop column if exists created_at,
--   drop column if exists evidence_ref,
--   drop column if exists conversation_id,
--   drop column if exists topic_key,
--   drop column if exists subject_id,
--   drop column if exists language,
--   drop column if exists confidence,
--   drop column if exists source,
--   drop column if exists layer;
--
-- After rollback the table is byte-equivalent to the P0 schema:
-- legacy columns, PK (user_id,kind,value), RLS policies, and the
-- (user_id, updated_at desc) index are never touched by this draft.

-- ============================================================================
-- END OF DRAFT — DO NOT EXECUTE WITHOUT SEPARATE APPROVAL
-- ============================================================================
