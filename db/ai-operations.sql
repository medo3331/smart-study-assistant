-- AI operation audit trail; foundation for future credits and billing.
create table if not exists public.ai_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('groq', 'gemini')),
  model text not null,
  task_type text not null,
  status text not null check (status in ('completed', 'failed')),
  token_usage jsonb,
  estimated_cost numeric,
  created_at timestamptz not null default now()
);
create index if not exists ai_operations_user_created_idx on public.ai_operations(user_id, created_at desc);
alter table public.ai_operations enable row level security;
drop policy if exists "ai operations: owner reads" on public.ai_operations;
create policy "ai operations: owner reads" on public.ai_operations for select using (auth.uid() = user_id);
