-- ============================================================================
-- Phase 5 (MANUAL RUN — #38 in the unified SQL list)
-- documents — ملفات المستخدم المستخرجة صفحة بصفحة (ل توليد العروض)
-- ============================================================================
-- ليه جدول جديد و مش نمدّد `materials`:
--   `materials` مربوط بـ ٦+ مواضع في المنتج (workspace digest، chat source
--   resolver، file analysis، searchUserFiles…) وفيه `content` نص مدمج
--   مقصوص على ٦٠ ألف حرف. هو **مش** مكان الصفحات.
--
--   `documents` = الملف نفسه + الـ metadata + آخر deck متولّد.
--   والصفحات نفسها بتتخزّن في `knowledge_base` (انظر آخر الملف).
--
-- ⚠️ ليه `knowledge_base` ومش جدول `document_pages` جديد:
--   الجدول **موجود فعلاً** وفيه الأعمدة المطلوبة بالظبط:
--     `source_id` (رابط بالـ document) · `source_page` (رقم الصفحة)
--     · `chunk_index` · `content` · `embedding` · `user_id` · `source_type`
--   و `match_knowledge` (الـ RPC) بيرجّع `source_page` جاهز.
--   ⇒ جدول واحد أقل = migration أقل = RLS أقل.
--
-- idempotent: كل عبارة guarded — آمن للتكرار.
-- additive: **مش بيعمل أي تعديل** على جداول موجودة ولا على صفوف.
-- ============================================================================

-- ١) جدول المستندات.
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),

  -- صاحب الملف. auth.users → الحساب بيتشال معاه (cascade).
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- ربط اختياري بالمادة في `materials` (نفس الملف اتسجّل اتنين).
  -- `on delete set null` — لو المادة اتمسحت، المستند يفضل (هو اللي فيه
  -- الصفحات والـ deck).
  material_id  uuid references public.materials (id) on delete set null,

  -- العنوان المعروض (اسم الملف أو عنوان كتبه المستخدم).
  title        text not null,

  -- نوع الملف: pdf | pptx | docx | text | image
  file_type    text,

  -- الحجم بالبايت.
  file_size    bigint,

  -- ⚠️ **وحدة العدّ بتختلف حسب النوع**:
  --    pdf  → عدد الصفحات
  --    pptx → عدد الشرائح
  --    docx → عدد الفقرات/الأقسام (الـ DOCX مالوش صفحات ثابتة — الـ page
  --           count ناتج rendering مش data)
  --    نص/صورة → 1
  page_count   integer not null default 0,

  -- ready = كل الصفحات اتقرت · partial = في صفحات متقراش (PDF مصوّر)
  -- failed = الاستخراج فشل
  status       text not null default 'ready'
                check (status in ('ready','partial','failed')),

  -- ⚠️ **الصفحات اللي متقرتش** (أرقام 1-based) — عشان الـ UI يقدر يقول
  --    للطالب «صفحات ٧-٤٨ مش متقراية» بدل ما نعمل كذب.
  unread_pages integer[] not null default '{}',

  -- آخر deck متولّد (نفس شكل الـ JSON اللي بيرجّعه الـ endpoint).
  deck         jsonb,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ٢) الفهرسة.
-- الفهرس الأساسي: مستندات المستخدم الأحدث فوق (زي `materials_user_created_idx`).
create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

-- فهرس جزئي — مفيد لو حبينا «المستندات اللي عندها deck».
create index if not exists documents_has_deck_idx
  on public.documents (created_at desc)
  where deck is not null;

-- ٣) الـ trigger بتاع `updated_at`.
-- ⚠️ `set_updated_at` معرّفة في `db/14-lectures.sql` — بنستعملها بدل ما
--    نعرّف واحدة تانية (مصدر واحد للتوقيع).
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

-- ٤) RLS — نفس النمط بتاع `materials` (owner فقط).
alter table public.documents enable row level security;

drop policy if exists "documents: owner reads"   on public.documents;
drop policy if exists "documents: owner writes"  on public.documents;
drop policy if exists "documents: owner updates" on public.documents;
drop policy if exists "documents: owner deletes" on public.documents;

create policy "documents: owner reads"   on public.documents for select using (auth.uid() = user_id);
create policy "documents: owner writes"  on public.documents for insert with check (auth.uid() = user_id);
create policy "documents: owner updates" on public.documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents: owner deletes" on public.documents for delete using (auth.uid() = user_id);

-- ٥) توثيق.
--
-- ⚠️ **`source_type`/`source_kind` للصفحات**: `user` / `material` — مش
--    `document` / `page`. السبب: CHECK constraint موجود في القاعدة
--    (`kb_source_type_kind_check`) بيقبل زوجين بس:
--      (source_type='sample', source_kind='sample')
--      (source_type='user',   source_kind IN ('material','lecture'))
--    ⇒ أي زوج تاني بيرمي `23514`. (الـ CHECK ده بره الـ migrations —
--    انظر N-011 في `docs/TECH_DEBT.md`.)
comment on table public.documents is
  'Phase 5 — مستندات المستخدم مستخرجة صفحة بصفحة (PDF/PPTX/DOCX). الصفحات بتتخزّن في knowledge_base بـ source_id = documents.id و source_type = ''user'' و source_kind = ''material''';
comment on column public.documents.page_count is
  'عدد وحدات العدّ: صفحات (PDF) · شرائح (PPTX) · فقرات (DOCX).';
comment on column public.documents.unread_pages is
  'أرقام الوحدات اللي متقرتش (PDF مصوّر بيقري أول ٦ صفحات بس) — عشان الـ UI يصرّح للطالب.';
comment on column public.documents.deck is
  'آخر عرض تولّد: { version, title, subtitle, slides[], source{} }.';

-- ============================================================================
-- ⚠️ تخزين الصفحات في `knowledge_base` (من Outside)
-- ============================================================================
-- الصفحات بتتخزّن في `knowledge_base` بالأعمدة الموجودة أصلاً:
--
--   user_id       = صاحب المستند
--   source_id     = documents.id
--   source_type   = 'user'      ← مش 'document' (CHECK constraint — شوف فوق)
--   source_kind   = 'material'  ← مش 'page'/'slide'/'paragraph' (CHECK)
--   source_name   = عنوان الملف
--   source_page   = رقم الوحدة (1-based، كنص — عشان يحمل «شريحة ٤» كمان)
--   chunk_index   = ترتيب القطعة جوه الصفحة
--   content       = نص الصفحة
--   subject       = المادة (اختياري)
--   embedding     = vector(1536) — **NULL في v1** (الـ RAG شغل منفصل)
--
-- ⚠️ **مش بنعمل migration على `knowledge_base`**: الجدول في القاعدة فيه
--    أعمدة (`user_id`, `source_type`, `source_kind`, `source_id`,
--    `workspace_subject_id`, `chunk_index`, `processing_version`) مش في
--    أي ملف `db/*.sql` ⇒ **schema drift**. متسجّل في `docs/TECH_DEBT.md`
--    كـ تيكيت منفصل (N-011) ومتعملوش هنا — عشان ما نكسرش حاجة.
-- ============================================================================
