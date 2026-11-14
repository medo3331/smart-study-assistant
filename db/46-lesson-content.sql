-- ============================================================================
-- Lesson Content — مصدر الحقيقة الواحد لكل درس (Phase 1.2)
-- التاريخ: ٢٠٢٦-١١-١٤
--
-- شغّله في Supabase → SQL Editor بعد db/45-retention-phase-3-achievements.sql.
-- آمن للتكرار (if not exists / drop policy if exists / create trigger if not exists).
--
-- المشكلة اللي بحلّها (LESSON_PAGE_PHASE1_AUDIT.md §3.1 و §2.3):
--   الشرح كان بييتولد من الـ AI لحظيًا في كل زيارة للدرس وبيتضيع —
--   مفيش ذاكرة ولا مصدر ثابت، والطالب بيصرف رصيد AI كل مرة على نفس المحتوى.
--   دلوقتي لكل (طالب + درس) **صف واحد** بيخزّن:
--
--   • explanation  كائن بالوضع → نص Markdown
--                  { "simple": "...", "academic": "...", "visual": "...", "practical": "..." }
--                  (نفس تبويبات SmartContentViewer — كل وضع بييتولّد مرة واحدة)
--   • summary      الملخص (عمود جاهز — التوليد بييجي في خطوة لاحقة)
--   • questions    الأسئلة (عمود جاهز — التوليد بييجي في خطوة لاحقة)
--   • transcript   نص موقوت { segments: [{ text, start, end }] } — خطوة الربط T2
--   • source_lecture_id  ربط المحاضرة — خطوة الـ Citations (الخطوة 3)
--
-- المفتاح الأساسي (user_id, day_id) = صف واحد لكل درس لكل طالب،
-- والكتابة best-effort من /api/lesson-content (فشل الحفظ ما يكسر الشاشة).
-- ============================================================================

create table if not exists public.lesson_content (
  user_id           uuid not null references auth.users (id) on delete cascade,
  day_id            uuid not null references public.study_days (id) on delete cascade,

  -- الشرح: { mode → markdown }. الكائن بيتوسّع (merge) مش بيستبدل — كل وضع
  -- بينضاف على اللي قبله من غير ما يمسحه.
  explanation       jsonb not null default '{}'::jsonb,

  -- الملخص والأسئلة: أعمدة جاهزة للخطوات الجاية (محتواها NULL لحد ما تتولّد).
  summary           text,
  questions         jsonb,

  -- للخطوة 3 (ربط المحاضرات + Citations): نص موقوت + معرّف المحاضرة.
  transcript        jsonb,
  source_lecture_id uuid,

  status            text not null default 'ready'
                    check (status in ('generating', 'ready', 'failed')),
  model             text,                     -- آخر موديل وليد المحتوى
  version           int not null default 1,   -- يزيد لو شكل الـ schema اتغيّر
  generated_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  primary key (user_id, day_id)
);

comment on table public.lesson_content is
  'مصدر حقيقة الدرس: الشرح (بالأوضاع) + الملخص + الأسئلة — يوتولد مرة واحدة ويتحفظ لكل (طالب، درس).';

alter table public.lesson_content enable row level security;

-- الطالب يقرا/يكتب بتاعته بس (نفس نمط lesson_quiz_cache).
drop policy if exists lesson_content_select_own on public.lesson_content;
create policy lesson_content_select_own on public.lesson_content
  for select using (auth.uid() = user_id);

drop policy if exists lesson_content_insert_own on public.lesson_content;
create policy lesson_content_insert_own on public.lesson_content
  for insert with check (auth.uid() = user_id);

drop policy if exists lesson_content_update_own on public.lesson_content;
create policy lesson_content_update_own on public.lesson_content
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists lesson_content_delete_own on public.lesson_content;
create policy lesson_content_delete_own on public.lesson_content
  for delete using (auth.uid() = user_id);

-- فهرس للاستعلام بالدرس (الأدوات/الإدارة) — المفتاح الأساسي مغطّي أصلًا.
create index if not exists idx_lesson_content_day
  on public.lesson_content (day_id);

-- updated_at تلقائي مع أي write — نفس الدالة الموجودة من db/14-lectures.sql.
drop trigger if exists lesson_content_set_updated_at on public.lesson_content;
create trigger lesson_content_set_updated_at
  before update on public.lesson_content
  for each row
  execute function public.set_updated_at();
