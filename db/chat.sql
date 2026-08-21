-- ============================================================================
-- تاريخ محادثات ماجيكلي
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- ============================================================================

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx on public.chat_conversations(user_id, updated_at desc);
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users manage their chat conversations" on public.chat_conversations;
drop policy if exists "Users manage their chat messages" on public.chat_messages;
create policy "Users manage their chat conversations" on public.chat_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their chat messages" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
