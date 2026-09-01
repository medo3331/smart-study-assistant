-- ============================================================================
-- Phase H.1 — Rate Limit Free Allowance (fix 402 bug)
-- التاريخ: 2 سبتمبر 2026
--
-- المشكلة: ai_credit_ledger يبدأ فارغًا (sum=0) لكل مستخدم جديد
--          reserve_ai_credit كان يرفض كل طلب AI للمستخدم المسجل (402)
--          حتى للـ free models التي يجب أن تكون 20/يوم مجانًا
-- الحل: السماح بـ overdraft مجاني حتى الحد اليومي (20 free / 100 premium)
--       داخل reserve_ai_credit نفسه — بدون جدول جديد
--       + فحص Rate Limit قبل الـ reserve (lib/ai/rate-limit.ts) يرجع 429
--       reserve لا يزال idempotent + قفل + يمنع السالب بعد الحد
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار)
-- ============================================================================

create or replace function public.reserve_ai_credit(
  p_user_id uuid,
  p_ref_id text
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
  v_today_count int;
  v_limit int := 20;
  v_is_premium boolean := false;
begin
  if p_user_id is null then
    raise exception 'reserve_ai_credit: p_user_id required';
  end if;
  if p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'reserve_ai_credit: p_ref_id required';
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

  -- تحديد الحد اليومي للـ overdraft المجاني (20 free / 100 premium)
  -- نستخدم has_entitlement الموجودة — لو فشلت نعتبره free
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
  if v_is_premium then v_limit := 100; else v_limit := 20; end if;

  -- عد الطلبات اليوم (UTC midnight — نفس صيغة coin_ledger)
  select count(*)::int into v_today_count
  from public.ai_credit_ledger
  where user_id = p_user_id
    and reason = 'ai_reserve'
    and created_at >= (((now() at time zone 'utc')::date)::timestamp at time zone 'utc');

  -- إذا كان الرصيد كافي: اسمح دائمًا (حتى بعد الحد — Rate Limit سيمنع قبل الوصول هنا)
  -- إذا كان الرصيد غير كافي: اسمح فقط ضمن الحد المجاني اليومي (overdraft)
  if v_balance < 1 then
    if v_today_count >= v_limit then
      raise exception 'reserve_ai_credit: insufficient credits (balance %, required 1, daily %/% used)', v_balance, v_today_count, v_limit;
    end if;
    -- ضمن الحد المجاني — نسمح بالـ overdraft (الرصيد سيصبح سالبًا لكنه يُحسب ضمن الحد)
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, -1, 'ai_reserve', p_ref_id, jsonb_build_object('phase', 'H.1', 'reserved_at', now(), 'free_overdraft', v_balance < 1));

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;

  return query select true::boolean, false::boolean, v_new_balance;
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text) from public;
grant execute on function public.reserve_ai_credit(uuid, text) to authenticated, service_role;
