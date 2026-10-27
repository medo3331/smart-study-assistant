-- ============================================================================
-- Phase 5-C1 (MANUAL RUN) -- ai_usage_events
-- ============================================================================
-- SHADOW ONLY: rows are written here, nothing is enforced.
-- Goal: measure real usage BEFORE any pricing decision.
--
-- WHY A NEW TABLE (not a column on ai_credit_ledger):
--   ai_credit_ledger  = balance movement (reserve / refund / grant / adjust)
--   ai_usage_events   = what actually happened at each AI call
--   One ledger row  = ONE reservation.
--   We need N rows per logical request (one per provider attempt).
--   Merging them breaks the ledger unique constraint.
--
-- WHY unique = (user_id, idempotency_key, attempt_no):
--   A correction on the 5-B design. "unique (user_id, idempotency_key)"
--   alone would be WRONG: one request produces N attempts sharing the same
--   idempotency_key, so attempt 1+ would violate the constraint and we would
--   lose shadow events.
--   Same (key + attempt number) may be written ONCE. That gives real
--   idempotency: a re-sent row after a network glitch is ignored.
--
-- WHY read-only RLS:
--   All writes come from the server (service_role bypasses RLS).
--   A user may read only their own events (for a future "your usage" screen).
--   Nobody can UPDATE or DELETE an event.
--   Admin reads through a direct Postgres connection (lib/admin/pg.ts).
--
-- idempotent: CREATE TABLE IF NOT EXISTS + guarded indexes/policies.
-- additive: does NOT touch ai_credit_ledger or any other existing table.
-- ============================================================================

create table if not exists public.ai_usage_events (
  id                uuid primary key default gen_random_uuid(),

  -- Owner of the usage -- NULLABLE ON PURPOSE.
  --   user_id = <uuid>  -> signed-in user
  --   user_id = NULL    -> anonymous / demo (e.g. /api/demo)
  --
  -- Why nullable: the worst finding in Phase 5-C0 was that /api/demo has no
  -- guard at all. Making this NOT NULL would lose exactly the evidence we
  -- need to justify fixing it later. The demo does not enter billing in this
  -- phase -- its rows are feature=demo, guard=none, billing=none, units=0.
  --
  -- NO IP address, NO session id, NO visitor identifier is stored. We do not
  -- track people without an account. Only provider/model/status, which are
  -- required for diagnostics.
  --
  -- The FK works normally on a nullable column: NULL never triggers it, and
  -- deleting an account cascades its rows away.
  user_id           uuid references auth.users (id) on delete cascade,

  -- Groups every attempt belonging to the same logical request.
  -- A lecture with 20 chunks = 20 rows sharing one operation_id.
  -- NULL means "unknown" (rare) and is not a reason to skip recording.
  operation_id      uuid,

  -- Idempotency key for this logical request.
  -- Supplied by the caller: either the client's Idempotency-Key header, or a
  -- server UUID generated ONCE at the request boundary and reused for every
  -- attempt of that request.
  idempotency_key   text not null,

  -- Attempt index within the same logical request (0 = first, 1 = fallback...).
  -- This is what distinguishes "fallback succeeded" from "fallback failed":
  -- both share the idempotency_key and differ only by attempt_no.
  attempt_no        int not null default 0,

  -- Feature name: chat / goal / lecture_summary / demo / ...
  -- This is what lets Admin answer "who is burning the AI budget?".
  feature           text not null,

  -- Provider and model that actually ran. Nullable on purpose.
  provider          text,
  model             text,

  -- Attempt status. The values deliberately separate "no cost" from "real":
  --   completed             = provider returned a usable response
  --   failed_no_response    = failed before any response (429 / timeout / 5xx)
  --   failed_after_response = provider responded, result unusable or empty
  --   error                 = unexpected error before reaching the provider
  --   skipped               = no request was ever sent
  status            text not null default 'completed'
                      check (status in ('completed','failed_no_response',
                                        'failed_after_response','error','skipped')),

  -- Units consumed by this attempt. Default 1 for every real provider attempt.
  -- /api/demo = 0, because we explicitly agreed it does not enter billing in
  -- this phase. Phase 5-C5 will later decide whether a failed attempt should
  -- count toward billable units; this table only records the evidence.
  units             int not null default 1 check (units >= 0),

  -- Token counts, recorded only when the provider actually returns them.
  -- NEVER estimated: a guessed token count would poison future pricing.
  prompt_tokens     int,
  completion_tokens int,

  -- Wall-clock duration of this attempt in milliseconds (diagnostics only).
  latency_ms        int,

  -- Extra diagnostic detail (guard outcome, HTTP status, reason code...).
  -- C2 sanitizes this before writing: no prompts, no transcripts, no secrets.
  metadata          jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),

  -- The real idempotency constraint (see note at the top of the file).
  --
  -- LIMITATION with user_id = NULL:
  --   In PostgreSQL NULL is distinct from NULL inside a unique constraint, so
  --   two anonymous rows with the same key do NOT collide and the dedupe does
  --   NOT hold for guests.
  --   This is acceptable during shadow: we are measuring, not enforcing, so a
  --   duplicate row does not change a decision. Real enforcement later would
  --   require a genuine anonymous session id -- which we are NOT faking now,
  --   and we still store no IP or cookie.
  --   For signed-in users the dedupe works 100%.
  constraint ai_usage_events_idem_attempt_key
    unique (user_id, idempotency_key, attempt_no)
);

-- === INDEXES ===
-- Primary: "a user's most recent usage" + the future usage screen.
create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

-- Analytics: "who is burning the AI budget?" -- Admin's first question.
create index if not exists ai_usage_events_feature_created_idx
  on public.ai_usage_events (feature, created_at desc);

-- Analytics: cost/failure rate per provider.
create index if not exists ai_usage_events_provider_created_idx
  on public.ai_usage_events (provider, created_at desc)
  where provider is not null;

-- Diagnostics: "how many attempts did this request actually take?"
create index if not exists ai_usage_events_operation_idx
  on public.ai_usage_events (operation_id)
  where operation_id is not null;

-- === RLS ===
alter table public.ai_usage_events enable row level security;

do $$
begin
  -- A user may read their own events only.
  drop policy if exists "ai_usage_events: owner reads" on public.ai_usage_events;
end $$;

create policy "ai_usage_events: owner reads"
  on public.ai_usage_events
  for select
  using (auth.uid() = user_id);

-- NO insert/update/delete policy -- on purpose.
-- All writes come from the server via service_role.
-- An insert policy would let any user forge usage events for themselves and
-- corrupt the analytics that later pricing decisions depend on.

-- ANON SAFETY: with "using (auth.uid() = user_id)" and a row whose
-- user_id = NULL, the comparison yields NULL, not TRUE. So those rows are NOT
-- visible to any signed-in user. This is intended: demo data stays reachable
-- only by service_role and the Admin, nobody else.

comment on table public.ai_usage_events is
  'Phase 5-C1 -- shadow log of real AI usage per provider attempt. No enforcement in this phase; ai_credit_ledger remains the source of balance/reservations.';

comment on column public.ai_usage_events.units is
  'Units consumed per attempt. Default 1; /api/demo = 0.';

comment on column public.ai_usage_events.idempotency_key is
  'Idempotency key of the logical request; shared by all its provider attempts.';

comment on column public.ai_usage_events.attempt_no is
  'Attempt index within the request: 0 = first, 1 = fallback.';

comment on column public.ai_usage_events.status is
  'completed | failed_no_response | failed_after_response | error | skipped.';

-- ============================================================================
-- REVIEW BEFORE RUNNING:
--   1) Fully additive -- no existing table or policy is modified.
--   2) Table starts empty; no backfill; no application behaviour change.
--   3) Safe to run more than once (idempotent).
--   4) The limits (10/3h vs 30/2h) and overdraft behaviour are UNCHANGED;
--      those decisions wait for real shadow data.
--
--   Verify after running:
--     select count(*) from public.ai_usage_events;
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--       where conrelid = 'public.ai_usage_events'::regclass;
-- ============================================================================