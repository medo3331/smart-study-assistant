-- ============================================================================
-- P1-B1.2 (deploy) — Hardening موجود مطبَّق على engagement_events
-- Date: 2026-11-20
--
-- ⚠️ **ليه الملف ده موجود أصلاً؟**
--   `db/58-engagement-events.sql` بيستخدم `CREATE TABLE IF NOT EXISTS` — يعني
--   لو الجدول اتعمل قبل كده (نسخة P1-B1 الأولى)، الملف ده **مش هيعدّلّه**.
--   والنسخة الأولى كانت: source_id من نوع uuid، من غير قيد حجم للـmetadata،
--   ومن غير قيد على occurred_at، ومن غير REVOKE للـPUBLIC/TRUNCATE.
--
--   ⇒ الملف ده gap-filler: يدمج (converges) الجدول الموجود مع المخطط
--   المعتمد في الفرع (db/58) بدون ما يمسّ أي بيانات.
--
-- ── أمان ───────────────────────────────────────────────────────────────────
--   • الجدول فاضي في الإنتاج (0 صفوف وقت الكتابة) ⇒ الـALTER رخيص ومافيش إعادة كتابة للصفوف.
--   • `source_id`: توسيع من uuid ⇒ text (widening) — مافيش فقد بيانات،
--     وبيخلّي المصدر يتقبل أي معرّف ثابت (uuid / numeric / composite key).
--   • مافيش DROP / DELETE / TRUNCATE.
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────────
--   لتضييق source_id تاني:
--     alter table public.engagement_events
--       alter column source_id type uuid using source_id::uuid;
--   (بعد التأكد أن كل source_id قابل للتحويل إلى UUID أولًا).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) توسيع source_id: uuid ⇒ text (idempotent)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'engagement_events'
     AND column_name = 'source_id';

  IF v_type = 'uuid' THEN
    ALTER TABLE public.engagement_events
      ALTER COLUMN source_id TYPE text USING source_id::text;
    RAISE NOTICE 'engagement_events.source_id: uuid -> text';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- ٢) قيود الـmetadata والـtimestamps (تُضاف لو ناقصة)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.engagement_events'::regclass
       AND conname = 'engagement_events_metadata_size'
  ) THEN
    ALTER TABLE public.engagement_events
      ADD CONSTRAINT engagement_events_metadata_size
      CHECK (octet_length(metadata::text) <= 16384);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.engagement_events'::regclass
       AND conname = 'engagement_events_source_id_nonempty'
  ) THEN
    ALTER TABLE public.engagement_events
      ADD CONSTRAINT engagement_events_source_id_nonempty
      CHECK (char_length(trim(source_id)) > 0 AND char_length(source_id) <= 255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.engagement_events'::regclass
       AND conname = 'engagement_events_occurred_at_bounds'
  ) THEN
    ALTER TABLE public.engagement_events
      ADD CONSTRAINT engagement_events_occurred_at_bounds
      CHECK (occurred_at >= '2000-01-01'::timestamptz
             AND occurred_at <= '2100-01-01'::timestamptz);
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- ٣) الصلاحيات:писب PUBLIC/TRUNCATE عن أدوار العملاء
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.engagement_events FROM PUBLIC;
REVOKE ALL ON TABLE public.engagement_events FROM anon;
REVOKE ALL ON TABLE public.engagement_events FROM authenticated;
REVOKE TRUNCATE ON TABLE public.engagement_events FROM anon;
REVOKE TRUNCATE ON TABLE public.engagement_events FROM authenticated;

COMMIT;
