-- Magicly AI 2.0 — ذاكرة الطالب المنظمة
-- شغّل الملف مرة واحدة من Supabase SQL Editor. آمن للتشغيل المتكرر.

create table if not exists public.ai_memories (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('weak_topic', 'preferred_style', 'recent_subject', 'recent_lesson', 'completed_topic', 'common_mistake')),
  value text not null check (char_length(value) between 1 and 300),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, value)
);

create index if not exists ai_memories_user_updated_idx on public.ai_memories (user_id, updated_at desc);

alter table public.ai_memories enable row level security;

drop policy if exists "ai memories: owner reads" on public.ai_memories;
drop policy if exists "ai memories: owner writes" on public.ai_memories;
drop policy if exists "ai memories: owner updates" on public.ai_memories;

create policy "ai memories: owner reads" on public.ai_memories for select using (auth.uid() = user_id);
create policy "ai memories: owner writes" on public.ai_memories for insert with check (auth.uid() = user_id);
create policy "ai memories: owner updates" on public.ai_memories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
