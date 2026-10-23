-- ============================================================================
-- 10 - admin_audit_log indexes (RUN TENTH in Supabase SQL Editor)
-- ============================================================================

create index if not exists idx_admin_audit_log_actor on public.admin_audit_log(actor);
create index if not exists idx_admin_audit_log_action on public.admin_audit_log(action);
create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_log_resource on public.admin_audit_log(resource_type, resource_id);
