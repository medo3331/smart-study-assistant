-- ===========================================================================
-- MAGICLY — Message Requests (صوتيات المراسلة)
-- Phase 1: Messaging Foundation
-- ===========================================================================
-- Represents a pending message request between two users.
-- Key: No conversation exists until the request is accepted.
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- 1. message_requests table
-- ----------------------------------------------------------------------------
create table if not exists public.message_requests (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references auth.users(id) on delete cascade,
  receiver_id     uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'canceled', 'expired', 'blocked')),
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  responded_by    uuid references auth.users(id) on delete set null,
  note            text, -- optional note from requester
  expires_at      timestamptz -- auto-expire after 7 days
);

-- Indexes
create index if not exists idx_message_requests_sender
  on public.message_requests (sender_id, created_at desc);

create index if not exists idx_message_requests_receiver
  on public.message_requests (receiver_id, created_at desc);

create index if not exists idx_message_requests_status
  on public.message_requests (status, created_at desc);

create index if not exists idx_message_requests_receiver_pending
  on public.message_requests (receiver_id, status, created_at desc)
  where status = 'pending';

-- Prevent duplicate pending requests
alter table public.message_requests add constraint uq_message_requests_unique_pair
  unique (sender_id, receiver_id);

-- Exclude blocked users
alter table public.message_requests add constraint chk_message_requests_not_blocked
  check (
    not exists (
      select 1 from public.user_blocks ub
      where
        (ub.blocker_id = sender_id and ub.blocked_id = receiver_id) or
        (ub.blocker_id = receiver_id and ub.blocked_id = sender_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 2. RLS Policies for message_requests
-- ----------------------------------------------------------------------------

alter table public.message_requests enable row level security;

-- Users can insert their own message requests
create policy "message_requests: insert own request"
  on public.message_requests for insert
  with check (sender_id = auth.uid());

-- Users can read incoming requests
create policy "message_requests: read incoming"
  on public.message_requests for select
  using (receiver_id = auth.uid());

-- Users can update their own pending requests
create policy "message_requests: update own pending"
  on public.message_requests for update
  using (sender_id = auth.uid() and status = 'pending');

-- Users can delete their own pending requests
create policy "message_requests: delete own pending"
  on public.message_requests for delete
  using (sender_id = auth.uid() and status = 'pending');

-- Admin: read all requests (for moderation/audit)
create policy "message_requests: admin read all"
  on public.message_requests for select
  using (
    exists (
      select 1 from public.admin_roles
      where user_id = auth.uid()
      and role in ('safety_moderator', 'authorized_admin', 'support_agent')
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Auto-expiry trigger
-- ----------------------------------------------------------------------------
create or replace function public.expire_message_requests()
returns trigger as $$
begin
  update public.message_requests
  set status = 'expired'
  where status = 'pending'
    and expires_at < now();
  return null;
end;
$$ language plpgsql;

create or replace event trigger public.expire_message_requests_event
on plpgsql
for each statement
when (current_database() = current_database())
execute function public.expire_message_requests();

-- ----------------------------------------------------------------------------
-- 4. Helper: check if users can message each other
-- ----------------------------------------------------------------------------
create or replace function public.can_message(user_a uuid, user_b uuid)
returns boolean as $$
begin
  -- Users cannot message themselves
  if user_a = user_b then
    return false;
  end if;

  -- Check if they are blocked
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = user_a and ub.blocked_id = user_b) or
          (ub.blocker_id = user_b and ub.blocked_id = user_a)
  ) then
    return false;
  end if;

  -- Check if there is a pending request
  if exists (
    select 1 from public.message_requests mr
    where
      mr.sender_id = user_a and mr.receiver_id = user_b and mr.status = 'pending' or
      mr.sender_id = user_b and mr.receiver_id = user_a and mr.status = 'pending'
  ) then
    return false;
  end if;

  return true;
end;
$$ language plpgsql stable;
