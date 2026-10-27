-- ============================================================================
-- Phase 3 (MANUAL RUN — #18 in the unified SQL list)
-- lectures — إضافة أعمدة قرارات المراجعة والنص المصحح
-- ============================================================================
-- الغرض: دعم مرحلة مراجعة وتصحيح المصطلحات المشكوك فيها (Phase 3).
-- نضيف أعمدة additive فقط على الجدول الحالي — مافيش تعديل على بيانات موجودة.
-- ============================================================================

-- ١) النص المصحح بعد المراجعة — يُحفظ بشكل مستقل عن transcript_text الأصلي.
alter table public.lectures
  add column if not exists transcript_reviewed_text text;

-- ٢) قرارات المراجعة لكل مصطلح مشكوك فيه — مصفوفة من الكائنات:
--    [{ termId, action: 'accept' | 'reject' | 'manual_edit', finalValue?, decidedAt }]
alter table public.lectures
  add column if not exists review_decisions jsonb
    check (review_decisions is null or jsonb_typeof(review_decisions) = 'array');

-- ٣) وقت اكتمال المراجعة.
alter table public.lectures
  add column if not exists reviewed_at timestamptz;

-- ٤) توثيق الأعمدة.
comment on column public.lectures.transcript_reviewed_text is
  'النص بعد تطبيق قرارات المراجعة (accept/reject/manual_edit). يُحفظ بشكل مستقل عن transcript_text الأصلي.';
comment on column public.lectures.review_decisions is
  'قرارات المراجعة لكل مصطلح مشكوك فيه: [{termId, action, finalValue?, decidedAt}]';
comment on column public.lectures.reviewed_at is
  'وقت اكتمال مراجعة المحاضرة (timestamptz)';

-- ٥) فهرس parcial للمحاضرات المكتملة المراجعة — رخيص لأنه يغطي الصفوف المطابقة بس.
create index if not exists lectures_reviewed_at_idx
  on public.lectures (reviewed_at desc)
  where reviewed_at is not null;

-- ============================================================================
-- ⚠️ ملاحظات قبل التشغيل:
--   ١) الملف idempotent — ADD COLUMN IF NOT EXISTS آمن للتكرار.
--   ٢) الصفوف القديمة تبقى transcript_reviewed_text=NULL و review_decisions=NULL
--      حتى تبدأ مراجعة فعلية.
--   ٣) RLS على lectures يغطي الأعمدة الجديدة تلقائياً (نفس الجدول، نفس السياسات).
--   ٤) لا حاجة لتعديل RLS لأن إضافة أعمدة على جدول موجود لا تخلق سياسات جديدة.
-- ============================================================================