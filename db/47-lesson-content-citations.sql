-- ============================================================================
-- Lesson Content — Citations (Phase 1.3 / الخطوة 3)
-- التاريخ: ٢٠٢٦-١١-١٥
--
-- شغّله في Supabase → SQL Editor بعد db/46-lesson-content.sql.
-- آمن للتكرار (if not exists).
--
-- اللي بيضيفه الملف:
--   عمود واحد `cited_explanation jsonb` — الشرح المبني على تفريغ المحاضرة
--   المربوطة بالدرس، بنفس شكل `lectures.intensive_explanation`:
--
--   {
--     "sections": [
--       { "heading": "عنوان القسم",
--         "claims": [ { "text": "الجملة", "seg": 12, "start": 735.4, "quote": "…" } ] }
--     ]
--   }
--
--   • `seg` = فهرس المقطع في `lesson_content.transcript.segments[]` (أو
--     `lectures.transcript_data.segments[]` وقت التوليد) — بيتحقق منه
--     السيرفر بمقارنة الاقتباس حرفيًا (عتبة 0.6) قبل الحفظ، فرقم المرجع
--     **مقنَّع** مش مجرد رقم.
--   • `start` بيتحسب من المقطع عندنا — الموديل مش بيطلّع توقيت أبدًا.
--
-- ليه عمود منفصل عن `explanation`؟ لأن `explanation` = أوضاع markdown
-- الأربعة (simple/academic/visual/practical) للدرس غير المربوط، وده شكل
-- منظّم مختلف بيتقرا بـ claims/sections. الاتنين بيعيشوا جوه نفس الصف
-- `(user_id, day_id)`.
-- ============================================================================

alter table public.lesson_content
  add column if not exists cited_explanation jsonb;

comment on column public.lesson_content.cited_explanation is
  'الشرح المبني على تفريغ المحاضرة المربوطة: { sections: [{ heading, claims: [{ text, seg, start, quote }] }] } — الاقتباسات متحقَّقة من السيرفر قبل الحفظ.';
