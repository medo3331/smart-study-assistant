-- ============================================================
-- EPIC-6 — User Code (public_user_code) + QR Link
-- ============================================================

-- 1) Add public_user_code to profiles (if not exists)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_user_code text UNIQUE;

-- 2) Generate a short random code (MAG-XXXXXX: 3 uppercase letters / numbers + dash + 4 chars = 9 chars total, shorter than UUID)
-- Note: This uses a simple plpgsql trigger/function. For production, consider a more robust random generator.
CREATE OR REPLACE FUNCTION generate_public_user_code()
RETURNS text AS $$
DECLARE
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text;
BEGIN
  result := 'MAG-' ||
    substr(chars, (random() * 36)::int + 1, 1) ||
    substr(chars, (random() * 36)::int + 1, 1) ||
    substr(chars, (random() * 36)::int + 1, 1) ||
    '-' ||
    substr(chars, (random() * 36)::int + 1, 1) ||
    substr(chars, (random() * 36)::int + 1, 1) ||
    substr(chars, (random() * 36)::int + 1, 1) ||
    substr(chars, (random() * 36)::int + 1, 1);
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 3) Auto-fill public_user_code on profile insert/update (if empty)
CREATE OR REPLACE FUNCTION set_public_user_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.public_user_code IS NULL OR NEW.public_user_code = '' THEN
    NEW.public_user_code := generate_public_user_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_public_user_code ON public.profiles;
CREATE TRIGGER trg_set_public_user_code
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION set_public_user_code();

-- 4) Index for quick lookup by code
CREATE INDEX IF NOT EXISTS idx_profiles_public_user_code ON public.profiles(public_user_code);

-- 5) Ensure uniqueness constraint is enforced (already declared as UNIQUE above; index reinforces it)
-- Note: If a duplicate is attempted, the insert/update will fail at DB level (expected behavior).
