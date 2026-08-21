-- ============================================================================
-- Phase 2: تخصيص المتجر
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor بعد db/shop.sql.
-- ============================================================================

alter table public.profiles
  add column if not exists interests text[] not null default '{}',
  add column if not exists store_style text,
  add column if not exists personalization_completed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_store_style_check;
alter table public.profiles
  add constraint profiles_store_style_check
  check (store_style is null or store_style in ('calm', 'bold', 'minimal'));

-- القائمة البيضاء تمنع تخزين قيمة عشوائية لو استُدعي تحديث البروفايل مباشرة.
alter table public.profiles
  drop constraint if exists profiles_interests_check;
alter table public.profiles
  add constraint profiles_interests_check
  check (interests <@ array['football','cars','gaming','tech','music','movies','sports','travel','books','design','business']::text[]);

-- لا نحتاج سياسة RLS جديدة: سياسة مالك profiles الموجودة تسمح بتحديث صفّه.
