-- ============================================================================
-- MAGICLY - Community C3: Groups / Academic Communities
-- ============================================================================
-- Tables:
--   community_groups         - slug, name, kind(general/university/faculty/major/
--                              batch/study), privacy(public/private), academic
--                              fields, soft delete
--   community_group_members  - role(owner/moderator/member), status(approved/pending)
--
-- All access via security definer RPCs (tables are RLS-locked, no policies).
-- Group posts: community_posts.group_id, visible to members (private groups)
-- or to all logged-in users (public groups). Main feed excludes group posts.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tables
-- ----------------------------------------------------------------------------
create table if not exists public.community_groups (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null check (length(btrim(name)) between 2 and 80),
  description text check (length(coalesce(description, '')) <= 500),
  kind        text not null default 'general'
              check (kind in ('general','university','faculty','major','batch','study')),
  privacy     text not null default 'public' check (privacy in ('public','private')),
  university  text,
  faculty     text,
  major       text,
  year        text,
  avatar_url  text,
  cover_url   text,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.community_group_members (
  group_id  uuid not null references public.community_groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','moderator','member')),
  status    text not null default 'approved' check (status in ('approved','pending')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists idx_group_members_user on public.community_group_members (user_id);
create index if not exists idx_groups_kind on public.community_groups (kind) where deleted_at is null;

do $$
begin
  execute 'alter table public.community_groups enable row level security';
  execute 'alter table public.community_group_members enable row level security';
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) community_posts.group_id
-- ----------------------------------------------------------------------------
alter table public.community_posts
  add column if not exists group_id uuid
  references public.community_groups (id) on delete cascade;

create index if not exists idx_posts_group on public.community_posts (group_id) where group_id is not null;

-- ----------------------------------------------------------------------------
-- 3) Helpers
-- ----------------------------------------------------------------------------
create or replace function public.group_my_membership(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_build_object(
      'status', m.status,
      'role', m.role,
      'is_member', m.status = 'approved',
      'is_moderator', m.status = 'approved' and m.role in ('owner','moderator')
    ),
    jsonb_build_object('status', 'none', 'role', null, 'is_member', false, 'is_moderator', false)
  )
  from public.community_group_members m
  where m.group_id = p_group_id and m.user_id = auth.uid();
$$;

create or replace function public.group_is_moderator(p_group_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = p_user
      and status = 'approved' and role in ('owner','moderator')
  );
$$;

-- ----------------------------------------------------------------------------
-- 4) Create / delete group
-- ----------------------------------------------------------------------------
create or replace function public.create_community_group(
  p_name        text,
  p_description text default null,
  p_kind        text default 'general',
  p_privacy     text default 'public',
  p_university  text default null,
  p_faculty     text default null,
  p_major       text default null,
  p_year        text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_group  uuid;
  v_base   text;
  v_slug   text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_name is null or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 80 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;
  if p_kind not in ('general','university','faculty','major','batch','study') then
    return jsonb_build_object('ok', false, 'code', 'invalid_kind');
  end if;
  if p_privacy not in ('public','private') then
    return jsonb_build_object('ok', false, 'code', 'invalid_privacy');
  end if;
  -- Rate limit: 5 groups per hour per user
  if (select count(*) from public.community_groups
      where created_by = v_me and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  v_base := btrim(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'), '-');
  if v_base is null or length(v_base) = 0 then
    v_base := 'group';
  end if;
  v_base := left(v_base, 40);
  v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  insert into public.community_groups
    (slug, name, description, kind, privacy, university, faculty, major, year, created_by)
  values
    (v_slug, btrim(p_name), p_description, p_kind, p_privacy, p_university, p_faculty, p_major, p_year, v_me)
  returning id into v_group;

  insert into public.community_group_members (group_id, user_id, role, status)
  values (v_group, v_me, 'owner', 'approved');

  return jsonb_build_object('ok', true, 'group_id', v_group, 'slug', v_slug);
end;
$$;

create or replace function public.delete_community_group(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if not exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = auth.uid()
      and role = 'owner' and status = 'approved'
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  update public.community_groups set deleted_at = now() where id = p_group_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Membership: join / leave / cancel / approve / remove / role
-- ----------------------------------------------------------------------------
create or replace function public.join_community_group(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_group public.community_groups;
  v_notify uuid[];
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  select * into v_group from public.community_groups
  where id = p_group_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = v_me
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_requested');
  end if;

  if v_group.privacy = 'public' then
    insert into public.community_group_members (group_id, user_id, role, status)
    values (p_group_id, v_me, 'member', 'approved');
    return jsonb_build_object('ok', true, 'status', 'approved');
  end if;

  -- Private group: pending request; rate limit 10 requests/hour
  if (select count(*) from public.community_group_members m
      join public.community_groups g on g.id = m.group_id
      where m.user_id = v_me and m.status = 'pending'
        and m.joined_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  insert into public.community_group_members (group_id, user_id, role, status)
  values (p_group_id, v_me, 'member', 'pending');

  select coalesce(array_agg(distinct m.user_id), '{}') into v_notify
  from public.community_group_members m
  where m.group_id = p_group_id and m.status = 'approved' and m.role in ('owner','moderator');

  return jsonb_build_object('ok', true, 'status', 'pending', 'notify_user_ids', v_notify);
end;
$$;

create or replace function public.leave_community_group(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  select role into v_role from public.community_group_members
  where group_id = p_group_id and user_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'code', 'owner_cannot_leave');
  end if;
  delete from public.community_group_members
  where group_id = p_group_id and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cancel_group_request(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  delete from public.community_group_members
  where group_id = p_group_id and user_id = auth.uid() and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.approve_group_member(
  p_group_id uuid,
  p_user_id  uuid,
  p_approve  boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if not public.group_is_moderator(p_group_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  if p_approve then
    update public.community_group_members set status = 'approved'
    where group_id = p_group_id and user_id = p_user_id and status = 'pending';
  else
    delete from public.community_group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'pending';
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'approved', p_approve);
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_target_role text;
  v_my_role     text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if not public.group_is_moderator(p_group_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  select role, (select role from public.community_group_members
                where group_id = p_group_id and user_id = auth.uid())
    into v_target_role, v_my_role
  from public.community_group_members
  where group_id = p_group_id and user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_target_role = 'owner' then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  if v_target_role = 'moderator' and v_my_role <> 'owner' then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  delete from public.community_group_members
  where group_id = p_group_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_group_member_role(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_role not in ('moderator','member') then
    return jsonb_build_object('ok', false, 'code', 'invalid_role');
  end if;
  if not exists (
    select 1 from public.community_group_members
    where group_id = p_group_id and user_id = auth.uid()
      and role = 'owner' and status = 'approved'
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  select role into v_target_role from public.community_group_members
  where group_id = p_group_id and user_id = p_user_id;
  if not found or v_target_role = 'owner' then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  update public.community_group_members set role = p_role
  where group_id = p_group_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Read RPCs
-- ----------------------------------------------------------------------------
create or replace function public.get_community_groups(
  p_kind  text default null,
  p_query text default null,
  p_limit int default 30
)
returns table (
  group_id uuid, slug text, name text, description text,
  kind text, privacy text, university text, faculty text, major text, year text,
  member_count bigint, my_status text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id, g.slug, g.name, g.description, g.kind, g.privacy,
    g.university, g.faculty, g.major, g.year,
    (select count(*) from public.community_group_members m
      where m.group_id = g.id and m.status = 'approved'),
    coalesce(m.status, 'none'),
    g.created_at
  from public.community_groups g
  left join public.community_group_members m
    on m.group_id = g.id and m.user_id = auth.uid()
  where g.deleted_at is null
    and (g.privacy = 'public' or m.status = 'approved')
    and (p_kind is null or g.kind = p_kind)
    and (p_query is null or p_query = ''
         or g.name ilike '%' || p_query || '%'
         or g.description ilike '%' || p_query || '%')
  order by (select count(*) from public.community_group_members mm
             where mm.group_id = g.id and mm.status = 'approved') desc,
           g.created_at desc
  limit least(coalesce(p_limit, 30), 60);
$$;

create or replace function public.get_my_community_groups()
returns table (
  group_id uuid, slug text, name text, kind text, privacy text,
  member_count bigint, my_role text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id, g.slug, g.name, g.kind, g.privacy,
    (select count(*) from public.community_group_members mm
      where mm.group_id = g.id and mm.status = 'approved'),
    m.role,
    g.created_at
  from public.community_group_members m
  join public.community_groups g on g.id = m.group_id and g.deleted_at is null
  where m.user_id = auth.uid() and m.status = 'approved'
  order by g.created_at desc;
$$;

create or replace function public.get_group_details(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_group public.community_groups;
  v_member jsonb;
  v_is_member boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('found', false);
  end if;
  select * into v_group from public.community_groups
  where id = p_group_id and deleted_at is null;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  v_member := public.group_my_membership(p_group_id);
  v_is_member := (v_member ->> 'is_member')::boolean;
  if v_group.privacy = 'private' and not v_is_member then
    -- Private group, non-member: identity only
    return jsonb_build_object(
      'found', true,
      'limited', true,
      'group_id', v_group.id,
      'slug', v_group.slug,
      'name', v_group.name,
      'description', v_group.description,
      'kind', v_group.kind,
      'privacy', v_group.privacy,
      'member_count', (select count(*) from public.community_group_members m
                        where m.group_id = v_group.id and m.status = 'approved'),
      'my_membership', v_member
    );
  end if;

  return jsonb_build_object(
    'found', true,
    'limited', false,
    'group_id', v_group.id,
    'slug', v_group.slug,
    'name', v_group.name,
    'description', v_group.description,
    'kind', v_group.kind,
    'privacy', v_group.privacy,
    'university', v_group.university,
    'faculty', v_group.faculty,
    'major', v_group.major,
    'year', v_group.year,
    'created_by', v_group.created_by,
    'member_count', (select count(*) from public.community_group_members m
                      where m.group_id = v_group.id and m.status = 'approved'),
    'my_membership', v_member
  );
end;
$$;

create or replace function public.get_group_members(
  p_group_id uuid,
  p_limit int default 50
)
returns table (
  user_id uuid, display_name text, public_user_code text, avatar_url text,
  role text, joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    coalesce(sp.display_name, pr.display_name),
    pr.public_user_code,
    coalesce(sp.avatar_url, pr.avatar_url),
    m.role,
    m.joined_at
  from public.community_group_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.social_profiles sp on sp.user_id = m.user_id
  where m.group_id = p_group_id and m.status = 'approved'
    and (
      exists (select 1 from public.community_groups g
              where g.id = p_group_id and g.privacy = 'public')
      or exists (select 1 from public.community_group_members mm
                 where mm.group_id = p_group_id and mm.user_id = auth.uid()
                   and mm.status = 'approved')
    )
  order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end,
           m.joined_at asc
  limit least(coalesce(p_limit, 50), 200);
$$;

create or replace function public.get_group_join_requests(p_group_id uuid)
returns table (
  user_id uuid, display_name text, public_user_code text, avatar_url text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    coalesce(sp.display_name, pr.display_name),
    pr.public_user_code,
    coalesce(sp.avatar_url, pr.avatar_url),
    m.joined_at
  from public.community_group_members m
  join public.profiles pr on pr.id = m.user_id
  left join public.social_profiles sp on sp.user_id = m.user_id
  where m.group_id = p_group_id and m.status = 'pending'
    and public.group_is_moderator(p_group_id, auth.uid())
  order by m.joined_at asc
  limit 100;
$$;

-- ----------------------------------------------------------------------------
-- 7) Group feed + create_community_post with p_group_id
-- ----------------------------------------------------------------------------
drop function if exists public.get_group_feed(uuid, timestamptz, int);
create or replace function public.get_group_feed(
  p_group_id uuid,
  p_before   timestamptz default null,
  p_limit    int default 20
)
returns table (
  post_id uuid, kind text, body text, visibility text, image_url text,
  created_at timestamptz,
  author_id uuid, author_name text, author_code text, author_avatar text,
  like_count bigint, comment_count bigint,
  liked_by_me boolean, saved_by_me boolean,
  repost_of_post_id uuid, quote_post_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid)
  select
    p.id, p.kind, p.body, p.visibility, p.image_url, p.created_at,
    p.author_id,
    coalesce(sp.display_name, pr.display_name),
    pr.public_user_code,
    coalesce(sp.avatar_url, pr.avatar_url),
    (select count(*) from public.community_post_likes l where l.post_id = p.id),
    (select count(*) from public.community_comments c
      where c.post_id = p.id and c.deleted_at is null),
    exists (select 1 from public.community_post_likes l
            where l.post_id = p.id and l.user_id = me.uid),
    exists (select 1 from public.community_saved_posts s
            where s.post_id = p.id and s.user_id = me.uid),
    p.repost_of_post_id,
    p.quote_post_id
  from public.community_posts p
  join public.profiles pr on pr.id = p.author_id
  left join public.social_profiles sp on sp.user_id = p.author_id
  cross join me
  where p.deleted_at is null
    and p.group_id = p_group_id
    and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
    and (
      p.author_id = me.uid
      or (
        exists (select 1 from public.community_groups g
                where g.id = p_group_id and g.privacy = 'public')
        and not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = p.author_id and b.blocked_id = me.uid)
             or (b.blocker_id = me.uid and b.blocked_id = p.author_id)
        )
      )
      or (
        exists (
          select 1 from public.community_group_members m
          where m.group_id = p_group_id and m.user_id = me.uid and m.status = 'approved'
        )
        and not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = p.author_id and b.blocked_id = me.uid)
             or (b.blocker_id = me.uid and b.blocked_id = p.author_id)
        )
      )
    )
  order by p.created_at desc
  limit least(coalesce(p_limit, 20), 30);
$$;

drop function if exists public.create_community_post(text, text, text, text, text[], uuid);
create or replace function public.create_community_post(
  p_kind          text default 'text',
  p_body          text default null,
  p_visibility    text default 'public',
  p_image_url     text default null,
  p_options       text[] default null,
  p_quote_post_id uuid default null,
  p_group_id      uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_post    uuid;
  v_tag     text;
  v_code    text;
  v_mentioned uuid;
  v_mentions jsonb := '[]'::jsonb;
  v_opt     text;
  v_pos     int := 0;
  v_quote   public.community_posts;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  if p_kind not in ('text','achievement','question','tip','summary','challenge','poll') then
    return jsonb_build_object('ok', false, 'code', 'invalid_kind');
  end if;
  if p_visibility not in ('public','friends','private') then
    return jsonb_build_object('ok', false, 'code', 'invalid_visibility');
  end if;
  if p_image_url is not null and p_image_url !~
    '^(https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/community/[A-Za-z0-9._/-]+|/uploads/community/[A-Za-z0-9._/-]+)$'
  then
    return jsonb_build_object('ok', false, 'code', 'invalid_image');
  end if;
  -- Group post: must be an approved member
  if p_group_id is not null and not exists (
    select 1 from public.community_group_members m
    join public.community_groups g on g.id = m.group_id and g.deleted_at is null
    where m.group_id = p_group_id and m.user_id = v_me
      and m.status = 'approved'
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  -- Rate limit: 20 posts per hour per user
  if (select count(*) from public.community_posts
      where author_id = v_me and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  if p_quote_post_id is not null then
    select * into v_quote from public.community_posts
    where id = p_quote_post_id and deleted_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    if not public.social_can_view_post(v_quote.author_id, v_quote.visibility, v_me) then
      return jsonb_build_object('ok', false, 'code', 'not_allowed');
    end if;
  end if;

  if p_kind = 'poll' then
    if p_options is null or array_length(p_options, 1) < 2 or array_length(p_options, 1) > 4 then
      return jsonb_build_object('ok', false, 'code', 'invalid_poll');
    end if;
  end if;

  insert into public.community_posts
    (author_id, kind, body, visibility, image_url, quote_post_id, group_id)
  values (v_me, p_kind, btrim(p_body), p_visibility, p_image_url, p_quote_post_id, p_group_id)
  returning id into v_post;

  if p_kind = 'poll' then
    foreach v_opt in array p_options loop
      v_opt := btrim(coalesce(v_opt, ''));
      continue when v_opt = '' or length(v_opt) > 100;
      v_pos := v_pos + 1;
      insert into public.community_poll_options (post_id, option_text, option_position)
      values (v_post, v_opt, v_pos);
    end loop;
    if v_pos < 2 then
      delete from public.community_posts where id = v_post;
      return jsonb_build_object('ok', false, 'code', 'invalid_poll');
    end if;
  end if;

  for v_tag in
    select distinct m[1] from regexp_matches(p_body, '#([A-Za-z0-9_\u0600-\u06FF]{1,50})', 'g') as m
  loop
    insert into public.community_hashtags (tag) values (v_tag)
    on conflict (tag) do nothing;
    insert into public.community_post_hashtags (post_id, hashtag_id)
    select v_post, h.id from public.community_hashtags h where h.tag = v_tag
    on conflict do nothing;
  end loop;

  for v_code in
    select distinct upper(m[1]) from regexp_matches(p_body, '@(MAG-[A-Za-z0-9]{3}-[A-Za-z0-9]{4})', 'g') as m
  loop
    select id into v_mentioned from public.profiles where upper(public_user_code) = v_code;
    if v_mentioned is not null and v_mentioned <> v_me then
      insert into public.community_mentions (post_id, user_id)
      values (v_post, v_mentioned) on conflict do nothing;
      v_mentions := v_mentions || jsonb_build_array(v_mentioned);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'post_id', v_post, 'mentioned', v_mentions);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8) Main feed excludes group posts (they live in the group page)
-- ----------------------------------------------------------------------------
drop function if exists public.get_community_feed(timestamptz, int);
create or replace function public.get_community_feed(
  p_before timestamptz default null,
  p_limit  int default 20
)
returns table (
  post_id uuid, kind text, body text, visibility text, image_url text,
  created_at timestamptz,
  author_id uuid, author_name text, author_code text, author_avatar text,
  like_count bigint, comment_count bigint,
  liked_by_me boolean, saved_by_me boolean,
  repost_of_post_id uuid, quote_post_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid)
  select
    p.id, p.kind, p.body, p.visibility, p.image_url, p.created_at,
    p.author_id,
    coalesce(sp.display_name, pr.display_name),
    pr.public_user_code,
    coalesce(sp.avatar_url, pr.avatar_url),
    (select count(*) from public.community_post_likes l where l.post_id = p.id),
    (select count(*) from public.community_comments c
      where c.post_id = p.id and c.deleted_at is null),
    exists (select 1 from public.community_post_likes l
            where l.post_id = p.id and l.user_id = me.uid),
    exists (select 1 from public.community_saved_posts s
            where s.post_id = p.id and s.user_id = me.uid),
    p.repost_of_post_id,
    p.quote_post_id
  from public.community_posts p
  join public.profiles pr on pr.id = p.author_id
  left join public.social_profiles sp on sp.user_id = p.author_id
  cross join me
  where p.deleted_at is null
    and p.group_id is null
    and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
    and (
      p.author_id = me.uid
      or (
        p.visibility = 'public'
        and not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = p.author_id and b.blocked_id = me.uid)
             or (b.blocker_id = me.uid and b.blocked_id = p.author_id)
        )
      )
      or (
        p.visibility = 'friends'
        and public.social_are_friends(p.author_id, me.uid)
      )
    )
  order by p.created_at desc
  limit least(coalesce(p_limit, 20), 30);
$$;

-- ----------------------------------------------------------------------------
-- 9) Grants
-- ----------------------------------------------------------------------------
revoke all on function public.create_community_group(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_community_group(text, text, text, text, text, text, text, text) to authenticated;
revoke all on function public.delete_community_group(uuid) from public;
grant execute on function public.delete_community_group(uuid) to authenticated;
revoke all on function public.join_community_group(uuid) from public;
grant execute on function public.join_community_group(uuid) to authenticated;
revoke all on function public.leave_community_group(uuid) from public;
grant execute on function public.leave_community_group(uuid) to authenticated;
revoke all on function public.cancel_group_request(uuid) from public;
grant execute on function public.cancel_group_request(uuid) to authenticated;
revoke all on function public.approve_group_member(uuid, uuid, boolean) from public;
grant execute on function public.approve_group_member(uuid, uuid, boolean) to authenticated;
revoke all on function public.remove_group_member(uuid, uuid) from public;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
revoke all on function public.set_group_member_role(uuid, uuid, text) from public;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;
revoke all on function public.group_my_membership(uuid) from public;
grant execute on function public.group_my_membership(uuid) to authenticated;
revoke all on function public.get_community_groups(text, text, int) from public;
grant execute on function public.get_community_groups(text, text, int) to authenticated;
revoke all on function public.get_my_community_groups() from public;
grant execute on function public.get_my_community_groups() to authenticated;
revoke all on function public.get_group_details(uuid) from public;
grant execute on function public.get_group_details(uuid) to authenticated;
revoke all on function public.get_group_members(uuid, int) from public;
grant execute on function public.get_group_members(uuid, int) to authenticated;
revoke all on function public.get_group_join_requests(uuid) from public;
grant execute on function public.get_group_join_requests(uuid) to authenticated;
revoke all on function public.get_group_feed(uuid, timestamptz, int) from public;
grant execute on function public.get_group_feed(uuid, timestamptz, int) to authenticated;
revoke all on function public.create_community_post(text, text, text, text, text[], uuid, uuid) from public;
grant execute on function public.create_community_post(text, text, text, text, text[], uuid, uuid) to authenticated;
revoke all on function public.get_community_feed(timestamptz, int) from public;
grant execute on function public.get_community_feed(timestamptz, int) to authenticated;
