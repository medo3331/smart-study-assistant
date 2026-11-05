-- ============================================================================
-- 35-study-day-unlocks.sql
-- Early Unlock — فتح درس مبكراً مقابل XP، موثّق في قاعدة البيانات
--
-- المشكلة اللي بيحلها:
--   الفتح المبكر كان في localStorage فقط، والخصم كان على حالة React.
--   يعني الفتح ماكانش بيتزامن بين الأجهزة، والـ XP كان بيرجع بعد الـ refresh.
--
-- الحل:
--   - جدول study_day_unlocks: صف واحد لكل (user, day).
--   - RPC unlock_study_day: يتحقق من الملكية، ومن إن الدرس مقفول فعلاً،
--     ويخصم XP ويسجّل الفتح في معاملة واحدة.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE.
-- additive: جدول ودالة جديدة فقط.
--
-- ⚠️ شغّل الملف ده في Supabase → SQL Editor قبل استخدام الفتح المبكر.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────
-- 1) الجدول
-- ─────────────────────────────────────────────────────────────

create table if not exists public.study_day_unlocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  day_id      uuid not null references public.study_days(id) on delete cascade,
  created_at  timestamptz not null default now(),
  cost_paid   int not null default 150 check (cost_paid >= 0),

  -- فتح واحد لكل درس لكل مستخدم — يمنع الدفع مرتين.
  constraint study_day_unlocks_user_day_unique unique (user_id, day_id)
);

create index if not exists idx_study_day_unlocks_user
  on public.study_day_unlocks (user_id, created_at desc);

alter table public.study_day_unlocks enable row level security;
alter table public.study_day_unlocks force row level security;

-- المستخدم يقرأ فتحاته فقط. مفيش سياسات INSERT/UPDATE/DELETE:
-- الكتابة بتتم عبر RPC SECURITY DEFINER أو service_role (اللي بيتخطى RLS).
drop policy if exists study_day_unlocks_owner_select on public.study_day_unlocks;
create policy study_day_unlocks_owner_select
  on public.study_day_unlocks
  for select to authenticated
  using (user_id = auth.uid());

comment on table public.study_day_unlocks is
  'Early Unlock — صف لكل درس اتفتح مبكراً. cost_paid بالـ XP. القراءة للمالك فقط، والكتابة عبر unlock_study_day.';
comment on column public.study_day_unlocks.cost_paid is
  'تكلفة الفتح المبكر بالـ XP — حاليًا 150.';

-- ─────────────────────────────────────────────────────────────
-- 2) RPC الفتح المبكر
-- ─────────────────────────────────────────────────────────────

create or replace function public.unlock_study_day(p_day_id uuid)
returns table (xp_remaining int, day_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_config_id uuid;
  v_day_number int;
  v_is_completed boolean;
  v_prev_completed boolean;
  v_xp int;
begin
  if v_uid is null then
    raise exception 'unlock_study_day: not authenticated';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'unlock_study_day: anonymous not allowed — create account';
  end if;

  if p_day_id is null then
    raise exception 'unlock_study_day: p_day_id required';
  end if;

  -- قفل صف الدرس لمنع فتحين متزامنين.
  select d.user_id, d.config_id, d.day_number, d.is_completed
    into v_owner, v_config_id, v_day_number, v_is_completed
  from public.study_days d
  where d.id = p_day_id
  for update;

  if not found then
    raise exception 'unlock_study_day: day not found';
  end if;

  if v_owner != v_uid then
    raise exception 'unlock_study_day: day does not belong to user';
  end if;

  if coalesce(v_is_completed, false) = true then
    raise exception 'unlock_study_day: day already completed';
  end if;

  -- Idempotent: لو مفتوح بالفعل، رجّع الرصيد الحالي من غير خصم جديد.
  if exists (
    select 1 from public.study_day_unlocks u
    where u.user_id = v_uid and u.day_id = p_day_id
  ) then
    select coalesce(p.xp, 0) into v_xp from public.profiles p where p.id = v_uid;
    return query select v_xp, p_day_id;
    return;
  end if;

  -- هل الدرس فعلاً مقفول؟ لازم اللي قبله يكون غير مكتمل.
  select d.is_completed
    into v_prev_completed
  from public.study_days d
  where d.config_id = v_config_id
    and d.user_id = v_uid
    and d.day_number < v_day_number
  order by d.day_number desc
  limit 1;

  if not found then
    raise exception 'unlock_study_day: day is already open (first lesson)';
  end if;

  if coalesce(v_prev_completed, false) = true then
    raise exception 'unlock_study_day: day is not locked';
  end if;

  select coalesce(p.xp, 0) into v_xp
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'unlock_study_day: profile not found';
  end if;

  if v_xp < 150 then
    raise exception 'unlock_study_day: insufficient xp';
  end if;

  -- نفس bypass الخاص بـ complete_study_day لأن trigger حماية XP بيتخطاه.
  perform set_config('app.xp_bypass', 'on', true);
  update public.profiles
  set xp = v_xp - 150
  where id = v_uid
  returning xp into v_xp;
  perform set_config('app.xp_bypass', 'off', true);

  insert into public.study_day_unlocks (user_id, day_id, cost_paid)
  values (v_uid, p_day_id, 150);

  return query select v_xp, p_day_id;
end;
$$;

revoke all on function public.unlock_study_day(uuid) from public;
grant execute on function public.unlock_study_day(uuid) to authenticated;

commit;

-- ============================================================================
-- تحقق بعد التطبيق (SELECT فقط):
-- ============================================================================
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'study_day_unlocks'
-- order by ordinal_position;
--
-- select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc
-- where proname = 'unlock_study_day';
