-- ═══════════════════════════════════════════════════════════
-- 51) ميزانية الامتحان: القطع من الإجمالي + إلغاء الرفض عند ٦٠ ألف
-- ═══════════════════════════════════════════════════════════
--
-- **العَرَض**: طالب بيرفع ملف/محاضرة كبيرة ⇒ رسالة
--   `total chunks 69 exceeds limit 9` ومنع إنشاء الامتحان.
--
-- **السبب الجذري** (باگ حساب، مش حجم كبير):
--   `sum(ceil(length(row) / 12000))` بتتحسب **لكل صف** (كل صفحة
--   مستند / كل محاضرة). ملف 69 صفحة صغيرة (~35 ألف حرف، أقل من
--   سقف الـ60 ألف) بيطلع **69 قطعة** ⇒ رفض رغم إنه صغير.
--
-- **الإصلاح**:
--   ① `total_chunks := ceil(total_chars / 12000)` — على الإجمالي.
--   ② شيل الرفض عند 60 ألف: التوليد بيقصّ كل مصدر لـ
--      `EXAM_SOURCE_MAX_CHARS` (60 ألف) وقت القراءة أصلاً
--      (`lib/ai/exam-sources.ts`)، فالرفض كان بيمنع حالة
--      كان ممكن تتولّد بنجاح من أول جزء.
--   ③ سقف ٢ مليون حرف كحماية من الإساءة فقط.
--
-- **التوافق**: نفس الـsignature ونفس الـOUT columns ⇒ مافيش كسر.
-- ⚠️ الراوت بيرجّع `notice` للطالب لما المصدر يتقصّ.
-- ═══════════════════════════════════════════════════════════

begin;

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

  -- ⚠️ **`cardinality` مش `array_length`**: في Postgres `array_length('{}', 1)`
  --    بترجّع **NULL** (مش 0) ⇒ `NULL + 1 = NULL` ⇒ `total_lectures` بتبقى
  --    NULL ⇒ انتهاك `not null` على `exam_sessions` ⇒ **500** عند إنشاء
  --    أي امتحان (محاضرة بس أو مستند بس أو الاتنين).
  --    `cardinality` بترجّع 0 للمصفوفة الفاضية ⇒ كل الحسابات سليمة.
  v_source_count := cardinality(v_lecture_ids) + cardinality(v_document_ids);
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

  -- ⚠️ `cardinality` مش `array_length` — نفس السبب (NULL يخلي الفحص
  --    `0 <> NULL` ⇒ NULL ⇒ الفحص بيتخطّى والمرور بيتم!).
  if v_owned_lectures <> cardinality(v_lecture_ids) then
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

  if v_owned_documents <> cardinality(v_document_ids) then
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
  -- ⚠️ **القطع من الإجمالي** — مش `sum(ceil(len/12000))` لكل صف:
  --    ملف 69 صفحة صغيرة (٥٠٠ حرف/صفحة ≈ ٣٤ ألف حرف) كان بيتحسب
  --    **69 قطعة** ⇒ رفض «total chunks 69 exceeds limit 9» رغم إن
  --    حجمه أقل من السقف بكتير. الحساب الصح على مجموع الحروف.
  v_total_chunks := ceil(v_total_chars::numeric / 12000)::int;
  -- ⚠️ مافيش رفض عند ٦٠ ألف حرف: التوليد بيقصّ النص لـ
  --    `EXAM_SOURCE_MAX_CHARS` (٦٠ ألف) وقت القراءة. السقف هنا
  --    **حماية من الإساءة** بس (نص أكبر من ٢ مليون حرف).
  if v_total_chars > 2000000 then
    raise exception 'source too large: % chars', v_total_chars;
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
    (cardinality(v_lecture_ids) + row_number() over (order by d.ordinality))::int,
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

-- ═══════════════════════════════════════════════════════════
-- 4) إصلاح الـRPC القديم (محاضرات بس) — نفس bug الـ`array_length`
-- ═══════════════════════════════════════════════════════════
-- ⚠️ **ليه**: `create_exam_session_with_reserve` (القديم) لسه فيه
--    `array_length` ⇒ بيرجّع NULL للمصفوفة الفاضية ⇒
--    `total_lectures` بتبقى NULL ⇒ انتهاك `not null` ⇒ **500**.
--    وهو ده **الـfallback** اللي بنستخدموه لما الـRPC الجديد يفشل ⇒
--    فلازم يتصلّح معاه (من غيره البقاء خطأ 500 زي ما كان).
--
-- ⚠️ **التوقيع والسلوك ما اتغيّروش** (نفس الـsignature + نفس الـcolumns)
--    ⇒ مافيش كسر لمنافس.
create or replace function public.create_exam_session_with_reserve(
  p_mode text,
  p_lecture_ids uuid[]
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
  v_lecture_count int;
  v_total_chars int;
  v_total_chunks int;
  v_estimated_tokens int;
  v_deduped_ids uuid[];
  v_owned_count int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_mode is distinct from 'last_minute_review' then
    raise exception 'invalid mode: %', p_mode;
  end if;

  -- ⚠️ `cardinality` مش `array_length`: في Postgres `array_length('{}', 1)`
  --    بترجّع **NULL** (مش 0) ⇒ `NULL + 1 = NULL` ⇒ `total_lectures` NULL
  --    ⇒ انتهاك `not null` ⇒ **500** عند إنشاء أي امتحان.
  if p_lecture_ids is null or cardinality(p_lecture_ids) = 0 then
    raise exception 'lecture_ids required';
  end if;

  -- إزالة التكرار داخل الـ RPC (العميل قد يرسل نفس المعرّف مرتين)
  select coalesce(array_agg(distinct ids.id), '{}'::uuid[]) into v_deduped_ids
  from unnest(p_lecture_ids) as ids(id);

  v_lecture_count := cardinality(v_deduped_ids);
  if v_lecture_count < 1 or v_lecture_count > 3 then
    raise exception 'lecture count must be 1..3 after dedup, got %', v_lecture_count;
  end if;

  -- الملكية + الميزانية تُحسب من القاعدة لا من العميل
  select
    count(*),
    coalesce(sum(length(lec.transcript_text)), 0),
    coalesce(sum(ceil(length(lec.transcript_text)::numeric / 12000)), 0)
  into v_owned_count, v_total_chars, v_total_chunks
  from public.lectures as lec
  where lec.id = any(v_deduped_ids)
    and lec.user_id = v_user_id;

  if v_owned_count <> v_lecture_count then
    raise exception 'one or more lectures not found or not owned';
  end if;
  -- نفس إصلاح الدالة اللي فوق: القطع من الإجمالي، ومفيش رفض عند
  -- ٦٠ ألف حرف (التوليد بيقصّ النص وقت القراءة).
  v_total_chunks := ceil(v_total_chars::numeric / 12000)::int;
  if v_total_chars > 2000000 then
    raise exception 'source too large: % chars', v_total_chars;
  end if;

  v_estimated_tokens := v_total_chars / 4;

  insert into public.exam_sessions (
    user_id, mode, status,
    total_lectures, total_chars, total_chunks, estimated_tokens
  ) values (
    v_user_id, p_mode, 'created',
    v_lecture_count, v_total_chars, v_total_chunks, v_estimated_tokens
  ) returning id into v_session_id;

  insert into public.exam_session_items (
    session_id, user_id, lecture_id, ordinal, status, transcript_chars
  )
  select
    v_session_id, v_user_id, l.id, l.ordinality, 'queued', length(lec.transcript_text)
  from unnest(v_deduped_ids) with ordinality as l(id, ordinality)
  join public.lectures as lec on lec.id = l.id and lec.user_id = v_user_id;

  -- ⚠️ مؤهَّل بـ i. : بدونه يتقاطع session_id مع OUT-param ⇒ 42702
  if (select count(*) from public.exam_session_items as i where i.session_id = v_session_id)
     <> v_lecture_count then
    raise exception 'one or more lectures not found or not owned';
  end if;

  -- حجز كريدت واحد للجلسة كلها (idempotent عبر ref_id الثابت)
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

revoke all on function public.create_exam_session_with_reserve(text, uuid[]) from public;
revoke all on function public.create_exam_session_with_reserve(text, uuid[]) from anon;
grant execute on function public.create_exam_session_with_reserve(text, uuid[]) to authenticated;
grant execute on function public.create_exam_session_with_reserve(text, uuid[]) to service_role;
commit;
