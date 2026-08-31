-- ============================================================================
-- Phase F — AI Credits Runtime (استهلاك Credits مع حجز/استرجاع آمن)
-- التاريخ: ٢ سبتمبر ٢٠٢٦
--
-- الهدف:
--   ربط AiRouter بـ ai_credit_ledger عبر حجز ذري + تأكيد/استرجاع idempotent
--   1 request = 1 credit — لا يستهلك عند فشل الـ provider
--   requestId مولّد في السيرفر فقط — لا يمكن للكلاينت تزويره
--
-- Scope: additive فقط — لا تغيير XP/Coins/Subscription/Payments/Providers
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار)
-- يتطلب Phase D/E مطبقة (ai_credit_ledger + shop_catalog useful)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) التأكد من جدول ai_credit_ledger و فهرسه (موجود من Phase D)
-- ----------------------------------------------------------------------------
-- لا حاجة لإنشاء جدول جديد — نستخدم ai_credit_ledger مباشرة مع reason مميزة
-- reason = 'ai_reserve' للحجز، 'ai_refund' للاسترجاع، 'store_purchase' للشراء
-- الاعتماد على الفهرس الجزئي الفريد (user_id, reason, ref_id) حيث ref_id ليس null
-- الموجود من Phase D: create unique index ... on ai_credit_ledger (user_id, reason, ref_id) where ref_id is not null

-- ----------------------------------------------------------------------------
-- 2) RPC: حجز 1 credit بشكل ذري (idempotent + يمنع السالب + يمنع Race)
-- ----------------------------------------------------------------------------
-- يفحص الرصيد الحالي (SUM) داخل نفس المعاملة بعد قفل الصف
-- إذا كان الرصيد >= 1: يدرج delta=-1 مع reason='ai_reserve' و ref_id=requestId
-- إذا كان نفس ref_id موجوداً مسبقاً لنفس المستخدم/السبب: يعتبر محجوزاً مسبقاً (idempotent) — لا خصم ثانٍ
-- إذا كان الرصيد < 1: يرمي 'insufficient credits'

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
begin
  if p_user_id is null then
    raise exception 'reserve_ai_credit: p_user_id required';
  end if;
  if p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'reserve_ai_credit: p_ref_id required';
  end if;

  -- فقط service_role أو المالك نفسه يمكنه الحجز — نسمح للمالك (authenticated) هنا لأن unifiedAI ينادى من السيرفر بصلاحيات المستخدم
  -- لكن نتحقق أن auth.uid() = p_user_id أو service_role
  if auth.uid() is not null and auth.uid() != p_user_id and coalesce((auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'reserve_ai_credit: forbidden';
  end if;

  -- تأكد من وجود محفظة (للقفل) — نستخدم coin_wallets كقفل عام للمستخدم (أو pg_advisory_xact_lock)
  insert into public.coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = p_user_id for update;

  -- تحقق idempotency أولاً: هل نفس الحجز موجود؟
  select exists(select 1 from public.ai_credit_ledger where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id) into v_exists;
  if v_exists then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    return query select true::boolean, true::boolean, v_new_balance;
    return;
  end if;

  -- احسب الرصيد الحالي (يشمل كل الحجوزات والاسترجاعات السابقة)
  select coalesce(sum(delta),0)::int into v_balance from public.ai_credit_ledger where user_id = p_user_id;

  if v_balance < 1 then
    raise exception 'reserve_ai_credit: insufficient credits (balance %, required 1)', v_balance;
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, -1, 'ai_reserve', p_ref_id, jsonb_build_object('phase', 'F', 'reserved_at', now()));

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;

  return query select true::boolean, false::boolean, v_new_balance;
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text) from public;
grant execute on function public.reserve_ai_credit(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) RPC: تأكيد الاستهلاك (لا يفعل شيئاً — الحجز نفسه هو الاستهلاك)
-- ----------------------------------------------------------------------------
-- في Phase F: الحجز هو الخصم النهائي عند النجاح — لا حاجة لإدراج صف إضافي
-- لكن نوفر دالة confirm للوضوح والـ idempotency المستقبلية (تتحقق أن الحجز موجود)

create or replace function public.confirm_ai_credit(
  p_user_id uuid,
  p_ref_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_exists boolean;
begin
  if p_user_id is null or p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'confirm_ai_credit: p_user_id and p_ref_id required';
  end if;
  select exists(select 1 from public.ai_credit_ledger where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id) into v_exists;
  -- إذا لم يوجد حجز، نعتبره خطأ لكن لا نرمي — نرجع false ليعالجها الكود
  return v_exists;
end;
$$;

revoke all on function public.confirm_ai_credit(uuid, text) from public;
grant execute on function public.confirm_ai_credit(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) RPC: استرجاع الحجز عند الفشل (idempotent)
-- ----------------------------------------------------------------------------
-- يدرج delta=+1 مع reason='ai_refund' و ref_id نفسه
-- إذا كان الاسترجاع موجوداً مسبقاً: لا يدرج ثانية (idempotent)
-- إذا لم يكن هناك حجز أصلاً: لا يفعل شيئاً (يرجع false)

create or replace function public.refund_ai_credit(
  p_user_id uuid,
  p_ref_id text
)
returns table (refunded boolean, already_refunded boolean, new_balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_has_reserve boolean;
  v_already_refunded boolean;
  v_new_balance int;
begin
  if p_user_id is null or p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'refund_ai_credit: p_user_id and p_ref_id required';
  end if;

  if auth.uid() is not null and auth.uid() != p_user_id and coalesce((auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'refund_ai_credit: forbidden';
  end if;

  insert into public.coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = p_user_id for update;

  select exists(select 1 from public.ai_credit_ledger where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id) into v_has_reserve;
  if not v_has_reserve then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    return query select false::boolean, false::boolean, v_new_balance;
    return;
  end if;

  select exists(select 1 from public.ai_credit_ledger where user_id = p_user_id and reason = 'ai_refund' and ref_id = p_ref_id) into v_already_refunded;
  if v_already_refunded then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    return query select true::boolean, true::boolean, v_new_balance;
    return;
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, 1, 'ai_refund', p_ref_id, jsonb_build_object('phase','F','refunded_at', now()));

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
  return query select true::boolean, false::boolean, v_new_balance;
end;
$$;

revoke all on function public.refund_ai_credit(uuid, text) from public;
grant execute on function public.refund_ai_credit(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) Helper: التحقق من صلاحية الموديل عبر entitlement (للتوسع)
-- ----------------------------------------------------------------------------
-- Phase F: لا نماذج مقفلة بعد — لكن نوفر دالة has_entitlement للـ code ليستخدمها
-- موجودة من Phase D: public.has_entitlement(p_user_id uuid, p_kind text, p_value text) returns boolean
-- لا حاجة لدالة جديدة

-- ----------------------------------------------------------------------------
-- تحقق بعد التشغيل:
--   select reserve_ai_credit(auth.uid(), 'test-req-1'); -- يجب أن يخصم 1 إذا الرصيد >=1
--   select * from ai_credit_ledger where ref_id='test-req-1';
--   select refund_ai_credit(auth.uid(), 'test-req-1'); -- يرجع 1
--   select ai_credit_balance(auth.uid()); -- الرصيد نفسه قبل الحجز
-- ----------------------------------------------------------------------------
