-- ============================================================================
-- المرحلة 25ط (MANUAL RUN) — خطة Basic الجديدة + إعادة ترتيب الترقيات
-- ============================================================================
-- الهدف: إضافة خطة «أساسية Basic» (99 ج/شهر) بين المجانية و Pro — حدود ~3× المجاني.
-- تعمل مرة واحدة بأمان (idempotent) — run in Supabase SQL Editor.
-- ============================================================================
-- ملاحظة: الرسائل في consume_subscription_quota بتتجدد كل 24 ساعة عمليًا
-- (عمود messages_per_2h هو الحد المرجعي) — الأرقام هنا متطابقة مع الـ fallbacks
-- في lib/ai/quota-check.ts.

insert into public.subscription_plans
  (plan_key, name, display_name_ar, profile_limit, messages_per_2h, uploads_daily,
   max_file_size_mb, file_types, video_audio_exclusive, priority_queue, trial_days, is_active)
values
  ('basic', 'Basic', 'الأساسية', 2, 60, 15, 50, '{pdf,text,image}', false, 'normal', 0, true)
on conflict (plan_key) do update set
  name = excluded.name,
  display_name_ar = excluded.display_name_ar,
  profile_limit = excluded.profile_limit,
  messages_per_2h = excluded.messages_per_2h,
  uploads_daily = excluded.uploads_daily,
  max_file_size_mb = excluded.max_file_size_mb,
  file_types = excluded.file_types,
  video_audio_exclusive = excluded.video_audio_exclusive,
  priority_queue = excluded.priority_queue,
  is_active = excluded.is_active;
