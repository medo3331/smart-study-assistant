-- ============================================================================
-- 26-exam-sessions.sql
-- Exam Engine — Phase 1.2: Sessions + Items + RLS + 7 RPCs
-- ============================================================================
-- ملاحظة مهمة: هذا الملف هو **سجل المستودع** للحالة التي طُبِّقت فعليًا على
-- قاعدة الإنتاج (2026-11-04) عبر Supabase SQL Editor. أُعيد تطبيقه بالكامل
-- بعد إصلاح عيب كامن في `create_exam_session_with_reserve`:
--
--   ⚠️ العيب: الاستعلام `WHERE session_id = v_session_id` كان **غير مؤهَّل**
--   باسم الجدول، و`session_id` هو أيضًا OUT-param في `RETURNS TABLE`.
--   و`plpgsql.variable_conflict = error` (القيمة الافتراضية، ومتحقَّق منها
--   على هذه القاعدة) ⇒ أول استدعاء كان سيرمي
--   `42702: column reference "session_id" is ambiguous`.
--   الإصلاح: `AS i` + `i.session_id`.
--
-- idempotent: كل العبارات IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS.
-- additive: لا يعدّل أي جدول أو دالة موجودة.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════
-- 1. exam_sessions
-- ═══════════════════════════════════════════════════════════
create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('last_minute_review')),
  status text not null default 'created' check (status in (
    'created','generating','ready','completed','failed','abandoned'
  )),
  total_lectures int not null check (total_lectures between 1 and 3),
  total_chars int not null check (total_chars between 0 and 60000),
  total_chunks int not null check (total_chunks between 0 and 9),
  estimated_tokens int not null check (estimated_tokens >= 0),
  logical_calls_used int not null default 0 check (logical_calls_used >= 0),
  provider_attempts_used int not null default 0 check (provider_attempts_used >= 0),
  credit_reserved_at timestamptz null,
  credit_refunded_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_sessions_credit_dates check (
    credit_refunded_at is null or credit_reserved_at is not null
  )
);

create index if not exists idx_exam_sessions_user_created
  on public.exam_sessions (user_id, created_at desc);
create index if not exists idx_exam_sessions_user_status
  on public.exam_sessions (user_id, status);

alter table public.exam_sessions enable row level security;
alter table public.exam_sessions force row level security;

drop policy if exists exam_sessions_owner_select on public.exam_sessions;
create policy exam_sessions_owner_select
  on public.exam_sessions
  for select to authenticated
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- 2. exam_session_items
-- ═══════════════════════════════════════════════════════════
create table if not exists public.exam_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  ordinal int not null check (ordinal between 1 and 3),
  status text not null default 'queued' check (status in (
    'queued','processing','ready','failed','canceled'
  )),
  claim_token uuid null,
  claimed_at timestamptz null,
  lease_expires_at timestamptz null,
  attempt_count int not null default 0 check (attempt_count >= 0),
  transcript_chars int null,
  chunk_count int null,
  result_json jsonb null check (result_json is null or jsonb_typeof(result_json) = 'object'),
  error_code text null,
  error_message text null check (error_message is null or length(error_message) <= 500),
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_session_items_session_lecture_unique unique (session_id, lecture_id),
  constraint exam_session_items_session_ordinal_unique unique (session_id, ordinal),
  constraint exam_session_items_processing_lease check (
    status <> 'processing' or (claim_token is not null and lease_expires_at is not null)
  )
);

create index if not exists idx_exam_session_items_session_status
  on public.exam_session_items (session_id, status);
create index if not exists idx_exam_session_items_session_ordinal
  on public.exam_session_items (session_id, ordinal);
create index if not exists idx_exam_session_items_recovery
  on public.exam_session_items (status, lease_expires_at)
  where status = 'processing';
create index if not exists idx_exam_session_items_user
  on public.exam_session_items (user_id);

alter table public.exam_session_items enable row level security;
alter table public.exam_session_items force row level security;

drop policy if exists exam_session_items_owner_select on public.exam_session_items;
create policy exam_session_items_owner_select
  on public.exam_session_items
  for select to authenticated
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- 3. updated_at triggers
-- ═══════════════════════════════════════════════════════════
drop trigger if exists trg_exam_sessions_updated_at on public.exam_sessions;
create trigger trg_exam_sessions_updated_at
  before update on public.exam_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_exam_session_items_updated_at on public.exam_session_items;
create trigger trg_exam_session_items_updated_at
  before update on public.exam_session_items
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 4. RPC: create_exam_session_with_reserve (atomic)
--    ⚠️ كل مرجع لعمود مؤهَّل باسم الجدول (s/i) لأن
--    plpgsql.variable_conflict = error وOUT-params تتقاطع مع الأسماء.
-- ═══════════════════════════════════════════════════════════
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
  if p_lecture_ids is null or array_length(p_lecture_ids, 1) is null then
    raise exception 'lecture_ids required';
  end if;

  -- إزالة التكرار داخل الـ RPC (العميل قد يرسل نفس المعرّف مرتين)
  select array_agg(distinct ids.id) into v_deduped_ids
  from unnest(p_lecture_ids) as ids(id);

  v_lecture_count := array_length(v_deduped_ids, 1);
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

-- ═══════════════════════════════════════════════════════════
-- 5. RPC: claim_exam_session_item (atomic claim + lease recovery)
-- ═══════════════════════════════════════════════════════════
create or replace function public.claim_exam_session_item(
  p_session_id uuid,
  p_item_id uuid,
  p_max_attempts int default 2
)
returns table (
  id uuid,
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count int,
  status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.exam_session_items%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.exam_session_items as i
     set status = 'processing',
         claim_token = v_token,
         claimed_at = now(),
         lease_expires_at = now() + interval '4 minutes',
         attempt_count = i.attempt_count + 1,
         started_at = coalesce(i.started_at, now())
   where i.id = p_item_id
     and i.session_id = p_session_id
     and i.user_id = v_user_id
     and (
       i.status in ('queued','failed')
       or (i.status = 'processing' and i.lease_expires_at < now())
     )
     and i.attempt_count < p_max_attempts
  returning * into v_row;

  if not found then
    return;
  end if;

  return query select
    v_row.id, v_row.claim_token, v_row.lease_expires_at,
    v_row.attempt_count, v_row.status;
end;
$$;

revoke all on function public.claim_exam_session_item(uuid, uuid, int) from public;
revoke all on function public.claim_exam_session_item(uuid, uuid, int) from anon;
grant execute on function public.claim_exam_session_item(uuid, uuid, int) to authenticated;
grant execute on function public.claim_exam_session_item(uuid, uuid, int) to service_role;

-- ═══════════════════════════════════════════════════════════
-- 6. RPC: renew_exam_session_lease (token-verified)
-- ═══════════════════════════════════════════════════════════
create or replace function public.renew_exam_session_lease(
  p_item_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.exam_session_items as i
     set lease_expires_at = now() + interval '4 minutes'
   where i.id = p_item_id
     and i.user_id = v_user_id
     and i.claim_token = p_claim_token
     and i.status = 'processing';

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.renew_exam_session_lease(uuid, uuid) from public;
revoke all on function public.renew_exam_session_lease(uuid, uuid) from anon;
grant execute on function public.renew_exam_session_lease(uuid, uuid) to authenticated;
grant execute on function public.renew_exam_session_lease(uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════
-- 7. RPC: save_exam_session_result (token-verified)
-- ═══════════════════════════════════════════════════════════
create or replace function public.save_exam_session_result(
  p_item_id uuid,
  p_claim_token uuid,
  p_result_json jsonb,
  p_transcript_chars int default null,
  p_chunk_count int default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_result_json is null then
    raise exception 'result_json required';
  end if;

  update public.exam_session_items as i
     set status = 'ready',
         result_json = p_result_json,
         transcript_chars = coalesce(p_transcript_chars, i.transcript_chars),
         chunk_count = coalesce(p_chunk_count, i.chunk_count),
         completed_at = now(),
         claim_token = null,
         lease_expires_at = null,
         error_code = null,
         error_message = null
   where i.id = p_item_id
     and i.user_id = v_user_id
     and i.claim_token = p_claim_token
     and i.status = 'processing';

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.save_exam_session_result(uuid, uuid, jsonb, int, int) from public;
revoke all on function public.save_exam_session_result(uuid, uuid, jsonb, int, int) from anon;
grant execute on function public.save_exam_session_result(uuid, uuid, jsonb, int, int) to authenticated;
grant execute on function public.save_exam_session_result(uuid, uuid, jsonb, int, int) to service_role;

-- ═══════════════════════════════════════════════════════════
-- 8. RPC: fail_exam_session_item (token-verified)
-- ═══════════════════════════════════════════════════════════
create or replace function public.fail_exam_session_item(
  p_item_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
  v_message text := p_error_message;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if v_message is not null and length(v_message) > 500 then
    v_message := left(v_message, 500);
  end if;

  update public.exam_session_items as i
     set status = 'failed',
         error_code = p_error_code,
         error_message = v_message,
         claim_token = null,
         lease_expires_at = null
   where i.id = p_item_id
     and i.user_id = v_user_id
     and i.claim_token = p_claim_token
     and i.status = 'processing';

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.fail_exam_session_item(uuid, uuid, text, text) from public;
revoke all on function public.fail_exam_session_item(uuid, uuid, text, text) from anon;
grant execute on function public.fail_exam_session_item(uuid, uuid, text, text) to authenticated;
grant execute on function public.fail_exam_session_item(uuid, uuid, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════
-- 9. RPC: increment_exam_session_usage (atomic 15 / 45 caps)
-- ═══════════════════════════════════════════════════════════
create or replace function public.increment_exam_session_usage(
  p_session_id uuid,
  p_logical int default 0,
  p_attempts int default 0,
  p_max_logical int default 15,
  p_max_attempts int default 45
)
returns table (
  logical_calls_used int,
  provider_attempts_used int,
  allowed boolean,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.exam_sessions%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_logical < 0 or p_attempts < 0 then
    raise exception 'deltas must be >= 0';
  end if;

  select * into v_session
  from public.exam_sessions as s
  where s.id = p_session_id and s.user_id = v_user_id
  for update;

  if not found then
    raise exception 'session not found or not owned';
  end if;

  if (v_session.logical_calls_used + p_logical) > p_max_logical then
    return query select
      v_session.logical_calls_used,
      v_session.provider_attempts_used,
      false,
      'logical_limit_reached'::text;
    return;
  end if;

  if (v_session.provider_attempts_used + p_attempts) > p_max_attempts then
    return query select
      v_session.logical_calls_used,
      v_session.provider_attempts_used,
      false,
      'attempts_limit_reached'::text;
    return;
  end if;

  update public.exam_sessions as s
     set logical_calls_used = s.logical_calls_used + p_logical,
         provider_attempts_used = s.provider_attempts_used + p_attempts
   where s.id = p_session_id;

  return query select
    v_session.logical_calls_used + p_logical,
    v_session.provider_attempts_used + p_attempts,
    true,
    'ok'::text;
end;
$$;

revoke all on function public.increment_exam_session_usage(uuid, int, int, int, int) from public;
revoke all on function public.increment_exam_session_usage(uuid, int, int, int, int) from anon;
grant execute on function public.increment_exam_session_usage(uuid, int, int, int, int) to authenticated;
grant execute on function public.increment_exam_session_usage(uuid, int, int, int, int) to service_role;

-- ═══════════════════════════════════════════════════════════
-- 10. RPC: get_exam_session_item_state (423 vs 200 disambiguation)
-- ═══════════════════════════════════════════════════════════
create or replace function public.get_exam_session_item_state(
  p_item_id uuid
)
returns table (
  id uuid,
  status text,
  attempt_count int,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  is_claimed boolean,
  is_ready boolean,
  result_json jsonb
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    i.id,
    i.status,
    i.attempt_count,
    i.claimed_at,
    i.lease_expires_at,
    (i.status = 'processing' and i.lease_expires_at > now()) as is_claimed,
    (i.status = 'ready') as is_ready,
    i.result_json
  from public.exam_session_items as i
  where i.id = p_item_id
    and i.user_id = auth.uid();
$$;

revoke all on function public.get_exam_session_item_state(uuid) from public;
revoke all on function public.get_exam_session_item_state(uuid) from anon;
grant execute on function public.get_exam_session_item_state(uuid) to authenticated;
grant execute on function public.get_exam_session_item_state(uuid) to service_role;

-- ============================================================================
-- تحقق بعد التطبيق (SELECT فقط):
--   select to_regclass('public.exam_sessions'), to_regclass('public.exam_session_items');
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and proname like '%exam_session%' order by 1;
-- المتوقع: 7 دوال.
-- ============================================================================
