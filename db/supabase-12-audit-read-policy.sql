-- ============================================================================
-- 12 - admin_audit_log read policy (RUN TWELFTH in Supabase SQL Editor)
-- ============================================================================

do $policy$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='site_admins') then
    drop policy if exists "admin_audit_log: admin read" on public.admin_audit_log;
    create policy "admin_audit_log: admin read"
      on public.admin_audit_log for select
      using (exists (
        select 1 from public.site_admins sa
        where sa.user_id = auth.uid()
      ));
  end if;
end $policy$;
