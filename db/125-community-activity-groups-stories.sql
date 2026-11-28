-- ============================================================================
-- MAGICLY — db/125: نشاط المستخدمين + جروبات المحادثات + الحالات (ستوريز)
-- ============================================================================
--  1) social_profiles: سياسة قراءة عامة للمصادقين (سبب اختفاء الأسماء/الصور
--     في المحادثات) + عمود last_active_at لحالة «نشط الآن/آخر ظهور»
--  2) conversations: أعمدة الجروبات (is_group / group_name / created_by)
--  3) community_stories: جدول الحالات/القصص (تنتهي بعد 24 ساعة) + RLS
--     (قبل الدوال — SQL بيتحقق من جسم الدالة وقت الإنشاء)
--  4) RPCs: touch_last_active (تحديث نشاطي) + active_community_stories
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) social_profiles — قراءة عامة للمصادقين (بيانات اجتماعية عامة بطبعها،
--    وحقول الخصوصية بيتطبقوا في الـRPCs مش هنا)
-- ---------------------------------------------------------------------------
drop policy if exists "social_profiles: authenticated read"
  on public.social_profiles;
create policy "social_profiles: authenticated read"
  on public.social_profiles for select
  to authenticated
  using (true);

alter table public.social_profiles
  add column if not exists last_active_at timestamptz;

create index if not exists idx_social_profiles_last_active
  on public.social_profiles (last_active_at desc);

-- ---------------------------------------------------------------------------
-- 2) conversations — أعمدة الجروبات
--    (لا يوجد قيد NOT NULL على user_a_id/user_b_id — الجروبات تسيبهم NULL)
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists is_group  boolean not null default false,
  add column if not exists group_name text,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3) community_stories
-- ---------------------------------------------------------------------------
create table if not exists public.community_stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  media_url  text not null,
  media_type text not null default 'image' check (media_type in ('image','video')),
  caption    text check (char_length(caption) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists idx_community_stories_active
  on public.community_stories (expires_at);
create index if not exists idx_community_stories_user
  on public.community_stories (user_id, created_at desc);

alter table public.community_stories enable row level security;

drop policy if exists "community_stories: insert own" on public.community_stories;
create policy "community_stories: insert own"
  on public.community_stories for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "community_stories: select active or own" on public.community_stories;
create policy "community_stories: select active or own"
  on public.community_stories for select to authenticated
  using (auth.uid() = user_id or expires_at > now());

drop policy if exists "community_stories: delete own" on public.community_stories;
create policy "community_stories: delete own"
  on public.community_stories for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "community_stories: update own" on public.community_stories;
create policy "community_stories: update own"
  on public.community_stories for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4) RPCs
-- ---------------------------------------------------------------------------

-- تحديث نشاطي (بيستدعى عند فتح صندوق الرسايل)
create or replace function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.social_profiles
     set last_active_at = now(), updated_at = now()
   where user_id = auth.uid();
end;
$$;
revoke all on function public.touch_last_active() from public;
grant execute on function public.touch_last_active() to authenticated;

-- الحالات النشطة (غير منتهية) ببيانات صاحبها — للجميع المصادقين
create or replace function public.active_community_stories()
returns table (
  id           uuid,
  user_id      uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  media_url    text,
  media_type   text,
  caption      text,
  created_at   timestamptz,
  expires_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.user_id,
    sp.display_name, sp.handle, sp.avatar_url,
    s.media_url, s.media_type, s.caption, s.created_at, s.expires_at
  from public.community_stories s
  left join public.social_profiles sp on sp.user_id = s.user_id
  where s.expires_at > now()
  order by s.created_at desc
  limit 200;
$$;
revoke all on function public.active_community_stories() from public;
grant execute on function public.active_community_stories() to authenticated;
