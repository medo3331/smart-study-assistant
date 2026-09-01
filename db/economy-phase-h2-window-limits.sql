-- ============================================================================
-- Phase H.2 — Windowed Rate Limit (10 text / 3h, 6 vision / 5h)
-- التاريخ: 2 سبتمبر 2026
--
-- المواصفات الجديدة:
--   Text:  10 طلبات / 3 ساعات (sliding window)
--   Vision/Files: 6 طلبات / 5 ساعات (sliding window)
--   Premium: غير محدود (1000 عملياً)
--
-- التغيير عن H.1:
--   H.1 كان daily 20/100 — الآن windowed per-kind
--   reserve_ai_credit الآن يأخذ p_kind ('text'|'vision') ويخزن metadata.kind
--   ويطبق overdraft حسب النافذة وليس اليوم
--   متوافق رجعياً: استدعاء بـ 2 معاملات يعمل (p_kind افتراضي 'text')
--
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار)
-- ============================================================================

-- إزالة التوقيع القديم إذا كان يمنع إنشاء التوقيع الجديد (Postgres يفرق بالعدد)
drop function if exists public.reserve_ai_credit(uuid, text);

create or replace function public.reserve_ai_credit(
  p_user_id uuid,
  p_ref_id text,
  p_kind text default 'text'
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

  -- تطبيع النوع: vision/file/image/ocr → vision، غير ذلك → text
  if p_kind in ('vision','file','image','ocr') then
    v_normalized_kind := 'vision';
  else
    v_normalized_kind := 'text';
  end if;

  -- تحديد الحد والنافذة حسب النوع + الخطة
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
    -- Premium غير محدود عملياً
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

  -- عد الطلبات داخل النافذة حسب النوع (metadata.kind)
  -- الصفوف القديمة بدون kind تُحتسب كـ text (للتوافق)
  select count(*)::int into v_window_count
  from public.ai_credit_ledger
  where user_id = p_user_id
    and reason = 'ai_reserve'
    and created_at >= (now() - (v_window_hours || ' hours')::interval)
    and coalesce(metadata->>'kind', 'text') = v_normalized_kind;

  -- إذا كان الرصيد كافي: اسمح دائمًا (حتى بعد الحد — Rate Limit سيمنع قبل الوصول هنا)
  -- إذا كان الرصيد غير كافي: اسمح فقط ضمن النافذة (overdraft مجاني)
  if v_balance < 1 then
    if v_window_count >= v_limit then
      raise exception 'reserve_ai_credit: insufficient credits (balance %, required 1, window %h %/% used, kind=%)', v_balance, v_window_hours, v_window_count, v_limit, v_normalized_kind;
    end if;
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, -1, 'ai_reserve', p_ref_id, jsonb_build_object('phase', 'H.2', 'kind', v_normalized_kind, 'reserved_at', now(), 'free_overdraft', v_balance < 1));

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;

  return query select true::boolean, false::boolean, v_new_balance;
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text, text) from public;
grant execute on function public.reserve_ai_credit(uuid, text, text) to authenticated, service_role;

-- للتوافق: اجعل الاستدعاء بـ 2 معاملات يعمل أيضاً عبر alias
-- Postgres يتعامل مع default param تلقائياً، لكن نعيد إنشاء alias ثنائي للتأكد
-- (لا حاجة لـ overload منفصل — default يكفي)
