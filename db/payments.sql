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
create policy payments_admin_read on public.payments for select using (true);
create policy payments_admin_write on public.payments for insert with check (true);
