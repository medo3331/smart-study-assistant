-- ============================================================
-- profiles: add email column (synced from auth.users)
-- Run manually in Supabase SQL Editor (idempotent-ish; safe to re-run
-- with the guards below).
-- ============================================================

-- 1) Add column (nullable) if missing.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

-- 2) Backfill from auth.users for existing rows.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND (p.email IS NULL OR p.email = '');

-- 3) (Optional but recommended) keep email in sync on auth.users update.
--    Requires a SECURITY DEFINER function + trigger on auth.users.
--    Supabase allows triggers on auth.users; safe to create.
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_email();

-- 4) Helpful index for lookups by email.
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (lower(email));
