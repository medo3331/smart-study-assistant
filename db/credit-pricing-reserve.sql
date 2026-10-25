-- ============================================================================
-- Credit Pricing Amount — reserve with per-operation cost
-- ============================================================================

drop function if exists public.reserve_ai_credit(uuid, text);
drop function if exists public.reserve_ai_credit(uuid, text, text);
drop function if exists public.reserve_ai_credit(uuid, text, text, text, text);

create or replace function public.reserve_ai_credit(
  p_user_id uuid,
  p_ref_id text,
  p_amount int default 1,
  p_kind text default 'text',
  p_model text default null,
  p_agent text default null
)
returns table (reserved boolean, already_existed boolean, new_balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_balance int;
  v_exists boolean;
  v_new_balance int;
  v_window_count int;
  v_window_hours int;
  v_limit int;
  v_is_premium boolean := false;
  v_normalized_kind text;
  v_model text;
  v_agent text;
  v_meta jsonb;
begin
  if p_user_id is null then
    raise exception 'reserve_ai_credit: p_user_id required';
  end if;
  if p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'reserve_ai_credit: p_ref_id required';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'reserve_ai_credit: p_amount must be >= 1';
  end if;

  if auth.uid() is not null and auth.uid() != p_user_id and coalesce((auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'reserve_ai_credit: forbidden';
  end if;

  insert into public.coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = p_user_id for update;

  select exists(select 1 from public.ai_credit_ledger where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id) into v_exists;
  if v_exists then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    return query select true::boolean, true::boolean, v_new_balance;
    return;
  end if;

  select coalesce(sum(delta),0)::int into v_balance from public.ai_credit_ledger where user_id = p_user_id;

  if p_kind in ('vision','file','image','ocr') then
    v_normalized_kind := 'vision';
  else
    v_normalized_kind := 'text';
  end if;

  v_model := null;
  if p_model is not null and btrim(p_model) <> '' then
    v_model := btrim(p_model);
  end if;
  v_agent := null;
  if p_agent is not null and btrim(p_agent) <> '' then
    v_agent := btrim(p_agent);
  end if;

  begin
    v_is_premium := public.has_entitlement(p_user_id, 'plan', 'premium');
  exception when others then
    v_is_premium := false;
  end;
  if not v_is_premium then
    begin
      v_is_premium := public.has_entitlement(p_user_id, 'feature', 'premium-ai');
    exception when others then
      v_is_premium := false;
    end;
  end if;

  if v_is_premium then
    v_limit := 1000;
    v_window_hours := case when v_normalized_kind = 'vision' then 5 else 3 end;
  else
    if v_normalized_kind = 'vision' then
      v_limit := 6;
      v_window_hours := 5;
    else
      v_limit := 10;
      v_window_hours := 3;
    end if;
  end if;

  select count(*)::int into v_window_count
  from public.ai_credit_ledger
  where user_id = p_user_id
    and reason = 'ai_reserve'
    and created_at >= (now() - (v_window_hours || ' hours')::interval)
    and coalesce(metadata->>'kind', 'text') = v_normalized_kind;

  if v_balance < p_amount then
    if v_balance >= 1 then
      raise exception 'reserve_ai_credit: insufficient credits (balance %, required %)', v_balance, p_amount;
    end if;
    if v_window_count >= v_limit then
      raise exception 'reserve_ai_credit: insufficient credits (balance %, required %, window %h %/% used, kind=%)', v_balance, p_amount, v_window_hours, v_window_count, v_limit, v_normalized_kind;
    end if;
  end if;

  v_meta := jsonb_build_object('phase', 'credit-pricing', 'kind', v_normalized_kind, 'amount', p_amount, 'reserved_at', now(), 'free_overdraft', v_balance < p_amount);
  if v_model is not null then
    v_meta := v_meta || jsonb_build_object('model', v_model);
  end if;
  if v_agent is not null then
    v_meta := v_meta || jsonb_build_object('agent', v_agent);
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, -p_amount, 'ai_reserve', p_ref_id, v_meta);

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;

  return query select true::boolean, false::boolean, v_new_balance;
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text, int, text, text, text) from public;
grant execute on function public.reserve_ai_credit(uuid, text, int, text, text, text) to authenticated, service_role;
