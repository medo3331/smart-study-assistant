-- ============================================================================
-- 00 â€” Comprehensive P0 Security/Correctness Fixes (combined migration)
-- ط§ظ„طھط§ط±ظٹط®: ظ¢ظ ظ¢ظ¦-ظ،ظ -ظ،ظ§
--
-- ط§ظ„ط؛ط±ط¶: طھط·ط¨ظٹظ‚ ط¬ظ…ظٹط¹ طھط¹ط¯ظٹظ„ط§طھ P0 ظپظٹ ظ…ظ„ظپ ظˆط§ط­ط¯ ط¢ظ…ظ† ظ„ظ„طھظƒط±ط§ط± (idempotent):
--   1) ط¬ط¯ظˆظ„ quota_idempotency â€” ظ…ظ†ط¹ ط§ظ„ط®طµظ… ط§ظ„ظ…ظƒط±ط± ط¹ظ„ظ‰ ط§ظ„ط§ط³طھط¯ط¹ط§ط،ط§طھ ط§ظ„ظ…طھط²ط§ظ…ظ†ط©
--   2) RPC consume_subscription_quota â€” SECURITY DEFINERطŒ search_path ظ…ط­ظ…ظٹطŒ service_role ظپظ‚ط·
--   3) RPC get_active_plan_version â€” SECURITY DEFINERطŒ service_role ظپظ‚ط·
--   4) ط£ط¹ظ…ط¯ط© version + effective_date ظپظٹ subscription_plans ظ„ط¥ط¯ط§ط±ط© ظ†ط³ط® ط§ظ„ط¨ط§ظ‚ط§طھ
--   5) ط¬ط¯ظˆظ„ admin_audit_log â€” طھط®ط²ظٹظ† DB-backed ظ„طھط¯ظ‚ظٹظ‚ ط¥ط¬ط±ط§ط،ط§طھ ط§ظ„ط£ط¯ظ…ظ† (ط¨ط¯ظٹظ„ ظ„ظ€ in-memory)
--   6) RLS + ط³ظٹط§ط³ط§طھ ط£ظ…ط§ظ† ط¹ظ„ظ‰ admin_audit_log (ظ„ط§ ظƒطھط§ط¨ط© ظ…ط¨ط§ط´ط±ط© ظ…ظ† ط§ظ„ط¹ظ…ظٹظ„)
--
-- ظ…ظ„ط§ط­ط¸ط§طھ:
--   - ظƒظ„ ط¬ظ…ظ„ط© طھط³طھط®ط¯ظ… IF NOT EXISTS / DO $$ ظ„طھظƒظˆظ† ط¢ظ…ظ†ط© ظ„ظ„ط¥ط¹ط§ط¯ط©.
--   - ظٹط´طھط±ط· ظˆط¬ظˆط¯ ط¬ط¯ط§ظˆظ„: auth.usersطŒ subscription_quotasطŒ subscription_plans
--     (طھط£طھظٹ ظ…ظ† epic3-subscription-quotas.sql ظˆ epic2-admin-rbac-audit-schema.sql).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ط¬ط¯ظˆظ„ idempotency ظ„ط§ط³طھظ‡ظ„ط§ظƒ ط§ظ„ظƒظˆطھط§
--    ظٹظ…ظ†ط¹ ط§ظ„ط®طµظ… ط§ظ„ظ…ظƒط±ط± ط¹ظ†ط¯ ط¥ط¹ط§ط¯ط© ط¥ط±ط³ط§ظ„ ظ†ظپط³ ط§ظ„ظ…ظپطھط§ط­ ظ„ظ†ظپط³ ط§ظ„ظ…ط³طھط®ط¯ظ… ظˆط§ظ„ظ†ظˆط¹.
-- ----------------------------------------------------------------------------
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

comment on table public.quota_idempotency is
  'P0: Idempotency log for consume_subscription_quota. Prevents double-deduction on retries.';

-- ----------------------------------------------------------------------------
-- 2) RPC: consume_subscription_quota â€” ظپط­طµ ط°ط±ظٹ + ط²ظٹط§ط¯ط© ط§ظ„ظƒظˆطھط§
--    ط¢ظ…ظ†ط©: service_role ظپظ‚ط·طŒ search_path ظ…ط؛ظ„ظ‚طŒ REVOKE ظ…ظ† public/anon/authenticated.
-- ----------------------------------------------------------------------------
create or replace function public.consume_subscription_quota(
  p_user_id         uuid,
  p_kind            text,
  p_idempotency_key text
)
returns table (
  allowed           boolean,
  used              int,
  limit_            int,
  reset_at          timestamptz,
  already_consumed  boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used       int := 0;
  v_used_upload int := 0;
  v_limit      int := 0;
  v_reset_at   timestamptz;
  v_plan_key   text := 'free';
  v_messages   int := 20;
  v_uploads    int := 5;
  v_current    int := 0;
  v_now        timestamptz := now() at time zone 'utc';
begin
  -- 1)هڈھوœ‰ service_role ظٹظ…ظƒظ†ظ‡ ط§ظ„ط§ط³طھط¯ط¹ط§ط،
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'consume_subscription_quota: forbidden â€” service_role only';
  end if;

  -- 2) طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„ظ…ط¯ط®ظ„ط§طھ
  if p_user_id is null then
    raise exception 'consume_subscription_quota: p_user_id required';
  end if;
  if p_kind not in ('message', 'upload') then
    raise exception 'consume_subscription_quota: p_kind must be message or upload';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'consume_subscription_quota: p_idempotency_key required';
  end if;

  -- 3) ظپط­طµ idempotency: ظ‡ظ„ طھظ… ط§ط³طھظ‡ظ„ط§ظƒ ظ‡ط°ط§ ط§ظ„ظ…ظپطھط§ط­ ظ…ط³ط¨ظ‚ط§ظ‹ ظ„ظ†ظپط³ ط§ظ„ظ…ط³طھط®ط¯ظ… ظˆط§ظ„ظ†ظˆط¹طں
  if exists (
    select 1 from public.quota_idempotency
    where user_id = p_user_id
      and kind = p_kind
      and idempotency_key = p_idempotency_key
  ) then
    select coalesce(messages_24h, 0),
           coalesce(uploads_today, 0),
           last_reset_at
    into v_used, v_used_upload, v_reset_at
    from public.subscription_quotas
    where user_id = p_user_id;

    return query
    select
      true::boolean,
      case when p_kind = 'message' then v_used else v_used_upload end,
      case when p_kind = 'message' then v_limit else 0 end,
      v_reset_at,
      true::boolean;
    return;
  end if;

  -- 4) ط¥ظ†ط´ط§ط، طµظپ ظƒظˆطھط§ ظپط§ط±ط؛ ط¥ط°ط§ ظ„ظ… ظٹظˆط¬ط¯ (lazy init)
  insert into public.subscription_quotas (user_id, plan_key, messages_24h, uploads_today, last_reset_at, updated_at)
  values (p_user_id, 'free', 0, 0, v_now, v_now)
  on conflict (user_id) do nothing;

  -- 5) ظ‚ط±ط§ط،ط© ط§ظ„طµظپ ط§ظ„ط­ط§ظ„ظٹ
  select coalesce(messages_24h, 0),
         coalesce(uploads_today, 0),
         last_reset_at,
         plan_key
  into v_used, v_used_upload, v_reset_at, v_plan_key
  from public.subscription_quotas
  where user_id = p_user_id;

  -- 6) ط­ط¯ظˆط¯ ط­ط³ط¨ ط§ظ„ط®ط·ط© (ظ‚ظٹظ… ط§ظپطھط±ط§ط¶ظٹط© ط¥ط°ط§ ظ„ظ… طھظˆط¬ط¯ ط®ط·ط© ظپظٹ subscription_plans)
  select coalesce(sp.messages_per_2h, 20), coalesce(sp.uploads_daily, 5)
  into v_messages, v_uploads
  from public.subscription_plans sp
  where sp.plan_key = v_plan_key
    and sp.is_active = true
  order by sp.version desc, sp.effective_date desc
  limit 1;

  -- 7) طھط­ط¯ظٹط¯ ط§ظ„ط¹ط¯ط§ط¯ ط§ظ„ظ…ط³طھظ‡ط¯ظپ
  if p_kind = 'message' then
    v_current := coalesce(v_used, 0);
    v_limit   := v_messages;
  else
    v_current := coalesce(v_used_upload, 0);
    v_limit   := v_uploads;
  end if;

  -- 8) ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط¹ط¯ظ… طھط¬ط§ظˆط² ط§ظ„ط­ط¯
  if v_current >= v_limit then
    return query
    select
      false::boolean,
      v_current,
      v_limit,
      v_reset_at,
      false::boolean;
    return;
  end if;

  -- 9) طھط³ط¬ظٹظ„ ط§ظ„ط§ط³طھظ‡ظ„ط§ظƒ ظپظٹ idempotency ظ‚ط¨ظ„ ط§ظ„ط²ظٹط§ط¯ط© (ظ„ظ„ط£ظ…ط§ظ†)
  insert into public.quota_idempotency (user_id, kind, idempotency_key, consumed_at)
  values (p_user_id, p_kind, p_idempotency_key, v_now);

  -- 10) ط²ظٹط§ط¯ط© ط§ظ„ط¹ط¯ط§ط¯
  if p_kind = 'message' then
    update public.subscription_quotas
    set messages_24h = coalesce(messages_24h, 0) + 1,
        updated_at = v_now
    where user_id = p_user_id;
  else
    update public.subscription_quotas
    set uploads_today = coalesce(uploads_today, 0) + 1,
        updated_at = v_now
    where user_id = p_user_id;
  end if;

  -- 11) ط¥ط±ط¬ط§ط¹ ط§ظ„ظ†طھظٹط¬ط© ط¨ط¹ط¯ ط§ظ„ط²ظٹط§ط¯ط©
  select coalesce(messages_24h, 0),
         coalesce(uploads_today, 0),
         last_reset_at
  into v_used, v_used_upload, v_reset_at
  from public.subscription_quotas
  where user_id = p_user_id;

  return query
  select
    true::boolean,
    case when p_kind = 'message' then v_used else v_used_upload end,
    case when p_kind = 'message' then v_messages else v_uploads end,
    v_reset_at,
    false::boolean;
end;
$$;

-- ط¥ظ„ط؛ط§ط، ظƒظ„ ط§ظ„طµظ„ط§ط­ظٹط§طھ ظ…ظ† ط§ظ„ط£ط¯ظˆط§ط± ط؛ظٹط± ط§ظ„ظ…ظˆط«ظˆظ‚ط© ظˆط¥ط¹ط·ط§ط، service_role ظپظ‚ط·
revoke all on function public.consume_subscription_quota(uuid, text, text) from public;
revoke all on function public.consume_subscription_quota(uuid, text, text) from authenticated;
revoke all on function public.consume_subscription_quota(uuid, text, text) from anon;
grant execute on function public.consume_subscription_quota(uuid, text, text) to service_role;

comment on function public.consume_subscription_quota(uuid, text, text) is
  'P0: Atomic quota consumption with idempotency. service_role only. Returns allowed/used/limit/reset_at/already_consumed.';

-- ----------------------------------------------------------------------------
-- 3) ظ†ط³ط® ط§ظ„ط¨ط§ظ‚ط§طھ: ط£ط¹ظ…ط¯ط© version + effective_date ط¹ظ„ظ‰ subscription_plans
--    ظ‚ط§ط¹ط¯ط©: ظ†ط³ط®ط© ظˆط§ط­ط¯ط© ظ†ط´ط·ط© ظ„ظƒظ„ plan_key ظپظٹ ط£ظٹ ط²ظ…ظ† (ط£ط¹ظ„ظ‰ effective_date <= now).
-- ----------------------------------------------------------------------------
alter table public.subscription_plans add column if not exists version int not null default 1;
alter table public.subscription_plans add column if not exists effective_date timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_plan_key_version_key'
      and conrelid = 'public.subscription_plans'::regclass
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_plan_key_version_key unique (plan_key, version);
  end if;
end $$;

create index if not exists idx_subscription_plans_version
  on public.subscription_plans(version);
create index if not exists idx_subscription_plans_effective_date
  on public.subscription_plans(effective_date);
create index if not exists idx_subscription_plans_active_version
  on public.subscription_plans(plan_key, version);

-- طھط¹ط¨ط¦ط© ط§ظپطھط±ط§ط¶ظٹط© ظ„ظ„طµظپظˆظپ ط§ظ„ظ…ظˆط¬ظˆط¯ط© (ط¢ظ…ظ†ط© ظ„ظ„ط¥ط¹ط§ط¯ط©)
update public.subscription_plans
set version = 1,
    effective_date = coalesce(effective_date, now() at time zone 'utc')
where version is null or effective_date is null;

comment on column public.subscription_plans.version is
  'P0: Plan version number. Higher version = newer plan for same plan_key.';
comment on column public.subscription_plans.effective_date is
  'P0: UTC timestamp when this plan version becomes effective.';

-- ----------------------------------------------------------------------------
-- 4) RPC: get_active_plan_version â€” ط¥ط±ط¬ط§ط¹ ط§ظ„ط³ط·ط± ط§ظ„ظپط¹ظ‘ط§ظ„ ظ„ط¨ط§ظ‚ط© ظ…ط¹ظٹظ†ط©
--    ط§ط®طھظٹط§ط±: effective_date <= now() AND ط£ط¹ظ„ظ‰ ظ†ط³ط®ط©.
-- ----------------------------------------------------------------------------
create or replace function public.get_active_plan_version(p_plan_key text)
returns table (
  plan_key             text,
  name                 text,
  display_name_ar      text,
  profile_limit        int,
  messages_per_2h      int,
  uploads_daily        int,
  max_file_size_mb     int,
  file_types           text[],
  video_audio_exclusive boolean,
  priority_queue       text,
  trial_days           int,
  is_active            boolean,
  version              int,
  effective_date       timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    sp.plan_key, sp.name, sp.display_name_ar, sp.profile_limit, sp.messages_per_2h, sp.uploads_daily,
    sp.max_file_size_mb, sp.file_types, sp.video_audio_exclusive, sp.priority_queue,
    sp.trial_days, sp.is_active, sp.version, sp.effective_date
  from public.subscription_plans sp
  where sp.plan_key = p_plan_key
    and sp.is_active = true
    and sp.effective_date <= now() at time zone 'utc'
  order by sp.version desc
  limit 1;
end;
$$;

revoke all on function public.get_active_plan_version(text) from public;
revoke all on function public.get_active_plan_version(text) from authenticated;
revoke all on function public.get_active_plan_version(text) from anon;
grant execute on function public.get_active_plan_version(text) to service_role;

comment on function public.get_active_plan_version(text) is
  'P0: Returns the active plan version for a plan_key (effective_date <= now, highest version). service_role only.';

-- ----------------------------------------------------------------------------
-- 5) ط¬ط¯ظˆظ„ admin_audit_log â€” طھط®ط²ظٹظ† DB-backed ظ„طھط¯ظ‚ظٹظ‚ ط¥ط¬ط±ط§ط،ط§طھ ط§ظ„ط£ط¯ظ…ظ†
--    ظٹط­ظ„ ظ…ط­ظ„ adminStore in-memory ظپظٹ lib/ai/usage-audit.ts ظ„ظ„ط¥ظ†طھط§ط¬.
--    ظ„ط§ ظٹظڈط³ظ…ط­ ط¨ط§ظ„'أ©criture ط§ظ„ظ…ط¨ط§ط´ط±ط© ظ…ظ† ط§ظ„ط¹ظ…ظٹظ„ (RLS ظ…ط¹ policy ط§ظ„ط±ظپط¶).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor          uuid references auth.users(id) on delete set null,
  actor_email    text,
  action         text not null default '',              -- ظ…ط«ظ„: subscription-activate, users-ban, manage-roles
  resource_type  text not null default '',              -- user, plan, subscription, admin, reward
  resource_id    text,                       -- user_id, plan_key, code, ط¥ظ„ط®
  details        jsonb default '{}',         -- ط³ظٹط§ظ‚ ط¥ط¶ط§ظپظٹ (ط³ط¨ط¨ ط§ظ„ط­ط¸ط±طŒ ظ…ط¯ط© ط§ظ„ط¨ط§ظ‚ط©طŒ ط¥ظ„ط®)
  result         text not null default 'PASS' check (result in ('PASS', 'FAIL', 'BLOCKED')),
  created_at     timestamptz not null default now()
);

-- add missing columns if table already existed without them (idempotent safety)
alter table public.admin_audit_log add column if not exists actor uuid references auth.users(id) on delete set null;
alter table public.admin_audit_log add column if not exists actor_email text;
alter table public.admin_audit_log add column if not exists action text not null default '';
alter table public.admin_audit_log add column if not exists resource_type text not null default '';
alter table public.admin_audit_log add column if not exists resource_id text;
alter table public.admin_audit_log add column if not exists details jsonb default '{}';
alter table public.admin_audit_log add column if not exists result text not null default 'PASS' check (result in ('PASS', 'FAIL', 'BLOCKED'));
alter table public.admin_audit_log add column if not exists created_at timestamptz not null default now();

create index if not exists idx_admin_audit_log_actor on public.admin_audit_log(actor);
create index if not exists idx_admin_audit_log_action on public.admin_audit_log(action);
create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_log_resource on public.admin_audit_log(resource_type, resource_id);

-- طھظپط¹ظٹظ„ RLS
alter table public.admin_audit_log enable row level security;

-- ط³ظٹط§ط³ط© ط§ظ„ظ‚ط±ط§ط،ط©: ظپظ‚ط· ط§ظ„ط£ط¯ظ…ظ† ط§ظ„ظ…ط³ط¬ظ„ ظپظٹ site_admins ظٹظ…ظƒظ†ظ‡ ظ‚ط±ط§ط،ط© ط§ظ„ط³ط¬ظ„
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='site_admins') then
    drop policy if exists "admin_audit_log: admin read" on public.admin_audit_log;
    create policy "admin_audit_log: admin read"
      on public.admin_audit_log for select
      using (exists (
        select 1 from public.site_admins
        where site_admins.user_id = auth.uid()
      ));
  end if;
end $$;

-- ظ…ظ†ط¹ ط§ظ„ظƒطھط§ط¨ط©/ط§ظ„طھط­ط¯ظٹط«/ط§ظ„ط­ط°ظپ ظ…ظ† ط£ظٹ ط¹ظ…ظٹظ„ (ط¬ظ…ظٹط¹ ط§ظ„ظƒطھط§ط¨ط§طھ طھط£طھظٹ ظ…ظ† ط§ظ„ط³ظٹط±ظپط± ط¹ط¨ط± service_role)
drop policy if exists "admin_audit_log: no client insert" on public.admin_audit_log;
create policy "admin_audit_log: no client insert"
  on public.admin_audit_log for insert
  with check (false);

drop policy if exists "admin_audit_log: no client update" on public.admin_audit_log;
create policy "admin_audit_log: no client update"
  on public.admin_audit_log for update
  using (false);

drop policy if exists "admin_audit_log: no client delete" on public.admin_audit_log;
create policy "admin_audit_log: no client delete"
  on public.admin_audit_log for delete
  using (false);

comment on table public.admin_audit_log is
  'P0: Immutable audit log for sensitive admin actions. Written by server (service_role) only. RLS blocks all client writes.';

-- ----------------------------------------------------------------------------
-- 6) ط§ظ„طھط­ظ‚ظ‚ ط§ظ„ط³ط±ظٹط¹ ط¨ط¹ط¯ ط§ظ„طھط´ط؛ظٹظ„ (ط§ط®طھظٹط§ط±ظٹ â€” ظٹظ…ظƒظ† طھط´ط؛ظٹظ„ظ‡ ظٹط¯ظˆظٹط§ظ‹ ظپظٹ Supabase SQL Editor)
-- ----------------------------------------------------------------------------
-- select count(*) as idempotency_rows from public.quota_idempotency;
-- select count(*) as audit_rows from public.admin_audit_log;
-- select proname, prosecdef as is_security_definer from pg_proc where proname in ('consume_subscription_quota','get_active_plan_version');
-- select grantee, privilege_type from information_schema.routine_privileges
--   where routine_name in ('consume_subscription_quota','get_active_plan_version');
-- ============================================================================




