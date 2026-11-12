-- ============================================================================
-- Phase 5 (MANUAL RUN — #39 in the unified SQL list)
-- knowledge_base — سياسات RLS للمستخدم (إدخال/حذف صفوفه)
-- ============================================================================
-- ليه الملف ده لازم:
--   `knowledge_base` كان فيه **policy واحدة للقراءة بس**:
--     `kb_read_samples_and_own` (SELECT) — العينين تشوف الـ samples
--     والصفوف اللي `user_id` بتاعها هو.
--
--   بس الجدول اتوسّع (عملياً) لصفحات مستندات المستخدم: أعمدة
--   `user_id` · `source_id` · `source_type` · `source_kind` ·
--   `chunk_index` موجودة في القاعدة. **ومافيش policy للإدخال** ⇒ أي
--   insert من الـ session client بيرمي:
--     `new row violates row-level security policy for table "knowledge_base"`
--
--   ⇒ ميزة «العرض التقديمي» (اللي بتخزّن صفحات المستند هنا) كانت
--     مستحيلة تشتغل من غير السياسات دي.
--
-- ⚠️ **ضيقة عمداً**: المستخدم يقدر يدخل/يمسح **صفوفه هو بس**
--    (`user_id = auth.uid()`). مافيش سياسة إدخال عامة ⇒ الصفوف
--    التانية (والـ samples) ماتتلمسش.
--
-- ⚠️ **مش بنلمس الـ schema**: الأعمدة السبعة اللي ناقصة في
--    `db/knowledge-base.sql` (شوف N-011 في `docs/TECH_DEBT.md`) — الملف
--    ده **سياسات بس**، وبيتخطّى من غير ما يعدّل أي عمود.
--
-- idempotent: `drop policy if exists` قبل كل `create policy` — آمن
-- للتكرار.
-- ============================================================================

-- ١) الإدخال — المستخدم يدخل صفوفه هو بس.
drop policy if exists "kb_insert_own" on public.knowledge_base;
create policy "kb_insert_own" on public.knowledge_base
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ٢) التعديل — المستخدم يعدّل صفوفه (مثلاً لو الـ pages اتحدّثت).
drop policy if exists "kb_update_own" on public.knowledge_base;
create policy "kb_update_own" on public.knowledge_base
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ٣) الحذف — المستخدم يمسح صفوفه (لما المستند يتحذف).
drop policy if exists "kb_delete_own" on public.knowledge_base;
create policy "kb_delete_own" on public.knowledge_base
  for delete to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- ⚠️ ملاحظات قبل التنفيذ:
--   ١) idempotent — يتنفّذ أكتر من مرة.
--   ٢) **مش** بيعدّل RLS على الجدول (مفعّل + FORCE من قبل) ولا
--      أي عمود ولا صف.
--   ٣) صلاحية القراءة ما بتتغيّرش — `kb_read_samples_and_own` زي ما هي.
-- ============================================================================
