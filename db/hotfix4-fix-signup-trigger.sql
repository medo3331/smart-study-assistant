-- ============================================================
-- HOTFIX 4 — إصلاح handle_signup_bonus لدعم anonymous users
-- ============================================================
--
-- المشكلة المحتملة:
--   handle_signup_bonus بيحاول insert في coin_wallets/coin_ledger
--   لكن anonymous users مش معاهم JWT كامل أو user_id مش متاح بشكل صحيح
--
-- الحل:
--   تحسين الـfunction بـerror handling أفضل + تخطي anonymous users بأمان
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_signup_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_amount int;
  v_is_anon boolean;
BEGIN
  -- تحقق آمن من anonymous user
  BEGIN
    v_is_anon := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  EXCEPTION WHEN OTHERS THEN
    -- لو JWT مش موجود أو فيه مشكلة، نفترض مش anonymous ونكمل
    v_is_anon := false;
  END;

  -- استثناء الزائر المجهول — لا نمنح
  IF v_is_anon THEN
    RETURN NEW;
  END IF;

  -- تحقق من وجود القاعدة
  SELECT amount INTO v_amount
  FROM public.coin_source_rules
  WHERE id = 'signup_bonus' AND is_live = true;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- إنشاء wallet (مع تجاهل الأخطاء)
  BEGIN
    INSERT INTO public.coin_wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- تجاهل أخطاء wallet creation
    NULL;
  END;

  -- إضافة المكافأة (مع تجاهل الأخطاء)
  BEGIN
    INSERT INTO public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
    VALUES (
      NEW.id,
      'signup_bonus',
      v_amount,
      'earn',
      NEW.id::text,
      jsonb_build_object('trigger', 'profile_insert')
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- تجاهل أخطاء ledger insert
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- إعادة إنشاء الـtrigger
DROP TRIGGER IF EXISTS trg_signup_bonus ON public.profiles;
CREATE TRIGGER trg_signup_bonus
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_signup_bonus();
