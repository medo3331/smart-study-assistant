-- ============================================================================
-- Phase 5 (MANUAL RUN — #41 in the unified SQL list)
-- ai_operations — سياسة الإدخال (التسجيل كان بيفشل خالص)
-- ============================================================================
-- ⚠️ **BUG في الإنتاج اتكشاف أثناء تفعيل توليد الصور عبر OpenRouter**:
--    `ai_operations` كان فيه **policy واحدة للقراءة بس**:
--      `ai operations: owner reads` (SELECT) — `auth.uid() = user_id`
--
--    ومافيش policy للإدخال ⇒ كل `recordAiOperation` بيرمي:
--      `new row violates row-level security policy for table "ai_operations"`
--
--    ⇒ **كل تسجيلات الـ AI في التطبيق كله كانت بتضيع**: الشات، الصور،
--      المحاضرات، الدرس… (التسجيل best-effort فمحدش كان بيلاحظ).
--
-- ⚠️ **ليه مهم لتوليد الصور بالذات**: من غير التسجيل مش هنعرف
--    **مين** ولّد الصورة (OpenRouter ولا Pollinations) ولا **بتكلّف كام**
--    ⇒ صعب نعرف هل فل.2-pro شغّال فعلاً ولا رجع للمجاني.
--
-- ⚠️ **ضيقة عمداً**: المستخدم يسجّل صفوفه هو بس (`user_id = auth.uid()`).
--    مافيش سياسة إدخال عامة ⇒ ما حدش بيقدر يكتب نيابة عن حد تاني.
--
-- idempotent: `drop policy if exists` قبل `create policy` — آمن للتكرار.
-- ============================================================================

-- ١) الإدخال — المستخدم يسجّل صفوفه هو بس.
drop policy if exists "ai operations: owner inserts" on public.ai_operations;
create policy "ai operations: owner inserts" on public.ai_operations
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ٢) التعديل — المستخدم يعدّل سجلاته (تصحيح/تراجع).
drop policy if exists "ai operations: owner updates" on public.ai_operations;
create policy "ai operations: owner updates" on public.ai_operations
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ٣) الحذف — المستخدم يمسح سجلاته (خصوصية: بيانات سلوك).
drop policy if exists "ai operations: owner deletes" on public.ai_operations;
create policy "ai operations: owner deletes" on public.ai_operations
  for delete to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- ⚠️ ملاحظات قبل التنفيذ:
--   ١) idempotent — يتنفّذ أكتر من مرة.
--   ٢) **مش** بيعدّل RLS على الجدول (مفعّل من قبل) ولا أي عمود ولا صف.
--   ٣) صلاحية القراءة ما بتتغيّرش — `ai operations: owner reads` زي ما هي.
-- ============================================================================
