-- ============================================================
-- EPIC-2 / Rewards — Weekly Gifts (New DB Table)
-- ONLY runs after user approval. Idempotent.
-- ============================================================

create table if not exists public.rewards_issued (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null check (reward_type in ('limit_boost', 'trial_week', 'pro_week', 'upload_credits')),
  reward_value integer not null,
  duration_days int,
  issued_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rewards_issued_recipient on public.rewards_issued(recipient_user_id);
create index if not exists idx_rewards_issued_created on public.rewards_issued(created_at desc);
