-- ============================================================================
-- Unified Communication Center schema & RLS (MANUAL RUN)
-- ============================================================================
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  category text not null default 'other' check (category in ('login','account','payment','bug','content','performance','other')),
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('user','admin')),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('support_reply','support_status','announcement','system')),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text,
  link_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id, updated_at desc);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id, created_at);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "support_tickets self read" on public.support_tickets;
create policy "support_tickets self read" on public.support_tickets for select to authenticated using (user_id = auth.uid());
drop policy if exists "support_messages self read" on public.support_messages;
create policy "support_messages self read" on public.support_messages for select to authenticated using (exists (select 1 from public.support_tickets t where t.id=ticket_id and t.user_id=auth.uid()));
drop policy if exists "notifications self read" on public.notifications;
create policy "notifications self read" on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "notifications self update" on public.notifications;
create policy "notifications self update" on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());