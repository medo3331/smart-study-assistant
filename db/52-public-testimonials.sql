-- Public testimonials submitted by visitors and published only after moderation.
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null default 'طالب ماجيكلي',
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 8 and 700),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index if not exists testimonials_public_created_idx
  on public.testimonials (created_at desc)
  where is_published = true;

alter table public.testimonials enable row level security;

-- Public visitors can read only approved reviews. Submissions and moderation
-- use the server-side service client and are never exposed through public RLS.
drop policy if exists "testimonials: public reads published" on public.testimonials;

create policy "testimonials: public reads published"
  on public.testimonials for select
  to anon, authenticated
  using (is_published = true);

grant select on public.testimonials to anon, authenticated;
