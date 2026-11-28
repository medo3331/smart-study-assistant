-- ============================================================================
-- Phase F2 — Settlement Repair (استكمال Phase 3.2e)
-- ============================================================================
-- ⚠️ **فحص قاعدة البيانات الحية (نوفمبر ٢٠٢٦) أظهر أن الدوال الحية أحدث من
-- نسخ الفرع**:
--   • reserve_ai_credit الحية توقيعها (p_user_id, p_ref_id, p_amount, p_kind,
--     p_model, p_agent, p_source) — بتدعم حجز مبلغ أكبر من 1 + FEFO على
--     credit_grants + تجاوز المالك.
--   • refund_ai_credit الحية ترجّع abs(delta الحجز) فعليًا + تعكس استهلاك
--     الـ grants (fefo_consumed / grant_consumptions) — أي أن باج
--     «الاسترجاع الثابت +1» متصلّح في الإنتاج بهجرة أحدث غير موجودة في الفرع.
--
-- لذلك هذه الهجرة **لا تلمس** الدوال الحية — تضيف فقط القطعة الناقصة:
--   settle_ai_credit: الخصم الجزئي الذري (reserve N / charge K / release N−K)
--   لعمليات متعددة الكريدت، idempotent ويحترم الفهرس الفريد
--   (user_id, reason, ref_id).
--
-- ملاحظة معروفة: الإفراج الجزئي هنا ledger-only — لا يعكس استهلاك الـ grants
-- بنِسَب (يعكسه refund_ai_credit الكامل فقط). يُحسَّن عند ربط المحرك بالتسوية.
-- ============================================================================

create or replace function public.settle_ai_credit(
  p_user_id uuid,
  p_ref_id text,
  p_charge int default null
)
returns table (charged int, released int, balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reserved_amount int;
  v_charge int;
  v_release int;
  v_already_settled boolean;
  v_new_balance int;
begin
  if p_user_id is null or p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'settle_ai_credit: p_user_id and p_ref_id required';
  end if;

  if auth.uid() is not null and auth.uid() != p_user_id and coalesce((auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'settle_ai_credit: forbidden';
  end if;

  insert into public.coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = p_user_id for update;

  select coalesce(-delta, 0)::int into v_reserved_amount
    from public.ai_credit_ledger
   where user_id = p_user_id and reason = 'ai_reserve' and ref_id = p_ref_id
   limit 1;

  if v_reserved_amount is null or v_reserved_amount <= 0 then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    return query select 0::int, 0::int, v_new_balance;
    return;
  end if;

  -- idempotency: أي تسوية سابقة (صف refund بنفس ref_id) تُنهي العملية
  select exists(
    select 1 from public.ai_credit_ledger
     where user_id = p_user_id and reason = 'ai_refund' and ref_id = p_ref_id
  ) into v_already_settled;

  if v_already_settled then
    select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
    return query select 0::int, 0::int, v_new_balance;
    return;
  end if;

  v_charge := coalesce(p_charge, v_reserved_amount);

  if v_charge < 0 or v_charge > v_reserved_amount then
    raise exception 'settle_ai_credit: charge % exceeds reserved %', v_charge, v_reserved_amount;
  end if;

  v_release := v_reserved_amount - v_charge;

  if v_release > 0 then
    insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
    values (p_user_id, v_release, 'ai_refund', p_ref_id,
            jsonb_build_object('phase', 'F2', 'settled_at', now(), 'charged', v_charge, 'released', v_release));
  end if;

  select coalesce(sum(delta),0)::int into v_new_balance from public.ai_credit_ledger where user_id = p_user_id;
  return query select v_charge, v_release, v_new_balance;
end;
$$;

revoke all on function public.settle_ai_credit(uuid, text, int) from public;
revoke all on function public.settle_ai_credit(uuid, text, int) from anon;
grant execute on function public.settle_ai_credit(uuid, text, int) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- تحقق بعد التشغيل (داخل معاملة ROLLBACK — لا تُترك بيانات):
--   begin;
--   select reserve_ai_credit(<user_id>, 'f2-smoke', 10, 'text', null, null, 'ledger_only');
--   select settle_ai_credit(<user_id>, 'f2-smoke', 4);  -- ⇒ charged=4, released=6
--   select * from ai_credit_ledger where ref_id='f2-smoke';
--   rollback;
-- ----------------------------------------------------------------------------
