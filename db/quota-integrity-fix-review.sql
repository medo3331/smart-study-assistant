-- ============================================================================
-- NOT EXECUTED — review only. Proposed fix for quota integrity.
-- Adds:
--   1) Row-level locking in consume_subscription_quota (FOR UPDATE) to prevent
--      concurrent over-consumption.
--   2) refund_subscription_quota RPC (transactional) that removes the
--      idempotency key and decrements the counter in one transaction.
-- Apply only after review on a separate test database.
-- ============================================================================

-- 1) Atomic refund RPC (transactional)
create or replace function public.refund_subscription_quota(
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'refund_subscription_quota: forbidden - service_role only';
  end if;
  if p_user_id is null or p_kind not in ('message','upload') or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'refund_subscription_quota: invalid args';
  end if;

  -- Lock the quota row
  perform 1 from public.subscription_quotas where user_id = p_user_id for update;

  -- Remove idempotency key (only if it exists)
  delete from public.quota_idempotency
    where user_id = p_user_id and kind = p_kind and idempotency_key = p_idempotency_key;

  -- Decrement counter, clamped at 0
  if p_kind = 'message' then
    update public.subscription_quotas
      set messages_24h = greatest(coalesce(messages_24h,0) - 1, 0), updated_at = now() at time zone 'utc'
      where user_id = p_user_id;
  else
    update public.subscription_quotas
      set uploads_today = greatest(coalesce(uploads_today,0) - 1, 0), updated_at = now() at time zone 'utc'
      where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.refund_subscription_quota(uuid, text, text) from public;
revoke all on function public.refund_subscription_quota(uuid, text, text) from authenticated;
revoke all on function public.refund_subscription_quota(uuid, text, text) from anon;
grant execute on function public.refund_subscription_quota(uuid, text, text) to service_role;

-- Note: consume_subscription_quota should be updated to use
--   SELECT ... FROM public.subscription_quotas WHERE user_id = p_user_id FOR UPDATE
-- inside the transaction. This migration file is a template; the existing
-- function body must be patched to add FOR UPDATE. NOT EXECUTED.
