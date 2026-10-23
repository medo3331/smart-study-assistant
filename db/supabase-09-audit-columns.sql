-- ============================================================================
-- 09 - admin_audit_log missing columns (RUN NINTH in Supabase SQL Editor)
-- ============================================================================

alter table public.admin_audit_log add column if not exists actor uuid references auth.users(id) on delete set null;
alter table public.admin_audit_log add column if not exists actor_email text;
alter table public.admin_audit_log add column if not exists action text not null default '';
alter table public.admin_audit_log add column if not exists resource_type text not null default '';
alter table public.admin_audit_log add column if not exists resource_id text;
alter table public.admin_audit_log add column if not exists details jsonb default '{}';
alter table public.admin_audit_log add column if not exists result text not null default 'PASS' check (result in ('PASS', 'FAIL', 'BLOCKED'));
alter table public.admin_audit_log add column if not exists created_at timestamptz not null default now();
