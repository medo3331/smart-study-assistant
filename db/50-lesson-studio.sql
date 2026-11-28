-- ============================================================================
-- Lesson Studio — أعمدة jsonb لمراحل P2→P6 (migration مجمّع واحد)
-- التاريخ: ٢٠٢٦-١١-١٦
--
-- شغّله في Supabase → SQL Editor بعد db/46 و db/47.
-- آمن للتكرار (add column if not exists).
--
-- ⚠️ ملاحظة ترقيم: التصميم كان بياسمي الملف db/48-lesson-studio.sql، لكن
--    db/48 و db/49 اتفصلوا قبل كده لـ exam-generator/exam-documents —
--    فالملف ده رقمه db/50 (نفس المحتوى المقصود).
--
-- اللي بيضيفه (أعمدة jsonb على نفس الجدول lesson_content — RLS الجدول
-- بيغطيها تلقائيًا، مفيش policies إضافية):
--   outline      — أقسام الدرس مع توقيت الفيديو [{ id, heading, video_t }]
--   checkpoints  — أسئلة الأقسام (اختيارية مش بوابة)
--   summaries    — الملخصات بأشكالها { quick, detailed, academic, exam_revision }
--   video        — الفيديو المختار (يوفّر البحث في الجلسات الجاية)
--   resume       — Smart Resume { last_tab, last_section_id, last_video_id, updated_at }
--   notes        — آخر نوتة مربوطة بالدرس (بديل دائم لـ localStorage — P4)
--   labs         — جلسات مختبر حل المشكلات (P6 — آخر ٣ جلسات)
--
-- ملاحظات:
--   • explanation / cited_explanation / transcript موجودة من db/46 و db/47.
--   • أوضاع الشرح الثلاثة وأوضاعها الم citied مفاتيح جوّه explanation
--     (jsonb) — مش محتاجة أعمدة.
-- ============================================================================

alter table public.lesson_content
  add column if not exists outline jsonb,
  add column if not exists checkpoints jsonb,
  add column if not exists summaries jsonb,
  add column if not exists video jsonb,
  add column if not exists resume jsonb,
  add column if not exists notes jsonb,
  add column if not exists labs jsonb;

comment on column public.lesson_content.outline is
  'أقسام الدرس: [{ id, heading, source, video_t (ثوانٍ | null) }] — مصدر Study Navigator وربط الأقسام بالفيديو (&t= بدون enablejsapi).';

comment on column public.lesson_content.checkpoints is
  'أسئلة أقسام اختيارية: [{ section_id, question, options[], correct_index, hint, ref_seg }] — مش بوابة إكمال.';

comment on column public.lesson_content.summaries is
  'الملخصات بأشكالها: { quick, detailed, academic, exam_revision } — كل شكل يولّد ويخزّن مرة (ولّد مرة وخزّن).';

comment on column public.lesson_content.video is
  'الفيديو المختار للدرس: { videoId, title, channel, embedUrl, watchUrl, thumbnail, pickedAt } — يوفّر البحث في الجلسات الجاية.';

comment on column public.lesson_content.resume is
  'Smart Resume: { last_tab, last_section_id, last_video_id, updated_at }.';

comment on column public.lesson_content.notes is
  'آخر نوتة مربوطة بالدرس: { last: { title, body, source }, updatedAt } — بديل دائم لـ localStorage (النوتة نفسها في /notes IndexedDB زي ما هي).';

comment on column public.lesson_content.labs is
  'جلسات مختبر حل المشكلات (P6): [{ id, problem, understanding, steps: [{title, guidance}], attempts: [{stepIndex, attempt, verdict, feedback, at}], createdAt, updatedAt }] — آخر ٣ جلسات.';
