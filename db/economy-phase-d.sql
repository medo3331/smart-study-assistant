-- ============================================================================
-- Phase D — Store Backend for Useful Products (Backend Infrastructure فقط)
-- التاريخ: ١ سبتمبر ٢٠٢٦
--
-- الهدف:
--   تجهيز بنية تحتية آمنة لـ Useful Store مستقبلاً بدون منتجات أو UI أو AI Credits runtime
--   Entitlements + AI Credit Ledger كـ Ledgers مستقلة (مثل coin_ledger) مع RLS و idempotency
--
-- Scope: additive فقط — لا تعديل coin_ledger / XP / Store / AI Router / catalog
-- شغّل مرة واحدة في Supabase SQL Editor (آمن للتكرار — كل شيء IF NOT EXISTS / OR REPLACE)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Entitlements — مانح الصلاحيات/الموديلات المستقبلية
-- ----------------------------------------------------------------------------
create table if not exists public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (btrim(kind) <> ''),
  value       text not null check (btrim(value) <> ''),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz null check (expires_at is null or expires_at >= granted_at),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- فهارس
create index if not exists entitlements_user_idx
  on public.entitlements (user_id);
create index if not exists entitlements_user_kind_value_idx
  on public.entitlements (user_id, kind, value);
create index if not exists entitlements_expires_at_idx
  on public.entitlements (expires_at) where expires_at is not null;

-- منع تكرار نفس الصلاحية الدائمة لنفس المستخدم (المنتهية مسموح تكرارها)
create unique index if not exists entitlements_user_kind_value_unique
  on public.entitlements (user_id, kind, value) where expires_at is null;

alter table public.entitlements enable row level security;

-- RLS: قراءة فقط لصاحبها، لا INSERT/UPDATE/DELETE للكلاينت
drop policy if exists "entitlements: owner reads" on public.entitlements;
create policy "entitlements: owner reads"
  on public.entitlements for select using (auth.uid() = user_id);

-- احتياط: احذف أي سياسات قديمة كُتبت باسم مختلف (idempotency)
drop policy if exists "users manage their own entitlements" on public.entitlements;
drop policy if exists "entitlements: owner writes" on public.entitlements;
drop policy if exists "entitlements: owner updates" on public.entitlements;
drop policy if exists "entitlements: owner deletes" on public.entitlements;

-- ----------------------------------------------------------------------------
-- 1B) RPCs — Entitlements
-- ----------------------------------------------------------------------------
-- grant_entitlement — server-side فقط (service_role). الكلاينت ممنوع.
-- idempotent للصلاحيات الدائمة عبر الفهرس الفريد الجزئي.
create or replace function public.grant_entitlement(
  p_user_id uuid,
  p_kind text,
  p_value text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (entitlement_id uuid, already_existed boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing uuid;
  v_new_id uuid;
begin
  if p_user_id is null then
    raise exception 'grant_entitlement: p_user_id required';
  end if;
  if p_kind is null or btrim(p_kind) = '' then
    raise exception 'grant_entitlement: p_kind required';
  end if;
  if p_value is null or btrim(p_value) = '' then
    raise exception 'grant_entitlement: p_value required';
  end if;
  if p_expires_at is not null and p_expires_at < now() then
    -- السماح بإنشاء منتهي للاختبار، لكن لا نمنع — فقط تحقق >= granted_at يُطبق في الجدول
    null;
  end if;

  -- فقط service_role يمكنه المنح — لا نسمح لـ authenticated بمنح لنفسه
  if coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'grant_entitlement: forbidden — service_role only';
  end if;

  -- idempotency للصلاحيات الدائمة
  if p_expires_at is null then
    select id into v_existing
    from public.entitlements
    where user_id = p_user_id and kind = btrim(p_kind) and value = btrim(p_value) and expires_at is null
    limit 1;
    if v_existing is not null then
      return query select v_existing, true::boolean;
      return;
    end if;
  end if;

  insert into public.entitlements (user_id, kind, value, expires_at, metadata)
  values (p_user_id, btrim(p_kind), btrim(p_value), p_expires_at, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_new_id;

  return query select v_new_id, false::boolean;
end;
$$;

revoke all on function public.grant_entitlement(uuid,text,text,timestamptz,jsonb) from public;
revoke all on function public.grant_entitlement(uuid,text,text,timestamptz,jsonb) from authenticated;
revoke all on function public.grant_entitlement(uuid,text,text,timestamptz,jsonb) from anon;
grant execute on function public.grant_entitlement(uuid,text,text,timestamptz,jsonb) to service_role;

-- has_entitlement — تحقق من الملكية + انتهاء الصلاحية
-- يسمح لـ authenticated بفحص نفسه فقط، و service_role لأي مستخدم
create or replace function public.has_entitlement(
  p_user_id uuid,
  p_kind text,
  p_value text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce((auth.jwt() ->> 'role'), '');
begin
  if p_user_id is null or p_kind is null or p_value is null then
    return false;
  end if;
  if v_uid is null then
    raise exception 'has_entitlement: not authenticated';
  end if;
  if v_uid <> p_user_id and v_role <> 'service_role' then
    raise exception 'has_entitlement: forbidden — can only check own entitlements';
  end if;

  return exists(
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.kind = btrim(p_kind)
      and e.value = btrim(p_value)
      and (e.expires_at is null or e.expires_at > now())
  );
end;
$$;

revoke all on function public.has_entitlement(uuid,text,text) from public;
grant execute on function public.has_entitlement(uuid,text,text) to authenticated;
grant execute on function public.has_entitlement(uuid,text,text) to service_role;

-- ----------------------------------------------------------------------------
-- 2) AI Credit Ledger — سجل أرصدة AI (مثل coin_ledger، لا عمود balance)
-- ----------------------------------------------------------------------------
create table if not exists public.ai_credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  delta       int not null check (delta <> 0),
  reason      text not null check (btrim(reason) <> ''),
  ref_id      text null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists ai_credit_ledger_user_created_idx
  on public.ai_credit_ledger (user_id, created_at desc);
create index if not exists ai_credit_ledger_user_reason_ref_idx
  on public.ai_credit_ledger (user_id, reason, ref_id);

-- idempotency: نفس (user, reason, ref_id) لا يتكرر إذا كان ref_id موجوداً
create unique index if not exists ai_credit_ledger_user_reason_ref_unique
  on public.ai_credit_ledger (user_id, reason, ref_id) where ref_id is not null;

alter table public.ai_credit_ledger enable row level security;

drop policy if exists "ai_credit_ledger: owner reads" on public.ai_credit_ledger;
create policy "ai_credit_ledger: owner reads"
  on public.ai_credit_ledger for select using (auth.uid() = user_id);

drop policy if exists "ai_credit_ledger: owner writes" on public.ai_credit_ledger;
drop policy if exists "ai_credit_ledger: owner updates" on public.ai_credit_ledger;
drop policy if exists "ai_credit_ledger: owner deletes" on public.ai_credit_ledger;
drop policy if exists "users manage their own ai credits" on public.ai_credit_ledger;

-- ----------------------------------------------------------------------------
-- 2B) RPCs — AI Credits
-- ----------------------------------------------------------------------------
-- ai_credit_balance — مجموع الـ ledger لصاحبه فقط
create or replace function public.ai_credit_balance(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce((auth.jwt() ->> 'role'), '');
  v_sum int;
begin
  if p_user_id is null then
    raise exception 'ai_credit_balance: p_user_id required';
  end if;
  if v_uid is null then
    raise exception 'ai_credit_balance: not authenticated';
  end if;
  if v_uid <> p_user_id and v_role <> 'service_role' then
    raise exception 'ai_credit_balance: forbidden — can only check own balance';
  end if;
  select coalesce(sum(delta),0)::int into v_sum from public.ai_credit_ledger where user_id = p_user_id;
  return v_sum;
end;
$$;

-- overload بدون بارامتر — للراحة (يستخدم auth.uid())
create or replace function public.ai_credit_balance()
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_sum int;
begin
  if v_uid is null then
    raise exception 'ai_credit_balance: not authenticated';
  end if;
  select coalesce(sum(delta),0)::int into v_sum from public.ai_credit_ledger where user_id = v_uid;
  return v_sum;
end;
$$;

revoke all on function public.ai_credit_balance(uuid) from public;
grant execute on function public.ai_credit_balance(uuid) to authenticated;
grant execute on function public.ai_credit_balance(uuid) to service_role;
revoke all on function public.ai_credit_balance() from public;
grant execute on function public.ai_credit_balance() to authenticated;
grant execute on function public.ai_credit_balance() to service_role;

-- grant_ai_credits — server-side فقط، idempotent عبر ref_id
create or replace function public.grant_ai_credits(
  p_user_id uuid,
  p_delta int,
  p_reason text,
  p_ref_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (entry_id uuid, already_existed boolean, new_balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing uuid;
  v_new_id uuid;
  v_balance int;
begin
  if p_user_id is null then
    raise exception 'grant_ai_credits: p_user_id required';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'grant_ai_credits: p_delta required and non-zero';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'grant_ai_credits: p_reason required';
  end if;
  if coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'grant_ai_credits: forbidden — service_role only';
  end if;

  -- idempotency عبر ref_id
  if p_ref_id is not null then
    select id into v_existing
    from public.ai_credit_ledger
    where user_id = p_user_id and reason = btrim(p_reason) and ref_id = p_ref_id
    limit 1;
    if v_existing is not null then
      select coalesce(sum(delta),0)::int into v_balance from public.ai_credit_ledger where user_id = p_user_id;
      return query select v_existing, true::boolean, v_balance;
      return;
    end if;
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, p_delta, btrim(p_reason), p_ref_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_new_id;

  select coalesce(sum(delta),0)::int into v_balance from public.ai_credit_ledger where user_id = p_user_id;
  return query select v_new_id, false::boolean, v_balance;
end;
$$;

revoke all on function public.grant_ai_credits(uuid,int,text,text,jsonb) from public;
revoke all on function public.grant_ai_credits(uuid,int,text,text,jsonb) from authenticated;
revoke all on function public.grant_ai_credits(uuid,int,text,text,jsonb) from anon;
grant execute on function public.grant_ai_credits(uuid,int,text,text,jsonb) to service_role;

-- consume_ai_credits — خصم (delta سالب)، يتحقق من الرصيد اختيارياً لكن لا يفرض pricing
create or replace function public.consume_ai_credits(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (entry_id uuid, already_existed boolean, new_balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing uuid;
  v_new_id uuid;
  v_balance int;
begin
  if p_user_id is null then
    raise exception 'consume_ai_credits: p_user_id required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'consume_ai_credits: p_amount must be > 0';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'consume_ai_credits: p_reason required';
  end if;
  if coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'consume_ai_credits: forbidden — service_role only';
  end if;

  if p_ref_id is not null then
    select id into v_existing
    from public.ai_credit_ledger
    where user_id = p_user_id and reason = btrim(p_reason) and ref_id = p_ref_id
    limit 1;
    if v_existing is not null then
      select coalesce(sum(delta),0)::int into v_balance from public.ai_credit_ledger where user_id = p_user_id;
      return query select v_existing, true::boolean, v_balance;
      return;
    end if;
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, ref_id, metadata)
  values (p_user_id, -p_amount, btrim(p_reason), p_ref_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_new_id;

  select coalesce(sum(delta),0)::int into v_balance from public.ai_credit_ledger where user_id = p_user_id;
  return query select v_new_id, false::boolean, v_balance;
end;
$$;

revoke all on function public.consume_ai_credits(uuid,int,text,text,jsonb) from public;
revoke all on function public.consume_ai_credits(uuid,int,text,text,jsonb) from authenticated;
revoke all on function public.consume_ai_credits(uuid,int,text,text,jsonb) from anon;
grant execute on function public.consume_ai_credits(uuid,int,text,text,jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 3) ملاحظات Phase D
-- ----------------------------------------------------------------------------
-- - لا تغيير في coin_ledger / coin_wallets / coin_source_rules / shop_* / profiles.xp
-- - لا منتجات Useful مفعلة، لا كتالوج rows، لا أسعار، لا UI
-- - AI Router غير متصل بـ ai_credit_ledger / entitlements — يبقى كما هو
-- - كل منح Entitlement/Credits عبر service_role فقط — الكلاينت يقرأ فقط
-- - الرصيد = SUM(delta) مثل coin_ledger، لا عمود balance
-- - idempotency عبر ref_id (partial unique) و (user,kind,value) للصلاحيات الدائمة
