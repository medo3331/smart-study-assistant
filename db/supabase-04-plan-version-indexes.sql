-- ============================================================================
-- 04 - plan version indexes (RUN FOURTH in Supabase SQL Editor)
-- ============================================================================

create index if not exists idx_subscription_plans_version
  on public.subscription_plans(version);
create index if not exists idx_subscription_plans_effective_date
  on public.subscription_plans(effective_date);
create index if not exists idx_subscription_plans_active_version
  on public.subscription_plans(plan_key, version);
