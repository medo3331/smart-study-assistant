-- ============================================================================
-- Phase 4-B (MANUAL RUN — #15 in the unified SQL list)
-- lectures — Flashcards + MCQ (JSONB columns)
-- ============================================================================
-- ليه الأعمدة دي على `public.lectures` نفسها:
--   المحتوى ده **مولّد من تفريغ محاضرة واحدة** — يعني مالهوش معنى من غير
--   الـ lecture_id، ومالهوش معنى من غير الـ user_id. تخزينه في جدول منفصل
--   كان هيضيف جدول تاني + FK جديد + تكرار في RLS من غير فايدة.
--
--  مراجعة: هل فيه جدول موجود ينفع نعيد استخدامه؟
--   - `past_exam_questions` / `diagnostic_question_bank`: محتوى **عام**
--     (public read + admin writes) — مربوط بمنهج أو امتحان قديم، مش
--     بمستخدم. ربطه بمحادثة مستخدم كانت هتكسر عزل البيانات وتخلط محتوى
--     عام بمحتوى خاص.
--   - `community_quiz_scores` / `break_quiz_sessions`: نتائج ومشاركات،
--     مش بنك أسئلة قابل لإعادة الاستخدام (مربوطين بـ XP و RPC).
--   ⇒ **مافيش بنية قابلة لإعادة الاستخدام**، والـ JSONB على الجدول
--     الموجود هو الحل الأبسط. نفس المنطق اللي اتبعناه في Phase 4-A مع
--     `summary` و `explanation`.
--
-- ⚠️ ليه `jsonb` مش جدول أسئلة:
--   البطاقات والأسئلة **مش كيان مستقل** — مالهاش حياة برّه المحاضرة،
--   ومفيش طالب بيشوف بطاقة محاضرة غيره، ومفيش فهرسة أو بحث عليها
--   حالياً. لو بقى فيهم بحث أو spaced repetition بعدين، وقتها وفقت
--   نفصلهم في جدول — والحقول هتنتقل بسهولة من JSONB.
--
-- idempotent: ADD COLUMN IF NOT EXISTS — آمن للتكرار.
-- additive: **مش بيعمل أي تعديل** على الأعمدة الموجودة (transcript,
-- summary, explanation, …). الصفوف القديمة هتفضل صالحة والقيم هتبقى NULL.
-- ============================================================================

-- ١) بطاقات المذاكرة.
-- الشكل: [{ "question": "...", "answer": "..." }, …]
-- ⚠️ `jsonb_typeof = 'array'`: لو موديل رجّع كائن مكان مصفوفة، الـ CHECK
-- هيرفض الصف بالكامل بدل ما يتحفظ محتوى مش صالح. الرفض أحسن من بيانات
-- مكسورة يقراها الـ UI لاحقاً.
alter table public.lectures
  add column if not exists flashcards jsonb
    check (flashcards is null or jsonb_typeof(flashcards) = 'array');

-- ٢) أسئلة الاختيار من متعدد.
-- الشكل: [{ "question", "options": [4], "correctAnswer": 0-3, "explanation" }, …]
-- ملاحظة: صحّية `correctAnswer` (٤ اختيارات، فهرس من ٠ لـ ٣) بيتحقّق
-- منها **الكود** مش الـ CHECK — لأن الـ CHECK في Postgres بيبقى معقّد
-- وبيبقى شبح على صيانة القاعدة. التحقق في `lib/ai/lecture-study.ts`.
alter table public.lectures
  add column if not exists mcqs jsonb
    check (mcqs is null or jsonb_typeof(mcqs) = 'array');

-- ٣) فهرس جزئي — مفيد لو حبينا لاحقاً «محاضرات فيها بطاقات بس».
--    رخيص لأن الفهرس بيفهرس الصفوف المطابقة بس (NULL مش بتت-index).
create index if not exists lectures_has_flashcards_idx
  on public.lectures (created_at desc)
  where flashcards is not null;

create index if not exists lectures_has_mcqs_idx
  on public.lectures (created_at desc)
  where mcqs is not null;

-- ٤) توثيق الأعمدة.
comment on column public.lectures.flashcards is
  'Phase 4-B — بطاقات المذاكرة المولّدة: [{question, answer}]. NULL = لسه مالهاش بطاقات.';
comment on column public.lectures.mcqs is
  'Phase 4-B — أسئلة MCQ المولّدة: [{question, options[4], correctAnswer, explanation}]. NULL = لسه مالهاش أسئلة.';

-- ============================================================================
-- ⚠️ ملاحظات قبل التنفيذ:
--   ١) الملف additive ١٠٠٪ — مافيش DROP ولا تعديل على بيانات موجودة.
--   ٢) الصفوف القديمة هتطلع زي ما هي، والقيم الجديدة هتبقى NULL لحد ما
--      الطالب يولّد محتوى لمحاضرته.
--   ٣) RLS مالهوش تغيير هنا — السياسات الموجودة على `lectures` (من
--      migration #14) بتغطي الأعمدة الجديدة تلقائياً لأنها جزء من نفس
--      الجدول. ده سبب إضافي لاختيار JSONB على جدول جديد.
-- ============================================================================
