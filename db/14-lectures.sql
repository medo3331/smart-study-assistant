-- ============================================================================
-- Phase 3 (MANUAL RUN — #14 in the unified SQL list)
-- lectures — حفظ المحاضرات المفرَّغة لكل مستخدم
-- ============================================================================
-- ليه الجدول ده موجود:
--   لحد دلوقتي تفريغ المحاضرات شغّال بس **بيرمي النتيجة**: المتصفح بياخد
--   النص، بتتحوّل الصفحة، والطالب تاني مش بيلاقي محاضرته خالص. الجدول ده
--   بيخلي كل تفريغ ناجح يتحفظ لحساب صاحبه عشان يرجعله بعدين
--   (العنوان، التاريخ، المصدر، المدة، والتفريغ كامل).
--
--   ده أساس المراحل اللي بعدها: ملخص/شرح/فلاش كاردز/أسئلة (من النص)،
--   والمساعد الذكي (بياخد سياق المحاضرة المختارة)، والتسجيل المباشر
--   (نفس الجدول بـ source_type = 'live_recording').
--
-- ⚠️ ليه `user_id` (مش `profile_id` زي جدول `files`):
--   `files` هو الاستثناء الوحيد في المشروع (٦ استخدامات). القاعدة الغالبة
--   في ~٧٠ جدول — منها `chat_*` و`diagnostic_*` — هي `user_id` مرتبطة
--   بـ `auth.users(id)`، وده بالظبط اللي `requireUser()` بيرجّعه. خلّينا
--   متسقين مع الغالبة.
--
-- ⚠️ ليه `transcript_text` **و** `transcript_data` مع بعض:
--   `LectureTranscript` (شوف lib/ai/transcription-shared.ts) فيه
--   `segments[]` و`words[]` بتوقيتاتها على مستوى الكلمة — دي اللي
--   هتحتاجها المزامنة الحية والمعالجة بالـ AI والمساعد، والمعايشة جوه
--   النص كـ string. فبنخزّن النص للبحث والعرض السريع، و`jsonb` للعقد
--   الكامل. **مفيش أي تقليم** — نخزّن زي ما رجع من ElevenLabs.
--
-- idempotent: كل عبارة guarded — آمن للتكرار.
-- ============================================================================

-- ١) دالة `updated_at` — معرّفة هنا لأنها **مش موجودة** في أي migration
--    تاني بالمشروع (اتأكدت: مفيش `set_updated_at` في أي ملف db/*.sql).
--    `create or replace` + `drop trigger if exists` = آمن للتكرار.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ٢) الجدول نفسه.
create table if not exists public.lectures (
  id                    uuid primary key default gen_random_uuid(),

  -- صاحب المحاضرة. auth.users → الحساب بيتشال معاه (cascade).
  -- ⚠️ NOT NULL بلا default: مفيش صف لنوع واحد غير مستخدم — وده اللي
  -- بيمنع أي حفظ في مستخدم "افتراضي" لو حد نسي يتأكد من الجلسة.
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- العنوان المعروض. NULL لحد ما الطالب يسمّيها (المرحلة الجاية).
  title                 text,

  -- الاسم الأصلي للملف وقت الرفع — للعرض والتحميل.
  original_filename     text,

  -- مسار الكائن في باكيت `lecture-uploads` وقت الحفظ.
  -- ⚠️ NULL بعد الحذف وبعد حذف الملف من التخزين (المرحلة ٧ هي اللي
  -- هتخزّن التسجيل بشكل دائم). قيمته两根:
  --   ١) منع التكرار: القيد الفريد بالأسفل بيخلّي إعادة محاولة الحفظ
  --      على نفس الملف ترجّع نفس المحاضرة بدل ما تعمل سجل تاني.
  --   ٢) مرجعの再处理: لو تفريغ اتقطع في النص، نعرف الملف ده إيه
  --      من غير ما نخزّن الملف نفسه.
  -- ⚠️ Postgres يعتبر الـ NULLs متمايزة في القيد الفريد، فمحاضرات
  -- تانية بـ NULL (تسجيل مباشر جاي) مش بتتعارض مع بعض.
  storage_path          text,

  -- منين جهت المحاضرة: رفع ملف، أو تسجيل مباشر (المرحلة ٧).
  -- ⚠️ CHECK مش قيمة حرة: بيمنع أي قيمة تانية تنزل جوه الجدول من
  -- كود تاني أو من عميل عام.
  source_type           text not null default 'upload'
                          check (source_type in ('upload', 'live_recording')),

  mime_type             text,
  file_size             bigint,
  duration_seconds      integer,
  language              text,

  -- النص الكامل — للبحث والعرض.
  transcript_text       text,

  -- العقد الكامل كما رجع من المزوّد (segments + words + توقيتاتها).
  -- jsonb_typeof: نتأكد إن العمود كائن فعلاً مش نص/قائمة.
  transcript_data       jsonb
                          check (
                            transcript_data is null
                            or jsonb_typeof(transcript_data) = 'object'
                          ),

  -- مين أنتج النص — للتشخيص ولما يتضاف مزوّد تاني.
  transcription_model     text,
  transcription_provider  text,

  -- processing (لسه شغّال/جاري) | completed | failed
  status                text not null default 'completed'
                          check (status in ('processing', 'completed', 'failed')),

  -- أعمدة AI. NULL دلوقتي عمداً: المراحل الجاية هتملأها.
  -- محجوزة في الجدول من غير migration جديد وقت الحاجة.
  summary               text,
  explanation           text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ٣) الفهرسة.
-- الفهرس الأساسي للقائمة: محاضرات المستخدم الأحدث فوق. يغطي
-- `where user_id = ... order by created_at desc` في صفحة /lectures.
create index if not exists lectures_user_created_idx
  on public.lectures (user_id, created_at desc);

-- ⚠️ القيد ده هو اللي بيمنع التكرار. لحد دلوقتي لو الحفظ فشل في
-- قاعدة البيانات والملف اتحفظ، الطالب يضغط «حاول تاني» — ومن غير القيد
-- ده كل ضغطة كانت هتعمل **سطر تاني** لنفس المحاضرة.
-- القيد على (user_id, storage_path) مش على id لوحده: نفس الملف
-- المفروض يبقى محاضرة واحدة **لنفس المستخدم** بس.
-- ⚠️ Postgres بيعامل NULLs كقيم متمايزة في القيد الفريد، فالمحاضرات
-- اللي مالهاش storage_path (تسجيل مباشر في المرحلة ٧) مش بتتعارض.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lectures_user_storage_path_key'
  ) then
    alter table public.lectures
      add constraint lectures_user_storage_path_key
      unique (user_id, storage_path);
  end if;
end $$;

-- ٤) تحديث `updated_at` تلقائي — لو السطر اتعدّل بعدين (مراحل الـ AI)
--    التاريخ لازم يمشي معاه.
drop trigger if exists lectures_set_updated_at on public.lectures;
create trigger lectures_set_updated_at
  before update on public.lectures
  for each row
  execute function public.set_updated_at();

-- ٥) RLS.
-- ⚠️ **أهم سطر في الملف ده**: الجدول فيه تفريغات محاضرات — بيانات دراسية
-- شخصية. لازم المستخدم ما يقراش غير اللي له.
alter table public.lectures enable row level security;

-- FORCE: الجدول لصاحبه بس. من غير ده `table owner` (postgres) بيقدر يقرا
-- كل الجدول لو نسي الفلتر. الـ service-role في Supabase بيمرّي RLS كـ
-- postgres — فالـ API في السيرفر **لازم** يفلتر بـ user_id بنفسه (وبيده).
alter table public.lectures force row level security;

do $$
begin
  drop policy if exists "lectures: owner full access" on public.lectures;
end $$;

-- سياسة واحدة بتغطي الأربعة (نفس أسلوب db/chat.sql في المشروع بالظبط).
--   using     = الصفوف المرئية للقراءة/التعديل/الحذف.
--   with check = السطر الجديد لازم يكون لصاحب الجلسة — وده اللي بيمنع
--                حد يبعت user_id بتاع حد تاني في طلب INSERT.
create policy "lectures: owner full access" on public.lectures
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ٦) تعليقات — التوثيق lives مع الجدول زي باقي ملفات المشروع.
comment on table public.lectures is
  'Phase 3 — محاضرات المستخدم: تفريغ كامل (text + jsonb) + metadata. أعمدة AI (summary/explanation) محجوزة لمراحل جاية.';
comment on column public.lectures.transcript_text is
  'نص التفريغ كامل — للبحث والعرض.';
comment on column public.lectures.transcript_data is
  'عقد LectureTranscript الكامل (segments/words بتوقيتاتها) — غير مقصوص.';
comment on column public.lectures.source_type is
  'upload | live_recording — التسجيل المباشر جاي في المرحلة ٧.';
comment on column public.lectures.status is
  'processing | completed | failed.';
comment on column public.lectures.user_id is
  'صاحب المحاضرة — من جلسة المصادقة بس، لا يُقبل من العميل.';

-- ============================================================================
-- ⚠️ للمراجعة قبل التشغيل على Supabase:
--   ١) الملف idempotent — ينفع يتنفّذ أكتر من مرة.
--   ٢) مافيش أي تعديل على جداول أو سياسات تانية.
--   ٣) RLS شغّال من لحظة الإنشاء — الجدول مش مكشوف لحظة واحدة.
--   ٤) بعد التشغيل: جدول `lectures` فاضي وما فيش backfill — لحد ما حد
--      يرفع محاضرة تانية، مفيش تفريغ قديم محفوظ (اللي فات ضاع).
-- ============================================================================

