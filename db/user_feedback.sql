-- user_feedback — تقييمات المستخدمين (5 نجوم + اقتراحات)
-- اتنفذ كـ migration على Project1 وده النسخة المرجعية في الريبو.
-- يُستخدم مع ودجت التقييم في الداشبورد: 1-2 نجمة → حقل اقتراح إجباري.

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page text not null,
  feature_label text,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;

-- المستخدم يضيف تقييمه هو بس
create policy "user_feedback: insert own"
  on public.user_feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- الأدمنز يقرأوا كل التقييمات (نفس نمط باقي الجداول)
create policy "user_feedback: admins read"
  on public.user_feedback for select
  to authenticated
  using (exists (
    select 1 from public.site_admins
    where site_admins.user_id = auth.uid()
  ));

create index if not exists user_feedback_created_at_idx
  on public.user_feedback (created_at desc);
