-- ===========================================================================
-- MAGICLY — Public Profiles & User Discovery
-- Phase 1: Messaging Foundation
-- ===========================================================================
-- Public profiles: user-visible info for discovery, NOT for login/identity.
-- Key: Public Profile ID is random, NOT auth.uid.
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- 1. public_profiles table
-- ----------------------------------------------------------------------------
create table if not exists public.public_profiles (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique, -- public discovery ID (NOT auth.uid)
  user_id           uuid not null unique, -- links to auth.users
  display_name      text not null,        -- public display name
  avatar_url        text,                 -- optional public avatar
  university        text,                 -- university name
  faculty           text,                 -- college/faculty
  specialization    text,                 -- field of study
  year              integer,              -- year of study
  interests         text[],               -- shared interests
  bio               text,                 -- short bio
  is_visible        boolean not null default true, -- discoverable
  is_blocked_by     uuid,                 -- user who blocked this profile
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Indexes
create index if not exists idx_public_profiles_visible
  on public.public_profiles (is_visible, created_at desc);

create index if not exists idx_public_profiles_university
  on public.public_profiles (university, is_visible);

create index if not exists idx_public_profiles_faculty
  on public.public_profiles (faculty, is_visible);

create index if not exists idx_public_profiles_specialization
  on public.public_profiles (specialization, is_visible);

create index if not exists idx_public_profiles_interests
  on public.public_profiles using gin (interests);

create index if not exists idx_public_profiles_user_id
  on public.public_profiles (user_id);

-- Unique constraint: one profile per user
alter table public.public_profiles add constraint uq_public_profiles_user
  unique (user_id);

-- ----------------------------------------------------------------------------
-- 2. RLS Policies for public_profiles
-- ----------------------------------------------------------------------------

alter table public.public_profiles enable row level security;

-- Users can insert their own profile
create policy "public_profiles: insert own"
  on public.public_profiles for insert
  with check (user_id = auth.uid());

-- Users can update their own profile
create policy "public_profiles: update own"
  on public.public_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can read public profiles they want to discover
create policy "public_profiles: read public"
  on public.public_profiles for select
  using (is_visible = true);

-- Staff-only admin access to read all profiles (for moderation)
create policy "public_profiles: admin read"
  on public.public_profiles for select
  using (
    exists (
      select 1 from public.admin_roles
      where user_id = auth.uid()
      and role in ('safety_moderator', 'authorized_admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Public Profile ID — random UUID, NOT auth.uid
-- ----------------------------------------------------------------------------
create or replace function public.generate_public_profile_id()
returns uuid as $$
begin
  return gen_random_uuid();
end;
$$ language plpgsql stable;

-- ----------------------------------------------------------------------------
-- 4. Search API — filtered by university, faculty, specialization, interests
-- ----------------------------------------------------------------------------
create or replace function public.search_public_profiles(
  p_query text default '',
  p_university text default null,
  p_faculty text default null,
  p_specialization text default null,
  p_interests text[] default null
)
returns table (
  profile_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  university text,
  faculty text,
  specialization text,
  year int,
  interests text[],
  bio text,
  is_visible boolean,
  match_score int
)
language plpgsql stable
as $$
begin
  return query
  select
    pp.id as profile_id,
    pp.user_id,
    pp.display_name,
    pp.avatar_url,
    pp.university,
    pp.faculty,
    pp.specialization,
    pp.year,
    pp.interests,
    pp.bio,
    pp.is_visible,
    -- Simple text match score
    case
      when p_query = '' then 1
      when pp.display_name ILIKE '%' || p_query || '%' then 2
      when pp.bio ILIKE '%' || p_query || '%' then 2
      when pp.university ILIKE '%' || p_query || '%' then 1
      when pp.faculty ILIKE '%' || p_query || '%' then 1
      when pp.specialization ILIKE '%' || p_query || '%' then 1
      else 0
    end as match_score
  from public.public_profiles pp
  where pp.is_visible = true
    and pp.user_id != auth.uid() -- don't show self
    and (
      p_university is null or pp.university = p_university
    )
    and (
      p_faculty is null or pp.faculty = p_faculty
    )
    and (
      p_specialization is null or pp.specialization = p_specialization
    )
    and (
      p_interests is null or pp.interests && p_interests
    )
    and (
      p_query = '' or
      pp.display_name ILIKE '%' || p_query || '%' or
      pp.bio ILIKE '%' || p_query || '%' or
      pp.university ILIKE '%' || p_query || '%' or
      pp.faculty ILIKE '%' || p_query || '%' or
      pp.specialization ILIKE '%' || p_query || '%'
    );
end;
$$;
