-- ============================================================================
-- MAGICLY — Community C2c: تهيئة الهوية الاجتماعية لكل المستخدمين
-- ============================================================================
--   1. Bootstrap: إنشاء صف social_profiles لكل profile موجود (الأسماء
--      والأفاتار والكلية من profiles) — كان الجدول فاضيًا تمامًا فتظهر
--      قوائم الأصدقاء/الاقتراحات بدون أسماء.
--   2. Trigger: أي مستخدم جديد يحصل تلقائيًا على صف social_profiles.
--   3. إصلاح الأفاتار: دوال القراءة تعيد coalesce(sp.avatar_url, pr.avatar_url)
--      حتى لا يضيع الأفاتار لمن حدّده في حسابه الأساسي فقط.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bootstrap صفوف social_profiles من profiles
-- ----------------------------------------------------------------------------
insert into public.social_profiles (user_id, display_name, avatar_url, faculty)
select pr.id, pr.display_name, pr.avatar_url, pr.faculty_name
from public.profiles pr
where not exists (select 1 from public.social_profiles sp where sp.user_id = pr.id)
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Trigger للمستخدمين الجدد
-- ----------------------------------------------------------------------------
create or replace function public.social_bootstrap_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.social_profiles (user_id, display_name, avatar_url, faculty)
  values (new.id, new.display_name, new.avatar_url, new.faculty_name)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_social_bootstrap_profile on public.profiles;
create trigger trg_social_bootstrap_profile
  after insert on public.profiles
  for each row execute function public.social_bootstrap_profile();

-- ----------------------------------------------------------------------------
-- 3) دوال القراءة: الأفاتار من social_profiles أو profiles
--    (أُعيد إنشاؤها بنفس تعريفات 102 مع coalesce(sp.avatar_url, pr.avatar_url))
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

drop function if exists public.get_user_posts(uuid, timestamptz, int);
create or replace function public.get_user_posts(
  p_user   uuid,
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
    and p.author_id = p_user
    and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
    and (
      me.uid = p_user
      or (
        not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = p_user and b.blocked_id = me.uid)
             or (b.blocker_id = me.uid and b.blocked_id = p_user)
        )
        and (
          p.visibility = 'public'
          or (p.visibility = 'friends' and public.social_are_friends(p_user, me.uid))
        )
      )
    )
  order by p.created_at desc
  limit least(coalesce(p_limit, 20), 30);
$$;

drop function if exists public.get_saved_posts(timestamptz, int);
create or replace function public.get_saved_posts(
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
            where l.post_id = p.id and l.user_id = auth.uid()),
    true,
    p.repost_of_post_id,
    p.quote_post_id
  from public.community_saved_posts s
  join public.community_posts p on p.id = s.post_id and p.deleted_at is null
  join public.profiles pr on pr.id = p.author_id
  left join public.social_profiles sp on sp.user_id = p.author_id
  where s.user_id = auth.uid()
    and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
  order by s.created_at desc
  limit least(coalesce(p_limit, 20), 30);
$$;

drop function if exists public.get_post_details(uuid);
create or replace function public.get_post_details(p_post_id uuid)
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
  where p.id = p_post_id
    and p.deleted_at is null
    and public.social_can_view_post(p.author_id, p.visibility, me.uid);
$$;

drop function if exists public.get_hashtag_posts(text, timestamptz, int);
create or replace function public.get_hashtag_posts(
  p_tag    text,
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
  join public.community_post_hashtags ph on ph.post_id = p.id
  join public.community_hashtags h on h.id = ph.hashtag_id
  cross join me
  where p.deleted_at is null
    and lower(h.tag) = lower(replace(p_tag, '#', ''))
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

create or replace function public.get_xp_leaderboard(p_limit int default 10)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  public_user_code text,
  avatar_url text,
  xp int,
  streak int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid)
  select
    (row_number() over (order by pr.xp desc, pr.id asc))::bigint,
    pr.id,
    coalesce(sp.display_name, pr.display_name),
    pr.public_user_code,
    coalesce(sp.avatar_url, pr.avatar_url),
    pr.xp,
    pr.streak
  from public.profiles pr
  left join public.social_profiles sp on sp.user_id = pr.id
  cross join me
  where me.uid is null or not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = pr.id and b.blocked_id = me.uid)
       or (b.blocker_id = me.uid and b.blocked_id = pr.id)
  )
  order by pr.xp desc, pr.id asc
  limit least(coalesce(p_limit, 10), 50);
$$;

-- إعادة منح الدوال المُعاد إنشاؤها
revoke all on function public.get_community_feed(timestamptz, int) from public;
grant execute on function public.get_community_feed(timestamptz, int) to authenticated;
revoke all on function public.get_user_posts(uuid, timestamptz, int) from public;
grant execute on function public.get_user_posts(uuid, timestamptz, int) to authenticated;
revoke all on function public.get_saved_posts(timestamptz, int) from public;
grant execute on function public.get_saved_posts(timestamptz, int) to authenticated;
revoke all on function public.get_post_details(uuid) from public;
grant execute on function public.get_post_details(uuid) to authenticated;
revoke all on function public.get_hashtag_posts(text, timestamptz, int) from public;
grant execute on function public.get_hashtag_posts(text, timestamptz, int) to authenticated;
revoke all on function public.get_xp_leaderboard(int) from public;
grant execute on function public.get_xp_leaderboard(int) to authenticated;
