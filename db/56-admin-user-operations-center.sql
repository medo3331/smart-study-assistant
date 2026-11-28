-- Admin user operations center metadata and payment status.
-- Manual migration only. Do not run without explicit approval.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_user_operations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'normal'
    CHECK (category IN ('normal','vip','follow_up','at_risk','other')),
  payment_status text NOT NULL DEFAULT 'unknown'
    CHECK (payment_status IN ('paid','unpaid','unknown')),
  paid_amount numeric(12,2),
  currency text NOT NULL DEFAULT 'EGP',
  payment_method text,
  paid_at timestamptz,
  payment_id uuid,
  issue_status text NOT NULL DEFAULT 'none'
    CHECK (issue_status IN ('none','open','in_progress','resolved')),
  internal_note text,
  payment_note text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_user_operations_paid_amount_check
    CHECK (paid_amount IS NULL OR paid_amount > 0)
);

CREATE INDEX IF NOT EXISTS admin_user_operations_status_idx
  ON public.admin_user_operations(payment_status, issue_status, category);

ALTER TABLE public.admin_user_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_user_operations_no_client_access ON public.admin_user_operations;
CREATE POLICY admin_user_operations_no_client_access
  ON public.admin_user_operations FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.admin_update_user_operations(
  p_user_id uuid,
  p_updated_by uuid,
  p_category text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_paid_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_issue_status text DEFAULT NULL,
  p_internal_note text DEFAULT NULL
) RETURNS TABLE(user_id uuid, category text, payment_status text, issue_status text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_currency text := COALESCE(NULLIF(btrim(p_currency), ''), 'EGP');
  v_now timestamptz := now();
  v_payment_id uuid;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'admin_update_user_operations: service_role only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  IF p_category IS NOT NULL AND p_category NOT IN ('normal','vip','follow_up','at_risk','other') THEN
    RAISE EXCEPTION 'invalid category';
  END IF;
  IF p_payment_status IS NOT NULL AND p_payment_status NOT IN ('paid','unpaid','unknown') THEN
    RAISE EXCEPTION 'invalid payment status';
  END IF;
  IF p_issue_status IS NOT NULL AND p_issue_status NOT IN ('none','open','in_progress','resolved') THEN
    RAISE EXCEPTION 'invalid issue status';
  END IF;
  IF p_payment_status = 'paid' AND (p_paid_amount IS NULL OR p_paid_amount <= 0) THEN
    RAISE EXCEPTION 'positive payment amount required';
  END IF;
  IF p_payment_status IS DISTINCT FROM 'paid' AND p_paid_amount IS NOT NULL THEN
    RAISE EXCEPTION 'payment amount requires paid status';
  END IF;

  INSERT INTO public.admin_user_operations(
    user_id, category, payment_status, paid_amount, currency, payment_method,
    paid_at, issue_status, internal_note, updated_by, updated_at
  ) VALUES (
    p_user_id,
    COALESCE(p_category, 'normal'),
    COALESCE(p_payment_status, 'unknown'),
    CASE WHEN p_payment_status = 'paid' THEN p_paid_amount ELSE NULL END,
    v_currency,
    CASE WHEN p_payment_status = 'paid' THEN NULLIF(btrim(p_payment_method), '') ELSE NULL END,
    CASE WHEN p_payment_status = 'paid' THEN v_now ELSE NULL END,
    COALESCE(p_issue_status, 'none'),
    NULLIF(btrim(p_internal_note), ''),
    p_updated_by,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    category = COALESCE(p_category, admin_user_operations.category),
    payment_status = COALESCE(p_payment_status, admin_user_operations.payment_status),
    paid_amount = CASE
      WHEN p_payment_status = 'paid' THEN p_paid_amount
      WHEN p_payment_status IN ('unpaid','unknown') THEN NULL
      ELSE admin_user_operations.paid_amount
    END,
    currency = CASE WHEN p_payment_status = 'paid' THEN v_currency ELSE admin_user_operations.currency END,
    payment_method = CASE
      WHEN p_payment_status = 'paid' THEN NULLIF(btrim(p_payment_method), '')
      WHEN p_payment_status IN ('unpaid','unknown') THEN NULL
      ELSE admin_user_operations.payment_method
    END,
    paid_at = CASE
      WHEN p_payment_status = 'paid' THEN v_now
      WHEN p_payment_status IN ('unpaid','unknown') THEN NULL
      ELSE admin_user_operations.paid_at
    END,
    issue_status = COALESCE(p_issue_status, admin_user_operations.issue_status),
    internal_note = CASE WHEN p_internal_note IS NOT NULL THEN NULLIF(btrim(p_internal_note), '') ELSE admin_user_operations.internal_note END,
    updated_by = p_updated_by,
    updated_at = v_now;

  IF p_payment_status = 'paid' AND p_paid_amount IS NOT NULL THEN
    SELECT o.payment_id INTO v_payment_id
    FROM public.admin_user_operations o
    WHERE o.user_id = p_user_id;

    IF v_payment_id IS NOT NULL THEN
      UPDATE public.payments
      SET amount = p_paid_amount,
          currency = v_currency,
          method = NULLIF(btrim(p_payment_method), ''),
          note = 'Admin user operations center',
          paid_at = v_now,
          recorded_by = p_updated_by
      WHERE id = v_payment_id;
    ELSE
      INSERT INTO public.payments(user_id, amount, currency, method, note, paid_at, recorded_by)
      VALUES (p_user_id, p_paid_amount, v_currency, NULLIF(btrim(p_payment_method), ''), 'Admin user operations center', v_now, p_updated_by)
      RETURNING id INTO v_payment_id;
      UPDATE public.admin_user_operations SET payment_id = v_payment_id WHERE user_id = p_user_id;
    END IF;
  END IF;

  IF p_issue_status IS NOT NULL THEN
    UPDATE public.support_tickets AS t
    SET status = CASE p_issue_status
      WHEN 'none' THEN 'closed'
      WHEN 'open' THEN 'open'
      WHEN 'in_progress' THEN 'open'
      WHEN 'resolved' THEN 'resolved'
    END,
    updated_at = v_now
    WHERE t.id = (
      SELECT latest.id
      FROM public.support_tickets AS latest
      WHERE latest.user_id = p_user_id
      ORDER BY latest.updated_at DESC
      LIMIT 1
    );
  END IF;

  RETURN QUERY
  SELECT o.user_id, o.category, o.payment_status, o.issue_status, o.updated_at
  FROM public.admin_user_operations o
  WHERE o.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_operations(uuid, uuid, text, text, numeric, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_operations(uuid, uuid, text, text, numeric, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_revoke_subscription(
  p_user_id uuid,
  p_revoked_by uuid,
  p_note text DEFAULT NULL
) RETURNS TABLE(activation_id uuid, plan_key text, revoked_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_activation public.subscription_activations%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'admin_revoke_subscription: service_role only';
  END IF;

  SELECT * INTO v_activation
  FROM public.subscription_activations
  WHERE user_id = p_user_id AND revoked_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active subscription found';
  END IF;

  UPDATE public.subscription_activations
  SET revoked_at = v_now,
      revoked_by = p_revoked_by,
      note = CASE WHEN NULLIF(btrim(p_note), '') IS NOT NULL
                  THEN concat_ws(' | ', NULLIF(note, ''), 'Revoked: ' || btrim(p_note))
                  ELSE note END
  WHERE id = v_activation.id;

  UPDATE public.entitlements AS e
  SET expires_at = v_now
  WHERE e.user_id = p_user_id
    AND e.kind = 'plan'
    AND (e.expires_at IS NULL OR e.expires_at > v_now);

  IF EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_key = 'free' AND is_active = true) THEN
    INSERT INTO public.subscription_quotas(user_id, plan_key, messages_24h, uploads_today, last_reset_at, updated_at)
    VALUES (p_user_id, 'free', 0, 0, v_now, v_now)
    ON CONFLICT (user_id) DO UPDATE SET
      plan_key = 'free', messages_24h = 0, uploads_today = 0,
      last_reset_at = v_now, updated_at = v_now;
  END IF;

  RETURN QUERY SELECT v_activation.id, v_activation.plan_key, v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_subscription(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_subscription(uuid, uuid, text)
  TO service_role;

COMMIT;
