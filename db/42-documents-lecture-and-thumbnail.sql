-- ============================================================================
-- Phase 6 (MANUAL RUN — #42 in the unified SQL list)
-- documents — مصدر المحاضرة (segments) + معاينة الملف (thumbnail)
-- ============================================================================
--Feature "العروض التقديمية" بقت بتشتغل على مصدرين:
--
--   ① **مستند مرفوع** (PDF/PPTX/DOCX) ⇒ `material_id` + الصفحات في
--      `knowledge_base` (على `source_id = documents.id`).
--
--   ② **محاضرة** (Audio/Video) ⇒ `lecture_id` + **مقاطع التفريغ**
--      (`transcript_data.segments`).
--
-- ⚠️ **ليه محتاجين `source_unit`**: نوع الوحدة مختلف:
--      المستند ⇒ صفحة/شريحة/فقرة · المحاضرة ⇒ **مقطع** (والمرجع
--      بتاعه **توقيت** «دقيقة 12:30» مش «صفحة ٤»).
--      العمود ده هو مصدر الحقيقة للـ UI — مش استنتاج من `file_type`.
--
-- ⚠️ **ليه `thumbnail`**: معاينة مصغّرة لصفحة 1 من الـ PDF (200px).
--      `unpdf.renderPageAsImage` **موجود بالفعل** في المشروع (بيُستخدم
--      في مسار الـ OCR) ⇒ صفر اعتماديات جديدة.
--      بيتخزّن كـ data URL (text) — بسيطة وبلا storage bucket.
--
-- idempotent: كل عبارة guarded — آمن للتكرار.
-- additive: **مش بيعمل أي تعديل** على جداول موجودة ولا على صفوف.
-- ============================================================================

-- ١) مصدر المحاضرة.
alter table public.documents
  add column if not exists lecture_id uuid
  references public.lectures (id) on delete cascade;

-- ٢) نوع الوحدة — مرجع الـ UI الوحيد.
alter table public.documents
  add column if not exists source_unit text not null default 'page';

-- ٣) معاينة الملف (data URL).
alter table public.documents
  add column if not exists thumbnail text;

-- ٤) قيد نوع الوحدة.
--    ⚠️ `drop` الأول: لو القيد موجود بنفس الاسم من قبل، `add` بيفشل.
--    ⚠️ لازم يكون `ALTER TABLE ... DROP CONSTRAINT` (مش `DROP CONSTRAINT`
--    لوحده — Postgres مش بيقبل الشكل التاني).
alter table public.documents
  drop constraint if exists documents_source_unit_check;
alter table public.documents
  add constraint documents_source_unit_check
  check (source_unit in ('page', 'slide', 'paragraph', 'segment'));

-- ٥) قيد «مصدر واحد بس».
--    ⚠️ **مش XOR صارم**: بعض الصفوف القديمة (لو في) من غير مصدر ⇒
--    خلّينا نسمح بيها (الـ CHECK بيمنع المصدرين مع بعض بس).
alter table public.documents
  drop constraint if exists documents_source_xor_check;
alter table public.documents
  add constraint documents_source_xor_check
  check (not (material_id is not null and lecture_id is not null));

-- ٦) فهرس: «كل المستندات بتاعت محاضرة» (للـ lookup السريع).
create index if not exists documents_lecture_created_idx
  on public.documents (lecture_id, created_at desc)
  where lecture_id is not null;

-- ٦)ب) قيد التفرّد: **محاضرة واحدة ⇒ صف مستند واحد**.
--    ده اللي بيخلّي الـ upsert (على `lecture_id` + `user_id`) يشتغل.
--
--    ⚠️ **ليه مش partial؟** الـ partial index (`where lecture_id is not null`)
--    **مش بيتقبل** في استنتاج `ON CONFLICT` (Postgres بيحتاج الـ WHERE
--    predicate في جملة الـ ON CONFLICT، وPostgREST مش بيوصله).
--    ⇒ خطأ `42P10: there is no unique or exclusion constraint matching
--    the ON CONFLICT specification` (اتأكدت بالقياس).
--
--    ⚠️ **والـ NULLs distinct افتراضياً** ⇒ صفوف المستندات العادية
--    (`lecture_id IS NULL`) **مش** بتتعارض مع بعض ✓.
create unique index if not exists documents_lecture_user_uniq
  on public.documents (lecture_id, user_id);

-- ٧) توثيق.
comment on column public.documents.lecture_id is
  'المحاضرة المصدر (بديل material_id) — نسخة العرض التقديمي من مقاطع التفريغ.';
comment on column public.documents.source_unit is
  'نوع وحدة العدّ: page (PDF) · slide (PPTX) · paragraph (DOCX) · segment (مقطع محاضرة — المرجع بتاعه توقيت).';
comment on column public.documents.thumbnail is
  'معاينة مصغّرة (data URL) لصفحة/شريحة 1 من الملف — بتولّد وقت الرفع.';
