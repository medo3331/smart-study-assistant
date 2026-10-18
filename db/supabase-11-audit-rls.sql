-- ============================================================================
-- 11 - admin_audit_log RLS (RUN ELEVENTH in Supabase SQL Editor)
-- ============================================================================

alter table public.admin_audit_log enable row level security;
