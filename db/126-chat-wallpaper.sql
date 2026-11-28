-- ============================================================================
-- MAGICLY — db/126: خلفية الشات (C19 — تجربة واتساب/تليجرام)
-- ============================================================================
-- chat_wallpaper على social_profiles: قيمة واحدة لكل مستخدم (خلفية الشات
-- اللي هو شايفها هو) — إما مفتاح preset (مثل wp-aurora) أو URL صورة مرفوعة.
-- آخر ظهور/القراءة موجودة من db/107 و125 — مفيش تغييرات تانية.
-- ============================================================================

alter table public.social_profiles
  add column if not exists chat_wallpaper text;

comment on column public.social_profiles.chat_wallpaper is
  'Magicly C19 — chat wallpaper: preset key (wp-*) or uploaded image URL; viewed by owner only.';
