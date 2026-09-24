-- ============================================================
-- Phase 4.7 (MANUAL RUN — #12 in the unified SQL list)
-- Soft-delete support for public.files (admin moderation)
-- ============================================================
-- السبب: صفحة /admin/files (المرحلة 4.7) بتعمل soft-delete بدل الحذف الفعلي
-- (الحذف الفعلي بيكسر RLS references ويبقي ملفات معطلة في التخزين من غير
-- أثر قابل للاسترجاع). العمود ده ناقص في db/epic2-file-upload.sql الأصلي.
--
-- idempotent: ADD COLUMN IF NOT EXISTS + index IF NOT EXISTS — آمن للتكرار.
-- لحد ما يتنفّذ يدويًا، زر الحذف في اللوحة بيقول "نفّذ SQL #12" بدل ما يوهم.
-- ============================================================

alter table public.files
  add column if not exists deleted_at timestamptz;

create index if not exists idx_files_deleted
  on public.files (deleted_at)
  where deleted_at is not null;

comment on column public.files.deleted_at is
  'Phase 4.7 admin soft-delete (files.moderate + audit_log) — null = active';
