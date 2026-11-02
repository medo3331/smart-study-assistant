-- ============================================================
-- Plan features + discounts — for /admin/plans Full CRUD
-- Created for: Full CRUD control over subscription plans
-- Adds: features (jsonb), discount_percentage (numeric),
--       original_price (numeric), is_popular (boolean)
-- ============================================================

-- 1) Add new columns (idempotent)
alter table public.subscription_plans
  add column if not exists features jsonb not null default '[]'::jsonb;

alter table public.subscription_plans
  add column if not exists discount_percentage numeric(5,2) not null default 0;

alter table public.subscription_plans
  add column if not exists original_price numeric(10,2);

alter table public.subscription_plans
  add column if not exists is_popular boolean not null default false;

-- 2) Backfill features for existing plans (safe: only where empty)
update public.subscription_plans
set features = '["الاستخدام الأساسي","الوصول للوكلاء"]'::jsonb
where plan_key = 'free' and (features is null or features = '[]'::jsonb);

update public.subscription_plans
set features = '["رسائل غير محدودة عمليًا","رفع ملفات أكبر","دعم الأولوية"]'::jsonb
where plan_key = 'pro' and (features is null or features = '[]'::jsonb);

update public.subscription_plans
set features = '["كل مميزات Pro","فيديو وصوت","أولوية عالية"]'::jsonb
where plan_key = 'ultra' and (features is null or features = '[]'::jsonb);

-- 3) Ensure only one popular plan at a time (optional partial unique index)
create unique index if not exists idx_subscription_plans_single_popular
  on public.subscription_plans (is_popular)
  where is_popular = true;

-- 4) Helpful index
create index if not exists idx_subscription_plans_is_active on public.subscription_plans (is_active);
create index if not exists idx_subscription_plans_is_popular on public.subscription_plans (is_popular) where is_popular = true;
