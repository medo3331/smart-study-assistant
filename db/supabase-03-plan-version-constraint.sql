-- ============================================================================
-- 03 - plan version constraint + indexes (RUN THIRD in Supabase SQL Editor)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_plan_key_version_key'
      and conrelid = 'public.subscription_plans'::regclass
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_plan_key_version_key unique (plan_key, version);
  end if;
end $$;
