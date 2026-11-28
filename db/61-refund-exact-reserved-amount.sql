-- ============================================================================
-- 61 — إصلاح refund_ai_credit: استرجاع المبلغ المحجوز الفعلي (D5)
-- ============================================================================
-- ⚠️ ملف migration فقط — لم يُنفَّذ على أي قاعدة بيانات. يُراجع ويُنفَّذ يدويًا.
--
-- العيب المؤكد (Audit D5): refund_ai_credit تُدخل delta = +1 ثابت بغض النظر
-- عن مبلغ الحجز، بينما reserve_ai_credit تخصم -p_amount (قد يكون > 1).
-- النتيجة: خصم زائد على المستخدم عند فشل عملية حُجزت بأكثر من كريديت.
--
-- الإصلاح: الـ refund يقرأ المبلغ من سجل الحجز الأصلي:
--   1) metadata->>'amount' إن وُجد (كما يكتبه credit-pricing-reserve.sql).
--   2) وإلا abs(delta) لسجل ai_reserve بنفس ref_id.
-- يبقى idempotent: لا يُدخل أكثر من ai_refund واحد لكل (user, ref_id) —
-- محمي أيضًا بالفهرس الفريد ai_credit_ledger_user_reason_ref_unique.
-- لا يسمح باسترجاع أكبر من المبلغ المحجوز فعليًا.
-- ============================================================================

drop function if exists public.refund_ai_credit(uuid, text);

create or replace function public.refund_ai_credit(
  p_user_id uuid,
  p_ref_id text
)
returns table (refunded boolean, already_refunded boolean, new_balance int, refunded_amount int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_has_reserve   boolean;
  v_already       boolean;
  v_new_balance   int;
  v_reserved_abs  int;
  v_amount        int;
begin
  if p_user_id is null or p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'refund_ai_credit: p_user_id and p_ref_id required';
  end if;

  if auth.uid() is not null and auth.uid() != p_user_id and coalesce((auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'refund_ai_credit: forbidden';
  end if;

  insert into public.coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = p_user_id for update;

  select exists(
    select 1 from public.ai_credit_ledger
    where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id
  ) into v_has_reserve;
  if not v_has_reserve then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    return query select false::boolean, false::boolean, v_new_balance, 0::int;
    return;
  end if;

  select exists(
    select 1 from public.ai_credit_ledger
    where user_id = p_user_id and reason = 'ai_refund' and ref_id = p_ref_id
  ) into v_already;
  if v_already then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    select coalesce(sum(delta),0)::int into v_amount
      from public.ai_credit_ledger
      where user_id = p_user_id and reason = 'ai_refund' and ref_id = p_ref_id;
    return query select true::boolean, true::boolean, v_new_balance, v_amount;
    return;
  end if;

  -- المبلغ المحجوز: metadata.amount أولًا، وإلا abs(delta) لسجل الحجز.
  select coalesce(
    nullif((metadata->>'amount')::int, 0),
    abs(delta)
  )::int
  into v_reserved_abs
  from public.ai_credit_ledger
  where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id
  order by created_at asc
  limit 1;

  if v_reserved_abs is null or v_reserved_abs < 1 then
    v_reserved_abs := 1;
  end if;

  -- حماية إضافية: لا استرجاع يتجاوز صافي ما لم يُستهلك من الحجز.
  -- (الإصدار الحالي: consume/settle غير موجودين، فالمحجوز كاملًا قابل للاسترجاع.)
  v_amount := v_reserved_abs;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (
    p_user_id,
    v_amount,
    'ai_refund',
    p_ref_id,
    jsonb_build_object('phase', 'F-exact-refund', 'refunded_amount', v_amount, 'refunded_at', now())
  );

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
  return query select true::boolean, false::boolean, v_new_balance, v_amount;
end;
$$;

revoke all on function public.refund_ai_credit(uuid, text) from public;
grant execute on function public.refund_ai_credit(uuid, text) to authenticated, service_role;
