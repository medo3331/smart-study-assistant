-- ============================================================================
-- 49-exam-documents.sql — مصدر تاني للامتحان: المستندات (PDF/PPTX/DOCX)
-- ----------------------------------------------------------------------------
-- المشكلة: مولّد الامتحانات كان مربوط بـ`public.lectures` بس (الصوتيات
-- اللي ليها تفريغ). الطالب كان بيحاول يعمل امتحان من ملف PDF في مساحة
-- العمل ⇒ مفيش بند للملف ⇒ 502/503.
--
-- الحل (additive — ما بيعدّلش أي جدول أو دالة موجودة):
--   ① `exam_session_items.document_id` — مرجع اختياري للمستند.
--      `lecture_id` بقى nullable (البندMixin: recording **أو** document).
--   ② RPC جديد `create_exam_session_with_sources_reserve` — بيقبل
--      المحاضرات **و** المستندات في نداء واحد (مع نفس سقف 3 مصادر).
--      الـRPC القديم `create_exam_session_with_reserve` زي ما هو (مفيش
--      كسر لمنافس).
--
-- ⚠️ **ليه بند جديد مش تعديل على الـRPC القديم**: المتصلين بالقديم
--    (ExamGenerator وغيره) بيحتاجوا نفس السلوك بالظبط، والتعديل كان
--    هيعني كسر في الـsignature ⇒ إعادة بناء في كل مكان.
--
-- idempotent: كل العبارات IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════
-- 1) عمود المستند على البنود
-- ═══════════════════════════════════════════════════════════
alter table public.exam_session_items
  add column if not exists document_id uuid references public.documents (id) on delete cascade;

-- ⚠️ `lecture_id` بقى nullable: البند ممكن يكون **مستند** من غير محاضرة.
--    القيد الجديد (تحت) بيضمن إن كل بند له مصدر واحد بالظبط.
alter table public.exam_session_items
  alter column lecture_id drop not null;

comment on column public.exam_session_items.document_id is
  'المستند المصدر (PDF/PPTX/DOCX) بدل المحاضرة — بند الامتحان بياخد مصدره من المحاضرة أو من المستند (مش الاتنين مع بعض).';

-- ═══════════════════════════════════════════════════════════
-- 2) القيد: مصدر واحد بالظبط + uniqueness
-- ═══════════════════════════════════════════════════════════
-- ⚠️ `unique (session_id, lecture_id)` الموجود بيفضل شغال: في Postgres
--    الـNULLs ما بتتعارضش في قيد unique (NULL مسموح في أكثر من صف) ⇒ يبقى آمن.
alter table public.exam_session_items
  drop constraint if exists exam_session_items_session_document_unique;
alter table public.exam_session_items
  add constraint exam_session_items_session_document_unique unique (session_id, document_id);

alter table public.exam_session_items
  drop constraint if exists exam_session_items_exactly_one_source;
alter table public.exam_session_items
  add constraint exam_session_items_exactly_one_source
  check (
    (lecture_id is not null and document_id is null)
    or (lecture_id is null and document_id is not null)
  );

-- ═══════════════════════════════════════════════════════════
-- 3) RPC: create_exam_session_with_sources_reserve
--    (محاضرات + مستندات في جلسة واحدة)
-- ═══════════════════════════════════════════════════════════
create or replace function public.create_exam_session_with_sources_reserve(
  p_mode text,
  p_lecture_ids uuid[],
  p_document_ids uuid[]
)
returns table (
  session_id uuid,
  status text,
  credit_reserved_at timestamptz,
  total_chars int,
  total_chunks int,
  estimated_tokens int
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_reserved_at timestamptz;
  v_lecture_ids uuid[] := '{}';
  v_document_ids uuid[] := '{}';
  v_source_count int;
  v_total_chars int;
  v_total_chunks int;
  v_estimated_tokens int;
  v_lecture_chars int;
  v_lecture_chunks int;
  v_doc_chars int;
  v_doc_chunks int;
  v_owned_lectures int;
  v_owned_documents int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_mode is distinct from 'last_minute_review' then
    raise exception 'invalid mode: %', p_mode;
  end if;

  -- ① إزالة التكرار (العميل ممكن يبعت نفس المعرّف مرتين).
  select coalesce(array_agg(distinct ids.id), '{}')
    into v_lecture_ids
    from unnest(coalesce(p_lecture_ids, '{}'::uuid[])) as ids(id);

  select coalesce(array_agg(distinct ids.id), '{}')
    into v_document_ids
    from unnest(coalesce(p_document_ids, '{}'::uuid[])) as ids(id);

  v_source_count := array_length(v_lecture_ids, 1) + array_length(v_document_ids, 1);
  if v_source_count < 1 or v_source_count > 3 then
    raise exception 'source count must be 1..3 after dedup, got %', v_source_count;
  end if;

  -- ② الملكية + الميزانية — من القاعدة مش من العميل.
  --    المحاضرة: الطول من `transcript_text`.
  select
    count(*),
    coalesce(sum(length(lec.transcript_text)), 0),
    coalesce(sum(ceil(length(lec.transcript_text)::numeric / 12000)), 0)
  into v_owned_lectures, v_lecture_chars, v_lecture_chunks
  from public.lectures as lec
  where lec.id = any(v_lecture_ids)
    and lec.user_id = v_user_id;

  if v_owned_lectures <> array_length(v_lecture_ids, 1) then
    raise exception 'one or more lectures not found or not owned';
  end if;

  -- المستند: الملكية الأول (عدّ المستندات نفسها)، بعدين الطول من الصفحات.
  -- ⚠️ **العدّ لازم يكون على `documents`** مش على الـjoin مع knowledge_base
  --    — الأخير بيدّي عدد الصفحات (صف/بند واحد) مش عدد المستندات.
  select count(*)
  into v_owned_documents
  from public.documents as doc
  where doc.id = any(v_document_ids)
    and doc.user_id = v_user_id;

  if v_owned_documents <> array_length(v_document_ids, 1) then
    raise exception 'one or more documents not found or not owned';
  end if;

  -- النص المستخرج (صفحات knowledge_base) — الحد الأقصى 60 ألف حرف
  -- للمجموعة كلها (نفس سقف الجلسة).
  select
    coalesce(sum(length(kb.content)), 0),
    coalesce(sum(ceil(length(kb.content)::numeric / 12000)), 0)
  into v_doc_chars, v_doc_chunks
  from public.knowledge_base as kb
  where kb.source_id = any(v_document_ids)
    and kb.source_type = 'user'
    and kb.source_kind = 'material'
    and exists (
      select 1 from public.documents as doc
      where doc.id = kb.source_id and doc.user_id = v_user_id
    );

  v_total_chars := v_lecture_chars + v_doc_chars;
  v_total_chunks := v_lecture_chunks + v_doc_chunks;
  if v_total_chars > 60000 then
    raise exception 'total chars % exceeds limit 60000', v_total_chars;
  end if;
  if v_total_chunks > 9 then
    raise exception 'total chunks % exceeds limit 9', v_total_chunks;
  end if;

  v_estimated_tokens := v_total_chars / 4;

  insert into public.exam_sessions (
    user_id, mode, status,
    total_lectures, total_chars, total_chunks, estimated_tokens
  ) values (
    v_user_id, p_mode, 'created',
    v_source_count, v_total_chars, v_total_chunks, v_estimated_tokens
  ) returning id into v_session_id;

  -- ③ البنود — محاضرة أو مستند، بالترتيب: المحاضرات الأول وبعدها المستندات.
  insert into public.exam_session_items (
    session_id, user_id, lecture_id, document_id, ordinal, status, transcript_chars
  )
  select
    v_session_id,
    v_user_id,
    lec.id,
    null::uuid,
    row_number() over (order by l.ordinality)::int,
    'queued',
    length(lec.transcript_text)
  from unnest(v_lecture_ids) with ordinality as l(id, ordinality)
  join public.lectures as lec on lec.id = l.id and lec.user_id = v_user_id;

  -- ⚠️ **بند واحد لكل مستند**: الـlateral summing بيرجّع مجموع طول
  --    الصفحات (مافيش بند لكل صفحة!) — نفس عدد البنود.
  insert into public.exam_session_items (
    session_id, user_id, lecture_id, document_id, ordinal, status, transcript_chars
  )
  select
    v_session_id,
    v_user_id,
    null::uuid,
    doc.id,
    (array_length(v_lecture_ids, 1) + row_number() over (order by d.ordinality))::int,
    'queued',
    coalesce(kb.total_chars, 0)
  from unnest(v_document_ids) with ordinality as d(id, ordinality)
  join public.documents as doc on doc.id = d.id and doc.user_id = v_user_id
  left join lateral (
    select sum(length(kb2.content))::int as total_chars
    from public.knowledge_base as kb2
    where kb2.source_id = doc.id
      and kb2.source_type = 'user'
      and kb2.source_kind = 'material'
  ) as kb on true;

  -- ⚠️ مؤهَّل بـ i. : بدونه يتقاطع session_id مع OUT-param ⇒ 42702
  if (select count(*) from public.exam_session_items as i where i.session_id = v_session_id)
     <> v_source_count then
    raise exception 'one or more sources not found or not owned';
  end if;

  -- ④ حجز كريدت واحد للجلسة كلها (idempotent عبر ref_id الثابت).
  perform public.reserve_ai_credit(
    v_user_id,
    'exam_session:' || v_session_id::text,
    1,
    'text',
    null,
    'exam_review'
  );

  update public.exam_sessions as s
     set credit_reserved_at = now()
   where s.id = v_session_id
  returning s.credit_reserved_at into v_reserved_at;

  return query select
    v_session_id, 'created'::text, v_reserved_at,
    v_total_chars, v_total_chunks, v_estimated_tokens;
end;
$$;

revoke all on function public.create_exam_session_with_sources_reserve(text, uuid[], uuid[]) from public;
revoke all on function public.create_exam_session_with_sources_reserve(text, uuid[], uuid[]) from anon;
grant execute on function public.create_exam_session_with_sources_reserve(text, uuid[], uuid[]) to authenticated;
grant execute on function public.create_exam_session_with_sources_reserve(text, uuid[], uuid[]) to service_role;
