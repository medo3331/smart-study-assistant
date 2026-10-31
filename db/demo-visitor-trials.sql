-- ============================================================================
-- Phase: Demo Three Free Trials (MANUAL RUN — DO NOT APPLY WITHOUT REVIEW)
-- ============================================================================
-- SHADOW ENFORCEMENT: rows written here are used to enforce the 3-trial limit.
-- This migration is ADDITIVE — does not touch any existing table or policy.
-- Safe to run more than once (idempotent).
-- ============================================================================

create table if not exists public.demo_visitor_trials (
  visitor_id    text primary key,
  trials_used   int not null default 0 check (trials_used >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for fast lookups (primary key already indexed, but explicit for clarity)
create index if not exists demo_visitor_trials_updated_idx
  on public.demo_visitor_trials (updated_at desc);

-- RLS: service_role bypasses; anonymous users cannot read/write directly.
-- All writes come from the server via service_role.
alter table public.demo_visitor_trials enable row level security;

-- No policies for anon/authenticated users — service_role bypasses RLS.
-- This prevents any client from forging or reading trial counts.

comment on table public.demo_visitor_trials is
  'Phase: Demo three free trials — server-side trial counting for anonymous visitors.';

comment on column public.demo_visitor_trials.visitor_id is
  'Unguessable visitor identifier stored in an HttpOnly cookie.';

comment on column public.demo_visitor_trials.trials_used is
  'Number of successful demo responses consumed by this visitor. Max 3.';

-- ============================================================================
-- REVIEW BEFORE RUNNING:
--   1) Fully additive — no existing table or policy is modified.
--   2) Table starts empty; no backfill; no application behaviour change.
--   3) Safe to run more than once (idempotent).
--   4) To enforce the limit atomically, consider using a DB function:
--
--      create or replace function public.reserve_demo_trial(p_visitor_id text, p_limit int)
--      returns int as $$
--        declare v_used int;
--        begin
--          insert into public.demo_visitor_trials (visitor_id, trials_used)
--          values (p_visitor_id, 0)
--          on conflict (visitor_id) do nothing;
--
--          select trials_used into v_used
--          from public.demo_visitor_trials
--          where visitor_id = p_visitor_id
--          for update;
--
--          if v_used >= p_limit then
--            return -1; -- exhausted
--          end if;
--
--          update public.demo_visitor_trials
--          set trials_used = trials_used + 1,
--              updated_at = now()
--          where visitor_id = p_visitor_id;
--
--          return p_limit - v_used - 1; -- remaining after this trial
--        end;
--      $$ language plpgsql security definer;
--
--   5) Verify after running:
--        select count(*) from public.demo_visitor_trials;
--        \d public.demo_visitor_trials
-- ============================================================================
-- ============================================================================
-- RPC functions for ATOMIC trial reservation and refund.
-- ============================================================================

create or replace function public.reserve_demo_trial(p_visitor_id text, p_limit int)
returns int
language plpgsql
security definer
as $$
declare
  v_used int;
begin
  insert into public.demo_visitor_trials (visitor_id, trials_used)
  values (p_visitor_id, 0)
  on conflict (visitor_id) do nothing;

  select trials_used into v_used
  from public.demo_visitor_trials
  where visitor_id = p_visitor_id
  for update;

  if v_used >= p_limit then
    return -1;
  end if;

  update public.demo_visitor_trials
  set trials_used = trials_used + 1,
      updated_at = now()
  where visitor_id = p_visitor_id;

  return p_limit - v_used - 1;
end;
$$;

create or replace function public.refund_demo_trial(p_visitor_id text, p_limit int)
returns int
language plpgsql
security definer
as $$
declare
  v_used int;
begin
  select trials_used into v_used
  from public.demo_visitor_trials
  where visitor_id = p_visitor_id
  for update;

  if v_used is null or v_used <= 0 then
    return p_limit;
  end if;

  update public.demo_visitor_trials
  set trials_used = greatest(0, trials_used - 1),
      updated_at = now()
  where visitor_id = p_visitor_id;

  return p_limit - greatest(0, v_used - 1);
end;
$$;

grant execute on function public.reserve_demo_trial(text, int) to service_role;
grant execute on function public.refund_demo_trial(text, int) to service_role;