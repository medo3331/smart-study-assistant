-- ============================================================================
-- 08 - admin_audit_log table (RUN EIGHTH in Supabase SQL Editor)
-- Two-step: CREATE TABLE alone first, so Supabase RLS helper cannot
-- re-attach leftover ALTER TABLE lines to a previous statement.
-- ============================================================================

create table if not exists public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor          uuid references auth.users(id) on delete set null,
  actor_email    text,
  action         text not null default '',
  resource_type  text not null default '',
  resource_id    text,
  details        jsonb default '{}',
  result         text not null default 'PASS' check (result in ('PASS', 'FAIL', 'BLOCKED')),
  created_at     timestamptz not null default now()
);
