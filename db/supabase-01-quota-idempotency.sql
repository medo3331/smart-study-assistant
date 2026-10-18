-- ============================================================================
-- 01 - quota_idempotency table (RUN FIRST in Supabase SQL Editor)
-- ============================================================================

create table if not exists public.quota_idempotency (
  user_id           uuid not null references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('message', 'upload')),
  idempotency_key   text not null,
  consumed_at       timestamptz not null default now(),
  primary key (user_id, kind, idempotency_key)
);

create index if not exists idx_quota_idempotency_user_kind
  on public.quota_idempotency(user_id, kind);
create index if not exists idx_quota_idempotency_consumed_at
  on public.quota_idempotency(consumed_at);
