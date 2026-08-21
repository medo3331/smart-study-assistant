-- Magiclly AI Agents — persistent, user-isolated generation history.
-- Run once in Supabase SQL Editor. Safe to run repeatedly.

create table if not exists public.ai_agent_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null check (agent in ('marketing', 'research', 'content')),
  task_type text not null,
  provider text not null check (provider in ('groq', 'gemini')),
  model text not null,
  input jsonb not null,
  output text not null check (char_length(output) <= 20000),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_generations_user_agent_created_idx
  on public.ai_agent_generations(user_id, agent, created_at desc);

alter table public.ai_agent_generations enable row level security;

drop policy if exists "ai agent generations: owner reads" on public.ai_agent_generations;
drop policy if exists "ai agent generations: owner inserts" on public.ai_agent_generations;

create policy "ai agent generations: owner reads"
  on public.ai_agent_generations for select using (auth.uid() = user_id);
create policy "ai agent generations: owner inserts"
  on public.ai_agent_generations for insert with check (auth.uid() = user_id);
