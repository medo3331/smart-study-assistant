-- ============================================================
-- EPIC-2 / Rewards — RLS Policy for rewards_issued
-- Service-role read/write (same pattern as audit_log / subscription_activations)
-- ============================================================

-- The table has no RLS policies currently (confirmed by pg_policies query = 0).
-- Since actions use createServiceClient() (service_role), we add policies
-- that allow service_role unrestricted access and block client writes.

alter table public.rewards_issued enable row level security;

-- Service/admin can read (same pattern as audit_log: admin read via site_admins check)
drop policy if exists "rewards_issued: admin read" on public.rewards_issued;
create policy "rewards_issued: admin read"
  on public.rewards_issued for select
  using (exists(select 1 from public.site_admins where site_admins.user_id = auth.uid()));

-- Service/admin can insert/update/delete; client blocked
drop policy if exists "rewards_issued: admin write" on public.rewards_issued;
create policy "rewards_issued: admin write"
  on public.rewards_issued for all
  using (exists(select 1 from public.site_admins where site_admins.user_id = auth.uid()));

-- Client insert/update/delete blocked (same as audit_log)
drop policy if exists "rewards_issued: no client insert" on public.rewards_issued;
create policy "rewards_issued: no client insert"
  on public.rewards_issued for insert
  with check (false);

drop policy if exists "rewards_issued: no client update" on public.rewards_issued;
create policy "rewards_issued: no client update"
  on public.rewards_issued for update
  using (false);

drop policy if exists "rewards_issued: no client delete" on public.rewards_issued;
create policy "rewards_issued: no client delete"
  on public.rewards_issued for delete
  using (false);
