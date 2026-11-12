-- Manual payments ledger
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  method text,
  note text,
  payer_name text,
  paid_at timestamptz not null default now(),
  recorded_by uuid,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;

-- ⚠️ أمان (2026-11): كانت `using (true)` للقراءة و`with check (true)` للكتابة —
-- أي زائر يقرأ/يكتب سجل الدفعات. دلوقتي: القراءة لصاحب الدفعة فقط، والكتابة
-- من الكلاينت ممنوعة (service_role فقط عبر لوحة الأدمن).
drop policy if exists payments_admin_read on public.payments;
drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read on public.payments for select using (auth.uid() = user_id);

drop policy if exists payments_admin_write on public.payments;
drop policy if exists payments_no_client_write on public.payments;
create policy payments_no_client_write on public.payments for insert with check (false);
