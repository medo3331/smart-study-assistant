-- ============================================================================
-- Phase 5 (MANUAL RUN — #37 in the unified SQL list)
-- lectures — الشرح المكثف مع مراجع زمنية (Intensive Explanation + Citations)
-- ============================================================================
-- ليه عمود جديد مش تعديل على `explanation`:
--   `explanation` عمود **text** (Markdown) وعنده 4 مستهلكين:
--   `app/lectures/page.tsx`، `LectureProcessActions`، مسار التصدير
--   (`lib/lectures/lecture-document.tsx`)، وبناء سياق المساعد.
--   الشرح المكثف **JSON** (أقسام + جمل + مرجع لكل جملة) — شكل مختلف
--   خالص، مش ينفع يسكن في نفس العمود.
--
--   وده نفس القرار اللي اتاخد قبل كده في الملف #15:
--   `summary`/`explanation` = text (Markdown)، و`flashcards`/`mcqs` = jsonb
--   (محتوى منظّم). الحجة في `db/15-lectures-flashcards-mcq.sql:5-25`:
--   المحتوى المولّد من تفريغ محاضرة واحدة مالهوش معنى من غير الـ lecture_id
--   ⇒ jsonb على نفس الجدول أبسط من جدول جديد + FK + تكرار في RLS.
--
--   العمود الجديد jsonb كمان لأن التصدير للـ PDF/DOCX بيحتاج AST
--   (Markdown) — وخلط JSON في نص Markdown هيكسر المصدّر.
--
-- ⚠️ ليه `seg` (فهرس المقطع) و`start` (التوقيت) مع بعض:
--   `seg` هو **المرجع الأساسي** للمصدر (الوقت مش جاي من الموديل أصلاً —
--   الموديل بيرجّع رقم المقطع اللي إحنا منحناه إياه، وإحنا بنقرا التوقيت
--   من `transcript_data.segments`).
--   `start` نسخة (denormalized) من التوقيت وقت التوليد — عشان العرض
--   يبقى صحيح حتى لو المقاطع اتغيّرت بعدين، والـ chip يبقى له كل
--   المعلومة في كائن واحد من غير join.
--
-- idempotent: ADD COLUMN IF NOT EXISTS + indexes guarded — آمن للتكرار.
-- additive: **مش بيعمل أي تعديل** على الأعمدة الموجودة ولا على الصفوف.
-- ============================================================================

-- ١) عمود الشرح المكثف.
-- الشكل:
-- {
--   "version": 1,
--   "generated_at": "2026-11-11T20:14:03.221Z",
--   "model": "openai/gpt-oss-120b",
--   "chunks": { "ok": 3, "failed": 0 },
--   "sections": [
--     { "heading": "قانون كولومب",
--       "claims": [ { "text": "...", "seg": 142, "start": 750.3 } ] }
--   ]
-- }
alter table public.lectures
  add column if not exists intensive_explanation jsonb
    check (intensive_explanation is null or jsonb_typeof(intensive_explanation) = 'object');

-- ٢) فهرس جزئي — مفيد لو حبينا «محاضرات فيها شرح مكثف».
--    رخيص لأن الفهرس بيفهرس الصفوف المطابقة بس (NULL مش بتت-index).
create index if not exists lectures_has_intensive_idx
  on public.lectures (created_at desc)
  where intensive_explanation is not null;

-- ٣) توثيق العمود.
comment on column public.lectures.intensive_explanation is
  'Phase 5 — الشرح المكثف: أقسام + جمل + مرجع لكل جملة (seg = فهرس المقطع في transcript_data.segments، start = التوقيت بالثواني). NULL = لسه مالهاش شرح مكثف.';

-- ============================================================================
-- ⚠️ ملاحظات قبل التنفيذ:
--   ١) الملف additive ١٠٠٪ — مافيش DROP ولا تعديل على بيانات موجودة.
--   ٢) الصفوف القديمة هتطلع زي ما هي، والقيم الجديدة هتبقى NULL لحد ما
--      الطالب يولّد شرح مكثف لمحاضرته.
--   ٣) RLS على lectures بيغطي العمود الجديد تلقائياً (نفس الجدول) — نفس
--      السبب اللي في `db/15-lectures-flashcards-mcq.sql:72`.
-- ============================================================================
