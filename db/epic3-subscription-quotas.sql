-- ============================================================
-- EPIC-3 — Subscription Quotas Tracking (daily reset pattern)
-- ============================================================

create table if not exists public.subscription_quotas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null references public.subscription_plans(plan_key),
  messages_24h int not null default 0,
  uploads_today int not null default 0,
  last_reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_quotas_user on public.subscription_quotas(user_id);
create index if not exists idx_subscription_quotas_plan on public.subscription_quotas(plan_key);

-- Note: Quota reset is handled by application logic (daily cron or server-side check),
-- not by a DB trigger, to allow flexible scheduling.
