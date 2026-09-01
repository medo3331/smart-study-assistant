-- ============================================================================
-- Phase B + C — Per-Model + Per-Agent + Guest Rate Limits
-- التاريخ: 2 سبتمبر 2026
--
-- الهدف:
--   Phase B: تخزين model/agent في ai_credit_ledger.metadata لدعم:
--            - Per-Model: super 5/24h, ultra 3/24h
--            - Per-Agent: quiz 8/3h, research 6/5h, doc 6/5h, image 4/5h
--   Phase C: Guest 5/24h — نفس الجدول، نفس الدالة، لكن الفحص في lib/ai/rate-limit.ts
--            عبر checkGuestRateLimit (يعد كل ai_reserve للـ anon user في 24h)
--
-- ما يتغير:
--   - reserve_ai_credit تُوسّع لتقبل p_model و p_agent (اختياريان)
--   - metadata تُخزن kind + model + agent معًا (للتوافق الرجعي: القديم بدون model لا يُحتسب)
--   - دالة مساعدة update_ai_ledger_metadata للتحديث best-effort إذا فشلت الإضافة المباشرة
--   - لا جدول جديد، لا تغيير RLS، لا تغيير API
--
-- التوافق الرجعي:
--   - استدعاء بـ 2 أو 3 معاملات يعمل كما قبل (p_model/p_agent افتراضي null)
--   - الصفوف القديمة بدون model/agent تُتجاهل في فحص Per-Model/Per-Agent (fail-open آمن)
--
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار)
-- ============================================================================

-- إزالة التوقيع القديم (3 معاملات) قبل إنشاء التوقيع الجديد (5 معاملات)
drop function if exists public.reserve_ai_credit(uuid, text, text);

create or replace function public.reserve_ai_credit(
  p_user_id uuid,
  p_ref_id text,
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

  -- تطبيع النوع
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

  -- تحديد الحد والنافذة حسب النوع + الخطة (Phase A)
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

  -- عد الطلبات داخل النافذة حسب النوع (Phase A) — للـ overdraft المجاني
  select count(*)::int into v_window_count
  from public.ai_credit_ledger
  where user_id = p_user_id
    and reason = 'ai_reserve'
    and created_at >= (now() - (v_window_hours || ' hours')::interval)
    and coalesce(metadata->>'kind', 'text') = v_normalized_kind;

  if v_balance < 1 then
    if v_window_count >= v_limit then
      raise exception 'reserve_ai_credit: insufficient credits (balance %, required 1, window %h %/% used, kind=%)', v_balance, v_window_hours, v_window_count, v_limit, v_normalized_kind;
    end if;
  end if;

  -- بناء metadata مع model/agent (Phase B)
  v_meta := jsonb_build_object('phase', 'H.2-BC', 'kind', v_normalized_kind, 'reserved_at', now(), 'free_overdraft', v_balance < 1);
  if v_model is not null then
    v_meta := v_meta || jsonb_build_object('model', v_model);
  end if;
  if v_agent is not null then
    v_meta := v_meta || jsonb_build_object('agent', v_agent);
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, -1, 'ai_reserve', p_ref_id, v_meta);

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;

  return query select true::boolean, false::boolean, v_new_balance;
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text, text, text, text) from public;
grant execute on function public.reserve_ai_credit(uuid, text, text, text, text) to authenticated, service_role;

-- للتوافق: Postgres يتعامل مع default params تلقائياً، لا حاجة لـ overload منفصل

-- ============================================================================
-- Helper: update_ai_ledger_metadata — best-effort enrichment for Phase B
-- يُستخدم عندما يكون reserve القديم لا يخزن model/agent مباشرة
-- ============================================================================
create or replace function public.update_ai_ledger_metadata(
  p_user_id uuid,
  p_ref_id text,
  p_model text default null,
  p_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row_id uuid;
  v_meta jsonb;
begin
  if p_user_id is null or p_ref_id is null or btrim(p_ref_id) = '' then
    return false;
  end if;
  if auth.uid() is not null and auth.uid() != p_user_id and coalesce((auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'update_ai_ledger_metadata: forbidden';
  end if;

  select id, metadata into v_row_id, v_meta
  from public.ai_credit_ledger
  where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id
  limit 1;

  if v_row_id is null then
    return false;
  end if;

  if p_model is not null and btrim(p_model) <> '' then
    v_meta := v_meta || jsonb_build_object('model', btrim(p_model));
  end if;
  if p_agent is not null and btrim(p_agent) <> '' then
    v_meta := v_meta || jsonb_build_object('agent', btrim(p_agent));
  end if;

  update public.ai_credit_ledger set metadata = v_meta where id = v_row_id;
  return true;
end;
$$;

revoke all on function public.update_ai_ledger_metadata(uuid, text, text, text) from public;
grant execute on function public.update_ai_ledger_metadata(uuid, text, text, text) to authenticated, service_role;

-- فهرس اختياري لتسريع عد النافذة حسب metadata (GIN) — آمن للتكرار
create index if not exists ai_credit_ledger_metadata_gin on public.ai_credit_ledger using gin (metadata);
