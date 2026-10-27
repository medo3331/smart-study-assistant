-- ============================================================================
-- Phase 2 (MANUAL RUN — #16 in the unified SQL list)
-- lectures — إضافة أعمدة مراجعة النص والمصطلحات المشكوك فيها
-- ============================================================================
-- ليه الجدول ده محتاج الأعمدة دي:
--   후 التفريغ بنNeed نكون قادرين على:
--    ١) كشف مصطلحات ممكن تكون غلط صوتياً أو تقنياً (suspected_terms)
--    ٢) تتبع حالة المراجعة (review_status): pending | in_review | completed | needs_attention
--    ٣) معرفة مادة المحاضرة لربطها بالقاموس المخصص (subject)
-- دي أضافة additive على الجدول الحالي — مافيش تعديل على بيانات موجودة.
-- ============================================================================

-- ١) عمود المصطلحات المشكوك فيها — مصفوفة من الكائنات:
--    [{ term, suggested_correction, reason, start, end, segment_index, word_index }]
alter table public.lectures
  add column if not exists suspected_terms jsonb
    check (suspected_terms is null or jsonb_typeof(suspected_terms) = 'array');

-- ٢) حالة المراجعة — القيم محددة بخدمة CHECK لمنع أي قيمة غريبة.
alter table public.lectures
  add column if not exists review_status text
    check (review_status in ('pending', 'in_review', 'completed', 'needs_attention'));

-- ٣) مادة المحاضرة — لربطها بقاموس المادة المخصص (إن وجد).
alter table public.lectures
  add column if not exists subject text;

-- ٤) فهرس جزئي للمحاضرات اللي في حالة مراجعة — رخيص لأن الفهرس يغطي الصفوف المطابقة بس.
create index if not exists lectures_review_status_idx
  on public.lectures (created_at desc)
  where review_status is not null;

-- ٥) توثيق الأعمدة.
comment on column public.lectures.suspected_terms is
  'قائمة المصطلحات المشكوك في صحتها مع توقيتاتها: [{term, suggested_correction, reason, start, end, segment_index, word_index}]';
comment on column public.lectures.review_status is
  'حالة مراجعة النص: pending | in_review | completed | needs_attention';
comment on column public.lectures.subject is
  'مادة المحاضرة لربطها بالقاموس المخصص للمادة (subject_dictionaries)';

-- ============================================================================
-- ⚠️ ملاحظات قبل التشغيل:
--   ١) الملف idempotent — ADD COLUMN IF NOT EXISTS آمن للتكرار.
--   ٢) الصفوف القديمة review_status bleiben NULL لحد ما تبدأ مراجعة.
--   ٣) RLS على lectures يغطي الأعمدة الجديدة تلقائياً (نفس الجدول).
-- ============================================================================