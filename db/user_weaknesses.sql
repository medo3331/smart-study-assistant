-- user_weaknesses.sql
-- إنشاء جدول تتبع نقاط ضعف الطالب الديناميكية
create table if not exists public.user_weaknesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_name text not null,
  error_count integer not null default 0,
  mastery_level numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_weaknesses_user on public.user_weaknesses(user_id);
create index if not exists idx_user_weaknesses_err_mastery on public.user_weaknesses(user_id, error_count desc, mastery_level asc);

alter table public.user_weaknesses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_weaknesses' and policyname='Users can view own weaknesses'
  ) then
    create policy "Users can view own weaknesses"
    on public.user_weaknesses for select
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_weaknesses' and policyname='Service role can manage weaknesses'
  ) then
    create policy "Service role can manage weaknesses"
    on public.user_weaknesses for all
    using (auth.jwt()->>'role' = 'service_role')
    with check (auth.jwt()->>'role' = 'service_role');
  end if;
end $$;
