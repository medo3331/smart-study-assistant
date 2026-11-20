-- Admin operations center prerequisites (manual migration; do not auto-apply).
-- Adds MAG-free activation support and idempotent per-activation welcome notices.
BEGIN;

ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS credits_monthly integer;

ALTER TABLE public.subscription_activations
  ALTER COLUMN user_code DROP NOT NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS subscription_activation_id uuid;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS announcement_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.notifications SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.notifications ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_id_uidx ON public.notifications(id);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link_url text;
UPDATE public.notifications SET title = 'إشعار' WHERE title IS NULL;
ALTER TABLE public.notifications ALTER COLUMN title SET NOT NULL;
UPDATE public.notifications SET recipient_id = user_id WHERE recipient_id IS NULL AND user_id IS NOT NULL;
UPDATE public.notifications SET user_id = recipient_id WHERE user_id IS NULL AND recipient_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_subscription_activation_id_fkey
    FOREIGN KEY (subscription_activation_id)
    REFERENCES public.subscription_activations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_announcement_id_fkey
    FOREIGN KEY (announcement_id)
    REFERENCES public.announcements(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('info','warning','feature','support_reply','support_status','announcement','system'));

DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_subscription_activation_id_uidx
  ON public.notifications(subscription_activation_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_quotas_user_uniq
  ON public.subscription_quotas(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_announcement_recipient_uidx
  ON public.notifications(announcement_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id
  ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications(user_id, created_at DESC);

COMMENT ON COLUMN public.subscription_activations.user_code IS
  'Optional compatibility identifier; user_id is the canonical account identity.';
COMMENT ON COLUMN public.notifications.recipient_id IS
  'Canonical recipient UUID for user-scoped notifications.';
COMMENT ON COLUMN public.notifications.body IS
  'Notification message body; coexists with legacy message column.';
COMMENT ON COLUMN public.notifications.subscription_activation_id IS
  'Activation-scoped idempotency key for one-time subscription welcome notifications.';
COMMENT ON COLUMN public.notifications.announcement_id IS
  'Announcement source for idempotent per-recipient in-app delivery.';

CREATE OR REPLACE FUNCTION public.admin_activate_subscription(
  p_user_id uuid,
  p_user_code text,
  p_plan_key text,
  p_duration_days integer,
  p_activated_by uuid,
  p_note text
) RETURNS TABLE(activation_id uuid, expires_at timestamptz, plan_name text, notification_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_expires timestamptz;
  v_name text;
  v_credits_monthly integer;
  v_credits_remaining bigint := 0;
  v_activation_id uuid;
  v_notification_id uuid;
BEGIN
  IF p_duration_days < 1 OR p_duration_days > 365 THEN
    RAISE EXCEPTION 'duration_days must be between 1 and 365';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  IF p_user_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_codes WHERE code = p_user_code AND user_id = p_user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'user code does not belong to user or is inactive';
  END IF;
  SELECT name, credits_monthly INTO v_name, v_credits_monthly FROM public.subscription_plans
   WHERE plan_key = p_plan_key AND is_active = true;
  IF v_name IS NULL THEN RAISE EXCEPTION 'active plan not found'; END IF;
  SELECT COALESCE(sum(delta), 0) INTO v_credits_remaining FROM public.ai_credit_ledger WHERE user_id = p_user_id;

  v_expires := v_now + make_interval(days => p_duration_days);
  INSERT INTO public.subscription_activations(user_code, user_id, plan_key, duration_days, activated_by, note)
  VALUES (p_user_code, p_user_id, p_plan_key, p_duration_days, p_activated_by, p_note)
  RETURNING id INTO v_activation_id;

  UPDATE public.entitlements SET expires_at = v_now
   WHERE user_id = p_user_id AND kind = 'plan' AND (expires_at IS NULL OR expires_at > v_now);
  INSERT INTO public.entitlements(user_id, kind, value, expires_at, metadata)
  VALUES (p_user_id, 'plan', p_plan_key, v_expires,
    jsonb_build_object('source', 'admin_subscription_activation', 'activation_id', v_activation_id));

  INSERT INTO public.subscription_quotas(user_id, plan_key, messages_24h, uploads_today, last_reset_at, updated_at)
  VALUES (p_user_id, p_plan_key, 0, 0, v_now, v_now)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_key = EXCLUDED.plan_key,
    messages_24h = 0,
    uploads_today = 0,
    last_reset_at = EXCLUDED.last_reset_at,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.notifications(recipient_id, user_id, type, title, body, message, is_read, link_url, subscription_activation_id)
  VALUES (p_user_id, p_user_id, 'system', 'تم تفعيل اشتراكك',
    format('تم تفعيل خطة %s حتى %s. الكريدت المتبقي حاليًا: %s، وحد الخطة الشهري: %s.', v_name, to_char(v_expires AT TIME ZONE 'UTC', 'YYYY-MM-DD'), v_credits_remaining, coalesce(v_credits_monthly::text || ' كريدت', 'غير متاح')),
    format('تم تفعيل خطة %s حتى %s. الكريدت المتبقي حاليًا: %s، وحد الخطة الشهري: %s.', v_name, to_char(v_expires AT TIME ZONE 'UTC', 'YYYY-MM-DD'), v_credits_remaining, coalesce(v_credits_monthly::text || ' كريدت', 'غير متاح')),
    false, '/dashboard/profile', v_activation_id)
  ON CONFLICT (subscription_activation_id) DO NOTHING
  RETURNING id INTO v_notification_id;

  RETURN QUERY SELECT v_activation_id, v_expires, v_name, v_notification_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_activate_subscription(uuid, text, text, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activate_subscription(uuid, text, text, integer, uuid, text) TO service_role;

COMMIT;
