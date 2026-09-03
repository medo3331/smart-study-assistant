-- ============================================================================
-- Phase 0.5 — Atomic Premium Trial SQL (EXECUTABLE — User approved 2026-09-03)
-- Blocker removal ONLY — no UI, no /plans, no /shop, no Study Booster, no AI Router
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table: premium_trial_consumed — one-time trial guard (DB-level PK)
-- ---------------------------------------------------------------------------
create table if not exists public.premium_trial_consumed (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consumed_at timestamptz not null default now(),
  trial_ref text not null unique,
  entitlement_id uuid references public.entitlements(id) on delete set null
);

alter table public.premium_trial_consumed enable row level security;

drop policy if exists "trial_consumed: owner reads" on public.premium_trial_consumed;
create policy "trial_consumed: owner reads"
  on public.premium_trial_consumed for select using (auth.uid() = user_id);

-- No insert/update/delete policies for client — only RPC (security definer)

-- ---------------------------------------------------------------------------
-- 2) RPC: claim_premium_trial() — atomic, server-only, no user-controlled params
-- ---------------------------------------------------------------------------
create or replace function public.claim_premium_trial()
returns table (
  ok boolean,
  code text,
  spent int,
  balance int,
  expires_at timestamptz,
  trial_ref text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid        uuid := auth.uid();
  v_price      int := 500;
  v_ref        text;
  v_exp        timestamptz;
  v_balance    int;
  v_ent_id     uuid;
begin
  -- 1) Authenticated check
  if v_uid is null then
    return query select false, 'unauthorized'::text, 0, 0, null, null;
    return;
  end if;

  -- Anonymous guard (same convention as award_coins / purchase_item)
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return query select false, 'unauthorized'::text, 0, 0, null, null;
    return;
  end if;

  -- 2) One-time guard: check premium_trial_consumed
  if exists (select 1 from public.premium_trial_consumed where user_id = v_uid) then
    return query select false, 'already_claimed'::text, 0,
      coalesce((select sum(amount)::int from public.coin_ledger where user_id = v_uid), 0),
      null, null;
    return;
  end if;

  -- 3) Lock wallet (FOR UPDATE — serializes concurrent requests for same user)
  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  -- 4) Calculate balance (same mechanism as purchase_item)
  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  -- 5) Verify balance
  if v_balance < v_price then
    return query select false, 'insufficient_coins'::text, 0, v_balance, null, null;
    return;
  end if;

  -- 6) Deterministic replay-unique trial ref (includes user + random)
  v_ref := 'premium_trial:' || v_uid::text || ':' || gen_random_uuid()::text;
  v_exp := (now() at time zone 'utc') + interval '7 days';

  -- 7) Insert debit (spend) in same transaction scope
  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
  values (v_uid, 'premium_trial', -v_price, 'spend', v_ref,
    jsonb_build_object('kind', 'plan', 'value', 'premium', 'price', v_price, 'duration_days', 7, 'trial_ref', v_ref));

  -- 8) Insert entitlement (same transaction — rollback covers both if either fails)
  insert into public.entitlements (user_id, kind, value, expires_at, metadata)
  values (v_uid, 'plan', 'premium', v_exp,
    jsonb_build_object('source', 'premium_trial_0_5', 'price', v_price, 'duration_days', 7, 'trial_ref', v_ref))
  returning id into v_ent_id;

  -- 9) Insert consumed marker (PK prevents any future claim — one-time forever)
  insert into public.premium_trial_consumed (user_id, consumed_at, trial_ref, entitlement_id)
  values (v_uid, now(), v_ref, v_ent_id);

  -- 10) Recompute final balance (after debit)
  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  return query select true, 'success'::text, v_price, v_balance, v_exp, v_ref;
end;
$$;

revoke all on function public.claim_premium_trial() from public;
revoke execute on function public.claim_premium_trial() from anon;
grant execute on function public.claim_premium_trial() to authenticated;
