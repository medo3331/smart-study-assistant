-- ============================================================================
-- 50-exam-topic.sql — مصدر تالت للامتحان: **موضوع عام** (من غير ملفات)
-- ----------------------------------------------------------------------------
-- المشكلة: المولّد كان محتاج **ملف موجود** (محاضرةRecording أو مستند) ⇒
--   الطالب اللي عايز امتحان في موضوع عام (زي «البناء الضوئي») ومفيش عنده
--   ملفات ماكانش يقدر يشتغل خالص.
--
-- الحل (additive — ما بيعدّلش أي جدول أو دالة موجودة):
--   ① `exam_session_items.topic` — نص الموضوع (مصدر بديل للحصة/المستند).
--   ② القيد «مصدر واحد بالظبط» بيغطي المصدرين التلاتة.
--   ③ RPC جديد `create_exam_session_with_topic_reserve` — جلسة كاملة من
--      موضوع واحد (مع حجز الكريدت زي مصادر تانية).
--
-- ⚠️ **ليه بند جديد مش تعديل على الـRPC القديم**: الاتنين موجودين وبتعملوا
--    شغل مختلف (مصادر / موضوع) ⇒ فصلهم أوضح وأأمن (ماكسرناش أي متصل).
--
-- idempotent: كل العبارات IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════
-- 1) عمود الموضوع على البنود
-- ═══════════════════════════════════════════════════════════
alter table public.exam_session_items
  add column if not exists topic text;

comment on column public.exam_session_items.topic is
  'الموضوع العام (نص) — مصدر بديل للحصة/المستند: بند امتحان مبني على معلومات عامة في الموضوع ده.';

-- ═══════════════════════════════════════════════════════════
-- 2) القيد: مصدر واحد بالظبط من التلاتة
-- ═══════════════════════════════════════════════════════════
-- ⚠️ `num_nonnulls` بترجّع عدد القيم غير الـNULL ⇒ 1 يعني «مصدر واحد بالظبط».
alter table public.exam_session_items
  drop constraint if exists exam_session_items_exactly_one_source;
alter table public.exam_session_items
  add constraint exam_session_items_exactly_one_source
  check (num_nonnulls(lecture_id, document_id, topic) = 1);

-- ═══════════════════════════════════════════════════════════
-- 3) RPC: create_exam_session_with_topic_reserve
-- ═══════════════════════════════════════════════════════════
create or replace function public.create_exam_session_with_topic_reserve(
  p_mode text,
  p_topic text
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
  v_topic text;
  v_total_chars int;
  v_total_chunks int;
  v_estimated_tokens int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_mode is distinct from 'last_minute_review' then
    raise exception 'invalid mode: %', p_mode;
  end if;

  -- تنظيف الموضوع: قصّ + توحيد المسافات.
  v_topic := btrim(coalesce(p_topic, ''));
  if length(v_topic) < 3 then
    raise exception 'topic required';
  end if;
  if length(v_topic) > 300 then
    raise exception 'topic too long';
  end if;

  -- ⚠️ الموضوع مش تفريغ ⇒ «القطع» = 1 (نص قصير) والتقدير بسيط.
  v_total_chars := length(v_topic);
  v_total_chunks := 1;
  v_estimated_tokens := v_total_chars / 4;

  insert into public.exam_sessions (
    user_id, mode, status,
    total_lectures, total_chars, total_chunks, estimated_tokens
  ) values (
    v_user_id, p_mode, 'created',
    1, v_total_chars, v_total_chunks, v_estimated_tokens
  ) returning id into v_session_id;

  -- البند: مصدره = الموضوع (من غير محاضرة ومن غير مستند).
  insert into public.exam_session_items (
    session_id, user_id, lecture_id, document_id, topic, ordinal, status, transcript_chars
  ) values (
    v_session_id, v_user_id, null, null, v_topic, 1, 'queued', v_total_chars
  );

  -- ⚠️ مؤهَّل بـ i. : بدونه يتقاطع session_id مع OUT-param ⇒ 42702
  if (select count(*) from public.exam_session_items as i where i.session_id = v_session_id) <> 1 then
    raise exception 'topic item not created';
  end if;

  -- حجز كريدت واحد (نفس policy المصادر: كريدت واحد للجلسة كلها).
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

revoke all on function public.create_exam_session_with_topic_reserve(text, text) from public;
revoke all on function public.create_exam_session_with_topic_reserve(text, text) from anon;
grant execute on function public.create_exam_session_with_topic_reserve(text, text) to authenticated;
grant execute on function public.create_exam_session_with_topic_reserve(text, text) to service_role;
