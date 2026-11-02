-- ============================================================
-- Notifications + Support Tickets — Phase: Communication
-- ============================================================

-- 1) notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = broadcast to all
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info','warning','feature','support_reply')),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_notifications_user on public.notifications (user_id);
create index if not exists idx_notifications_created on public.notifications (created_at desc);
create index if not exists idx_notifications_unread on public.notifications (user_id, is_read) where is_read = false;

alter table public.notifications enable row level security;

drop policy if exists "notifications: own read" on public.notifications;
create policy "notifications: own read"
  on public.notifications for select
  using (user_id is null or user_id = auth.uid());

drop policy if exists "notifications: own update" on public.notifications;
create policy "notifications: own update"
  on public.notifications for update
  using (user_id is null or user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "notifications: own delete" on public.notifications;
create policy "notifications: own delete"
  on public.notifications for delete
  using (user_id is null or user_id = auth.uid());

-- 2) support_tickets
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  description text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_user on public.support_tickets (user_id);
create index if not exists idx_tickets_status on public.support_tickets (status);
create index if not exists idx_tickets_created on public.support_tickets (created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "tickets: own read" on public.support_tickets;
create policy "tickets: own read"
  on public.support_tickets for select
  using (user_id = auth.uid());

drop policy if exists "tickets: own insert" on public.support_tickets;
create policy "tickets: own insert"
  on public.support_tickets for insert
  with check (user_id = auth.uid());

drop policy if exists "tickets: own update" on public.support_tickets;
create policy "tickets: own update"
  on public.support_tickets for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3) ticket_replies
create table if not exists public.ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  message text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_replies_ticket on public.ticket_replies (ticket_id);
create index if not exists idx_replies_created on public.ticket_replies (created_at);

alter table public.ticket_replies enable row level security;

drop policy if exists "replies: read if ticket owner or admin" on public.ticket_replies;
create policy "replies: read if ticket owner or admin"
  on public.ticket_replies for select
  using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    or exists (select 1 from public.site_admins sa where sa.user_id = auth.uid())
  );

drop policy if exists "replies: insert if ticket owner or admin" on public.ticket_replies;
create policy "replies: insert if ticket owner or admin"
  on public.ticket_replies for insert
  with check (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    or exists (select 1 from public.site_admins sa where sa.user_id = auth.uid())
  );

-- Admin read-all policies via service_role (server bypasses RLS); no client admin policies needed.
