-- ============================================================
-- Display name on profiles
-- ============================================================
-- Adds display_name TEXT to public.profiles (nullable, forward-only).
-- Backfills from auth.users raw_user_meta_data->>'full_name' when
-- profiles.display_name is null/empty. Preserves existing non-empty values.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill existing users from Supabase Auth metadata (full_name).
UPDATE public.profiles p
SET display_name = NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), '')
FROM auth.users u
WHERE p.id = u.id
  AND (p.display_name IS NULL OR TRIM(p.display_name) = '')
  AND u.raw_user_meta_data->>'full_name' IS NOT NULL
  AND TRIM(u.raw_user_meta_data->>'full_name') <> '';

-- Trigger to populate display_name on new profile rows when available in auth metadata.
CREATE OR REPLACE FUNCTION public.set_profile_display_name_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.display_name IS NULL OR TRIM(NEW.display_name) = '' THEN
    BEGIN
      SELECT NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), '')
        INTO v_name
        FROM auth.users u
       WHERE u.id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      v_name := NULL;
    END;
    NEW.display_name := v_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_profile_display_name ON public.profiles;
CREATE TRIGGER trg_set_profile_display_name
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_profile_display_name_from_auth();
