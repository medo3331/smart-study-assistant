-- ============================================================================
-- 02 - plan version columns (RUN SECOND in Supabase SQL Editor)
-- ============================================================================

alter table public.subscription_plans add column if not exists version int not null default 1;
alter table public.subscription_plans add column if not exists effective_date timestamptz not null default now();
