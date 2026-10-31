-- ============================================================================
-- Phase 1E (MANUAL RUN) -- Admin-controlled announcement email campaigns
-- ============================================================================
-- Scope: database only. No UI/API. Manual review before execution.
-- Idempotent: safe to run more than once.
-- No automatic sending is implied by this schema.
-- ============================================================================

create table if not exists public.announcement_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','queued','sending','completed','partial_failed','cancelled')),
  recipient_count int not null default 0,
  accepted_count int not null default 0,
  failed_count int not null default 0,
  subject_override text,
  last_error text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.announcement_email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.announcement_email_campaigns (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  source text not null check (source in ('internal','external')),
  status text not null default 'queued'
    check (status in ('queued','sending','accepted','failed','skipped')),
  resend_id text,
  error text,
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_email_recipients_campaign_email_unique unique (campaign_id, email)
);

create index if not exists announcement_email_campaigns_announcement_idx
  on public.announcement_email_campaigns (announcement_id, created_at desc);

create index if not exists announcement_email_recipients_campaign_status_idx
  on public.announcement_email_recipients (campaign_id, status);

create index if not exists announcement_email_recipients_email_idx
  on public.announcement_email_recipients (email);

alter table public.announcement_email_campaigns enable row level security;
alter table public.announcement_email_recipients enable row level security;

comment on table public.announcement_email_campaigns is 'Phase 1E -- admin-controlled announcement email campaigns. No automatic sends.';
comment on table public.announcement_email_recipients is 'Phase 1E -- per-recipient delivery status for announcement email campaigns.';

-- ROLLBACK:
-- drop table if exists public.announcement_email_recipients;
-- drop table if exists public.announcement_email_campaigns;
