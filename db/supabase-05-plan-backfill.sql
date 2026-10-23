-- ============================================================================
-- 05 - backfill plan versions (RUN FIFTH in Supabase SQL Editor)
-- ============================================================================

update public.subscription_plans
set version = 1,
    effective_date = coalesce(effective_date, now() at time zone 'utc')
where version is null or effective_date is null;
