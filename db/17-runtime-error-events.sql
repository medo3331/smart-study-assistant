-- ============================================================================
-- Phase 2C (MANUAL RUN) -- runtime_error_events
-- ============================================================================
-- Persistent, read-only runtime error monitoring.
-- Shadow/diagnostic only: does not change quotas, credits, subscriptions.
-- Admin reads through direct Postgres connection (lib/admin/pg.ts).
-- ============================================================================

create table if not exists public.runtime_error_events (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),

  -- Where the error happened (route path or feature name).
  route              text not null,
  feature            text,

  -- Classification.
  error_type         text not null,
  category           text not null default 'internal',
  outcome            text,

  -- Provider/model when applicable (nullable).
  provider           text,
  model              text,

  -- Trace/request id (generated safely when missing).
  trace_id           text,

  -- Sanitized message only (no prompts/responses/secrets/PII).
  message_sanitized  text,

  -- Owner (nullable for anonymous/demo).
  user_id            uuid references auth.users (id) on delete cascade,

  -- Sanitized diagnostic metadata only.
  metadata           jsonb not null default '{}'::jsonb
);

-- === INDEXES ===
create index if not exists runtime_error_events_created_idx
  on public.runtime_error_events (created_at desc);

create index if not exists runtime_error_events_route_created_idx
  on public.runtime_error_events (route, created_at desc);

create index if not exists runtime_error_events_category_created_idx
  on public.runtime_error_events (category, created_at desc);

-- === RLS ===
alter table public.runtime_error_events enable row level security;

-- No insert/update/delete/select policy for end users.
-- Writes come from server via service_role; admin reads via direct DB.
-- Anon/authenticated users cannot read or forge runtime errors.

comment on table public.runtime_error_events is
  'Phase 2C -- persistent runtime error monitoring. Diagnostic only; no enforcement or auto-fix.';

-- ============================================================================
-- REVIEW BEFORE RUNNING:
--   1) Fully additive -- no existing table or policy is modified.
--   2) Table starts empty.
--   3) Safe to run more than once (idempotent).
--   4) Apply manually; no production SQL is executed by the app.
-- ============================================================================
