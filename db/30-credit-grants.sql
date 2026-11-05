-- ═════════════════════════════════════════════════════════════
-- 30-credit-grants.sql
-- Phase B2.1 — منح الكريدت مع انتهاء صلاحية + استهلاك FEFO
-- ═════════════════════════════════════════════════════════════
-- جدول مستقل عن `ai_credit_ledger`:
--   • `ai_credit_ledger` = حركة رصيد (reserve/refund/grant) — سجل أحداث.
--   • `credit_grants`    = **التزامات** (كم كريدت متبقٍّ ومتى ينتهي) — رصيد قابل للاستهلاك.
-- الفصل ضروري لأن الرصيد في الـ ledger تراكمي بلا انتهاء، وهذا ما نريد علاجه.
--
-- ⚠️ تنظيفان مقصودان عن النص الأصلي:
--   ١) حُذف الفهرس `idx_credit_grants_grant_ref` — قيد `UNIQUE` على
--      `grant_ref` ينشئ فهرسه تلقائيًا، فالثاني تكرار صافٍ.
--   ٢) حُذف قيد `credit_grants_consumed_lte_amount` المسمّى — الشرط نفسه
--      موجود داخل `CHECK (consumed >= 0 AND consumed <= amount)`.
--
-- idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS.
-- additive: جدول جديد فقط — لا يمس أي جدول قائم.
-- ═════════════════════════════════════════════════════════════

begin;

create table if not exists public.credit_grants (
  id          uuid primary key default gen_random_uuid(),

  user_id     uuid not null references auth.users(id) on delete cascade,

  -- الكمية الممنوحة. > 0 حتى لا تُنشأ منح فارغة.
  amount      int not null check (amount > 0),

  -- المُستهلك — العمود الوحيد القابل للتغيير بعد الإنشاء.
  consumed    int not null default 0 check (consumed >= 0 and consumed <= amount),

  -- المتبقي مشتق (STORED) فلا يمكن أن يتعارض مع amount/consumed.
  remaining   int generated always as (amount - consumed) stored,

  source      text not null check (source in ('monthly', 'manual', 'trial', 'bonus', 'refund')),

  -- مفتاح المنح الفريد: 'monthly:<user>:<YYYY-MM>' / 'manual:<uuid>' / ...
  grant_ref   text not null unique,

  -- كل منحة تنتهي: لا التزامات أبدية.
  expires_at  timestamptz not null,

  notes       text,
  created_at  timestamptz not null default now()
);

-- FEFO: الأقرب انتهاءً أولًا، للمنح غير المستنفدة فقط.
create index if not exists idx_credit_grants_user_active
  on public.credit_grants (user_id, expires_at asc)
  where remaining > 0;

-- مسح الانتهاء الدوري (cron): المنح غير المستنفدة فقط.
create index if not exists idx_credit_grants_expiry
  on public.credit_grants (expires_at)
  where remaining > 0;

-- ⚠️ RLS + FORCE: المالك يقرأ فقط. لا سياسة INSERT/UPDATE/DELETE
-- لأي دور عميل ⇒ الكتابة عبر service_role (السيرفر) أو دوال
-- SECURITY DEFINER فقط. (postgres يحمل BYPASSRLS، فالدوال التعريفية تعمل.)
alter table public.credit_grants enable row level security;
alter table public.credit_grants force row level security;

drop policy if exists credit_grants_owner_select on public.credit_grants;
create policy credit_grants_owner_select
  on public.credit_grants
  for select to authenticated
  using (user_id = auth.uid());

comment on table public.credit_grants is
  'Phase B2 — منح كريدت بصلاحية وانتهاء. FEFO عبر (user_id, expires_at) حيث remaining > 0. الكتابة سيرفر-سايد فقط.';
comment on column public.credit_grants.remaining is
  'عمود مشتق (amount - consumed) — لا يُكتب يدويًا.';
comment on column public.credit_grants.grant_ref is
  'مفتاح منع التكرار: monthly:<user>:<YYYY-MM> / manual:<uuid> / ...';

commit;

-- ═════════════════════════════════════════════════════════════
-- تحقق بعد التطبيق (SELECT فقط):
--   select to_regclass('public.credit_grants');
--   select column_name, data_type, is_generated
--     from information_schema.columns
--    where table_schema='public' and table_name='credit_grants'
--    order by ordinal_position;
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='credit_grants' order by 1;
--   select relrowsecurity, relforcerowsecurity from pg_class
--    where oid='public.credit_grants'::regclass;
-- المتوقع: 4 فهارس (pkey + grant_ref unique + user_active + expiry).
-- ═════════════════════════════════════════════════════════════
