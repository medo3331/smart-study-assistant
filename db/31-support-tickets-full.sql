-- ===========================================================================
-- MAGICLY — SPRINT 1 — Batch 1
-- Support Ticket System — Full Schema
-- ===========================================================================
-- Extends existing support_tickets + support_messages with:
-- - Priority (Low/Normal/High/Urgent)
-- - Attachments (files)
-- - Assignments (agent, reassign)
-- - Events (audit trail)
-- - Ratings (student satisfaction)
-- - Status history
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. support_tickets (extended)
-- ---------------------------------------------------------------------------

alter table if exists public.support_tickets
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_reason text,
  add column if not exists rating integer check (rating between 1 and 5),
  add column if not exists rating_at timestamptz;

create index if not exists idx_support_tickets_priority on public.support_tickets(priority, status);
create index if not exists idx_support_tickets_assigned on public.support_tickets(assigned_to, status);
create index if not exists idx_support_tickets_created on public.support_tickets(created_at desc);
create index if not exists idx_support_tickets_user on public.support_tickets(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. support_ticket_attachments
-- ---------------------------------------------------------------------------

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size integer not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_ticket_attachments_ticket on public.support_ticket_attachments(ticket_id);
create index if not exists idx_ticket_attachments_user on public.support_ticket_attachments(user_id);

-- ---------------------------------------------------------------------------
-- 3. support_ticket_assignments
-- ---------------------------------------------------------------------------

create table if not exists public.support_ticket_assignments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  agent_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);

create unique index if not exists idx_ticket_assignment_active
  on public.support_ticket_assignments(ticket_id)
  where unassigned_at is null;

-- ---------------------------------------------------------------------------
-- 4. support_ticket_events
-- ---------------------------------------------------------------------------

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_events_ticket on public.support_ticket_events(ticket_id, created_at desc);
create index if not exists idx_ticket_events_actor on public.support_ticket_events(actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. support_ticket_ratings
-- ---------------------------------------------------------------------------

create table if not exists public.support_ticket_ratings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  rated_at timestamptz not null default now(),
  unique (ticket_id, user_id)
);

create index if not exists idx_ratings_ticket on public.support_ticket_ratings(ticket_id);

-- ---------------------------------------------------------------------------
-- 6. RLS policies
-- ---------------------------------------------------------------------------

-- 6.1 support_tickets
alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets: self read" on public.support_tickets;
create policy "support_tickets: self read"
  on public.support_tickets for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "support_tickets: own write" on public.support_tickets;
create policy "support_tickets: own write"
  on public.support_tickets for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "support_tickets: own update" on public.support_tickets;
create policy "support_tickets: own update"
  on public.support_tickets for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() or assigned_to = auth.uid());

drop policy if exists "support_tickets: agent read" on public.support_tickets;
create policy "support_tickets: agent read"
  on public.support_tickets for select
  to authenticated
  using (
    exists (
      select 1 from public.site_admins sa
      where sa.user_id = auth.uid()
      and sa.role in ('admin', 'support_manager', 'support_agent', 'owner')
    )
    or assigned_to = auth.uid()
  );

drop policy if exists "support_tickets: agent write" on public.support_tickets;
create policy "support_tickets: agent write"
  on public.support_tickets for update
  to authenticated
  using (
    exists (
      select 1 from public.site_admins sa
      where sa.user_id = auth.uid()
      and sa.role in ('admin', 'support_manager', 'support_agent', 'owner')
    )
  )
  with check (
    user_id = auth.uid() or assigned_to = auth.uid()
  );

-- 6.2 support_ticket_attachments
alter table public.support_ticket_attachments enable row level security;

drop policy if exists "ticket_attachments: own insert" on public.support_ticket_attachments;
create policy "ticket_attachments: own insert"
  on public.support_ticket_attachments for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "ticket_attachments: own read" on public.support_ticket_attachments;
create policy "ticket_attachments: own read"
  on public.support_ticket_attachments for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_attachments.ticket_id
      and (t.user_id = auth.uid() or exists (
        select 1 from public.site_admins sa
        where sa.user_id = auth.uid()
        and sa.role in ('admin', 'support_manager', 'support_agent', 'owner')
      ))
    )
  );

-- 6.3 support_ticket_assignments
alter table public.support_ticket_assignments enable row level security;

drop policy if exists "ticket_assignments: agent insert" on public.support_ticket_assignments;
create policy "ticket_assignments: agent insert"
  on public.support_ticket_assignments for insert
  to authenticated
  using (
    exists (
      select 1 from public.site_admins sa
      where sa.user_id = auth.uid()
      and sa.role in ('admin', 'support_manager', 'support_agent', 'owner')
    )
  );

drop policy if exists "ticket_assignments: agent delete" on public.support_ticket_assignments;
create policy "ticket_assignments: agent delete"
  on public.support_ticket_assignments for delete
  to authenticated
  using (
    exists (
      select 1 from public.site_admins sa
      where sa.user_id = auth.uid()
      and sa.role in ('admin', 'support_manager', 'support_agent', 'owner')
    )
  );

-- 6.4 support_ticket_events
alter table public.support_ticket_events enable row level security;

drop policy if exists "ticket_events: agent read" on public.support_ticket_events;
create policy "ticket_events: agent read"
  on public.support_ticket_events for select
  to authenticated
  using (
    exists (
      select 1 from public.site_admins sa
      where sa.user_id = auth.uid()
      and sa.role in ('admin', 'support_manager', 'support_agent', 'owner')
    )
  );

-- 6.5 support_ticket_ratings
alter table public.support_ticket_ratings enable row level security;

drop policy if exists "ticket_ratings: own insert" on public.support_ticket_ratings;
create policy "ticket_ratings: own insert"
  on public.support_ticket_ratings for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "ticket_ratings: own delete" on public.support_ticket_ratings;
create policy "ticket_ratings: own delete"
  on public.support_ticket_ratings for delete
  to authenticated
  using (user_id = auth.uid());

-- 6.6 Existing tables (support_messages, notifications) - keep existing policies
alter table public.support_messages enable row level security;
alter table public.notifications enable row level security;

-- 6.7 Support agent visibility for messages
drop policy if exists "support_messages: agent read" on public.support_messages;
create policy "support_messages: agent read"
  on public.support_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id
      and (t.user_id = auth.uid() or exists (
        select 1 from public.site_admins sa
        where sa.user_id = auth.uid()
        and sa.role in ('admin', 'support_manager', 'support_agent', 'owner')
      ))
    )
  );

-- 6.8 All roles authorized for support
drop policy if exists "support_tickets: any admin" on public.support_tickets;
create policy "support_tickets: any admin"
  on public.support_tickets for all
  to authenticated
  using (
    exists (
      select 1 from public.site_admins sa
      where sa.user_id = auth.uid()
      and sa.role in ('admin', 'support_manager', 'support_agent', 'owner', 'moderator')
    )
  );
