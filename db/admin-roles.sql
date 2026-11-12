-- Admin Roles — site_admins table for Owner/Admin hub
-- Run once in Supabase SQL Editor (idempotent)

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','owner')),
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id)
);

alter table public.site_admins enable row level security;

-- ⚠️ أمان (2026-11): كانت `using (true)` — أي زائر يعرف user_id لكل أدمن/مالك
-- (يمكّن انتحال الهوية). دلوقتي: صاحب الصف أو أي أدمن حالي فقط.
create or replace function public.is_site_admin()
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select exists (
    select 1 from public.site_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

drop policy if exists "site_admins: owner reads" on public.site_admins;
drop policy if exists "site_admins: admins read" on public.site_admins;
create policy "site_admins: admins read"
  on public.site_admins for select
  using (auth.uid() = user_id or public.is_site_admin());

-- writes are service_role only (via admin API routes using service key)
drop policy if exists "site_admins: no client writes" on public.site_admins;
create policy "site_admins: no client writes"
  on public.site_admins for insert with check (false);
drop policy if exists "site_admins: no client updates" on public.site_admins;
create policy "site_admins: no client updates"
  on public.site_admins for update using (false);
drop policy if exists "site_admins: no client deletes" on public.site_admins;
create policy "site_admins: no client deletes"
  on public.site_admins for delete using (false);

create index if not exists site_admins_role_idx on public.site_admins(role);
