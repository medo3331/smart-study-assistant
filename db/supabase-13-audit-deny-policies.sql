-- ============================================================================
-- 13 - admin_audit_log deny policies (RUN LAST in Supabase SQL Editor)
-- ============================================================================

drop policy if exists "admin_audit_log: no client insert" on public.admin_audit_log;
create policy "admin_audit_log: no client insert"
  on public.admin_audit_log for insert
  with check (false);

drop policy if exists "admin_audit_log: no client update" on public.admin_audit_log;
create policy "admin_audit_log: no client update"
  on public.admin_audit_log for update
  using (false);

drop policy if exists "admin_audit_log: no client delete" on public.admin_audit_log;
create policy "admin_audit_log: no client delete"
  on public.admin_audit_log for delete
  using (false);
