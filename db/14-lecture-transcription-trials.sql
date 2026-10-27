-- db/XX-lecture-transcription-trials.sql
-- Server-side trial usage accounting for paid lecture transcription.
-- Run manually in Supabase SQL Editor after review. Do NOT auto-apply.

create table if not exists public.lecture_transcription_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_count integer not null default 0 check (used_count >= 0 and used_count <= 3),
  updated_at timestamptz not null default now()
);

alter table public.lecture_transcription_trials enable row level security;

create table if not exists public.lecture_transcription_trial_operations (
  ref_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('reserved', 'completed', 'refunded')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  refunded_at timestamptz
);

create index if not exists idx_ltt_ops_user_status_created
  on public.lecture_transcription_trial_operations (user_id, status, created_at);

alter table public.lecture_transcription_trial_operations enable row level security;

-- Users can read their own usage; writes only via RPC (security definer).
create policy if not exists "ltt_select_own"
  on public.lecture_transcription_trials
  for select using (auth.uid() = user_id);

create policy if not exists "ltto_select_own"
  on public.lecture_transcription_trial_operations
  for select using (auth.uid() = user_id);

-- Atomic reserve: increments only if under limit. Operation row provides idempotency.
create or replace function public.reserve_lecture_transcription_trial(p_user_id uuid, p_ref_id text)
returns table(ok boolean, remaining integer, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
  v_inserted integer;
begin
  if p_user_id is null or p_ref_id is null or btrim(p_ref_id) = '' then
    return query select false, 0, 'invalid'::text;
    return;
  end if;
  if auth.uid() is distinct from p_user_id then
    return query select false, 0, 'forbidden'::text;
    return;
  end if;

  -- A reference is globally unique; it must never be replayed for another user.
  if exists (
    select 1 from public.lecture_transcription_trial_operations
    where ref_id = p_ref_id and user_id is distinct from p_user_id
  ) then
    return query select false, 0, 'forbidden'::text;
    return;
  end if;

  -- Idempotent replay for the same operation reference.
  if exists (
    select 1 from public.lecture_transcription_trial_operations
    where ref_id = p_ref_id and user_id = p_user_id
  ) then
    select coalesce(used_count, 0) into v_used
    from public.lecture_transcription_trials
    where user_id = p_user_id;
    v_used := coalesce(v_used, 0);
    return query select true, greatest(0, 3 - v_used)::integer, null::text;
    return;
  end if;

  insert into public.lecture_transcription_trials(user_id, used_count)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  insert into public.lecture_transcription_trial_operations(ref_id, user_id, status)
  values (p_ref_id, p_user_id, 'reserved')
  on conflict (ref_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    if exists (
      select 1 from public.lecture_transcription_trial_operations
      where ref_id = p_ref_id and user_id is distinct from p_user_id
    ) then
      return query select false, 0, 'forbidden'::text;
      return;
    end if;
    select coalesce(used_count, 0) into v_used
    from public.lecture_transcription_trials
    where user_id = p_user_id;
    v_used := coalesce(v_used, 0);
    return query select true, greatest(0, 3 - v_used)::integer, null::text;
    return;
  end if;

  select used_count into v_used
  from public.lecture_transcription_trials
  where user_id = p_user_id
  for update;

  if v_used >= 3 then
    update public.lecture_transcription_trial_operations
    set status = 'refunded', refunded_at = now()
    where ref_id = p_ref_id and status = 'reserved';
    return query select false, 0, 'exhausted'::text;
    return;
  end if;

  update public.lecture_transcription_trials
  set used_count = used_count + 1, updated_at = now()
  where user_id = p_user_id;

  return query select true, (3 - (v_used + 1))::integer, null::text;
end;
$$;

-- Complete: mark a reserved operation as completed after a valid transcript.
create or replace function public.complete_lecture_transcription_trial(p_user_id uuid, p_ref_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or p_ref_id is null then
    return;
  end if;
  if auth.uid() is distinct from p_user_id then
    return;
  end if;
  update public.lecture_transcription_trial_operations
  set status = 'completed', completed_at = now()
  where ref_id = p_ref_id
    and user_id = p_user_id
    and status = 'reserved';
end;
$$;

-- Refund: at most once, only for a reserved operation owned by the caller.
create or replace function public.refund_lecture_transcription_trial(p_user_id uuid, p_ref_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if p_user_id is null or p_ref_id is null then
    return;
  end if;
  if auth.uid() is distinct from p_user_id then
    return;
  end if;

  select status into v_status
  from public.lecture_transcription_trial_operations
  where ref_id = p_ref_id and user_id = p_user_id
  for update;

  if v_status is distinct from 'reserved' then
    return;
  end if;

  update public.lecture_transcription_trial_operations
  set status = 'refunded', refunded_at = now()
  where ref_id = p_ref_id and user_id = p_user_id and status = 'reserved';

  update public.lecture_transcription_trials
  set used_count = greatest(used_count - 1, 0), updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- Recovery: trusted server-side only. Refunds reserved operations older than timeout.
create or replace function public.recover_abandoned_lecture_transcription_trials(
  p_timeout_minutes integer default 30,
  p_limit integer default 100
)
returns table(recovered integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recovered integer := 0;
  v_ref text;
  v_user uuid;
  v_rows integer;
begin
  if coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'recover_abandoned_lecture_transcription_trials: forbidden — service_role only';
  end if;
  if p_timeout_minutes is null or p_timeout_minutes < 1 then
    p_timeout_minutes := 30;
  end if;
  if p_limit is null or p_limit < 1 then
    p_limit := 100;
  end if;

  for v_ref, v_user in
    select ref_id, user_id
    from public.lecture_transcription_trial_operations
    where status = 'reserved'
      and created_at < now() - make_interval(mins => p_timeout_minutes)
    order by created_at
    limit p_limit
    for update skip locked
  loop
    update public.lecture_transcription_trial_operations
    set status = 'refunded', refunded_at = now()
    where ref_id = v_ref and status = 'reserved';
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      update public.lecture_transcription_trials
      set used_count = greatest(used_count - 1, 0), updated_at = now()
      where user_id = v_user;
      v_recovered := v_recovered + 1;
    end if;
  end loop;

  return query select v_recovered;
end;
$$;

-- Permissions
revoke execute on function public.reserve_lecture_transcription_trial(uuid, text) from public;
revoke execute on function public.complete_lecture_transcription_trial(uuid, text) from public;
revoke execute on function public.refund_lecture_transcription_trial(uuid, text) from public;
revoke execute on function public.recover_abandoned_lecture_transcription_trials(integer, integer) from public;

revoke execute on function public.reserve_lecture_transcription_trial(uuid, text) from anon;
revoke execute on function public.complete_lecture_transcription_trial(uuid, text) from anon;
revoke execute on function public.refund_lecture_transcription_trial(uuid, text) from anon;
revoke execute on function public.recover_abandoned_lecture_transcription_trials(integer, integer) from anon;
revoke execute on function public.recover_abandoned_lecture_transcription_trials(integer, integer) from authenticated;

grant execute on function public.reserve_lecture_transcription_trial(uuid, text) to authenticated;
grant execute on function public.complete_lecture_transcription_trial(uuid, text) to authenticated;
grant execute on function public.refund_lecture_transcription_trial(uuid, text) to authenticated;
grant execute on function public.recover_abandoned_lecture_transcription_trials(integer, integer) to service_role;

