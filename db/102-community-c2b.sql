-- ===========================================================================
-- MAGICLY — Community C2b: ترتيب XP + استطلاعات + إعادة نشر/اقتباس + ترندات
-- ===========================================================================
--   1. get_xp_leaderboard      — ترتيب الطلاب حسب XP (مع استثناء المحظورين)
--   2. استطلاعات الرأي         — kind='poll' مع خيارات وأصوات (صوت واحد قابل للتغيير)
--   3. إعادة نشر + اقتباس      — repost_of_post_id / quote_post_id مع فرض الخصوصية
--   4. get_trending_hashtags   — الهاشتاجات الأكثر نشاطًا آخر 7 أيام
--
--  ملاحظة: دوال القراءة الأربع (feed/user/saved/details) بتتعاد هنا بصفّ موسّع
--  (repost_of_post_id + quote_post_id) — العددية القديمة بتتعمل drop الأول.
--
-- Idempotent: safe to run more than once.
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- 1) أعمدة وقيم جديدة على community_posts
-- ----------------------------------------------------------------------------

alter table public.community_posts
  add column if not exists repost_of_post_id uuid
  references public.community_posts (id) on delete cascade;

alter table public.community_posts drop constraint if exists community_posts_kind_check;
alter table public.community_posts add constraint community_posts_kind_check
  check (kind in ('text','achievement','question','tip','summary','challenge','poll','repost'));

-- ----------------------------------------------------------------------------
-- 2) جداول الاستطلاعات
-- ----------------------------------------------------------------------------

create table if not exists public.community_poll_options (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  option_text text not null check (length(btrim(option_text)) between 1 and 100),
  position    int not null check (position between 1 and 4),
  unique (post_id, position)
);

create table if not exists public.community_poll_votes (
  post_id   uuid not null references public.community_posts (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  option_id uuid not null references public.community_poll_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

do $$
begin
  execute 'alter table public.community_poll_options enable row level security';
  execute 'alter table public.community_poll_votes enable row level security';
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3) إنشاء منشور — توقيع موسّع: خيارات استطلاع + اقتباس
-- ----------------------------------------------------------------------------

create or replace function public.create_community_post(
  p_kind          text default 'text',
  p_body          text default null,
  p_visibility    text default 'public',
  p_image_url     text default null,
  p_options       text[] default null,
  p_quote_post_id uuid default null
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
  if p_image_url is not null and p_image_url !~ '^/uploads/community/[A-Za-z0-9._-]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_image');
  end if;
  -- سقف السبام: 20 منشور كحد أقصى في الساعة
  if (select count(*) from public.community_posts
      where author_id = v_me and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- الاقتباس: المنشور الأصلي لازم يكون موجودًا ومسموحًا للناظر
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

  -- الاستطلاع: 2–4 خيارات، كل خيار 1–100 حرف بعد التنظيف
  if p_kind = 'poll' then
    if p_options is null or array_length(p_options, 1) < 2 or array_length(p_options, 1) > 4 then
      return jsonb_build_object('ok', false, 'code', 'invalid_poll');
    end if;
  end if;

  insert into public.community_posts (author_id, kind, body, visibility, image_url, quote_post_id)
  values (v_me, p_kind, btrim(p_body), p_visibility, p_image_url, p_quote_post_id)
  returning id into v_post;

  if p_kind = 'poll' then
    foreach v_opt in array p_options loop
      v_opt := btrim(coalesce(v_opt, ''));
      continue when v_opt = '' or length(v_opt) > 100;
      v_pos := v_pos + 1;
      insert into public.community_poll_options (post_id, option_text, position)
      values (v_post, v_opt, v_pos);
    end loop;
    -- لازم خيارين صالحين على الأقل بعد التنظيف
    if v_pos < 2 then
      delete from public.community_posts where id = v_post;
      return jsonb_build_object('ok', false, 'code', 'invalid_poll');
    end if;
  end if;

  -- استخراج الهاشتاجات (#كلمة — عربي أو إنجليزي)
  for v_tag in
    select distinct m[1] from regexp_matches(p_body, '#([A-Za-z0-9_\u0600-\u06FF]{1,50})', 'g') as m
  loop
    insert into public.community_hashtags (tag) values (v_tag)
    on conflict (tag) do nothing;
    insert into public.community_post_hashtags (post_id, hashtag_id)
    select v_post, h.id from public.community_hashtags h where h.tag = v_tag
    on conflict do nothing;
  end loop;

  -- استخراج المنشن عبر كود MAG (@MAG-XXX-XXXX)
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

revoke all on function public.create_community_post(text, text, text, text, text[], uuid) from public;
grant execute on function public.create_community_post(text, text, text, text, text[], uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) التصويت في الاستطلاع + النتائج
-- ----------------------------------------------------------------------------

create or replace function public.vote_community_poll(p_post_id uuid, p_option_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_post public.community_posts;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null and kind = 'poll';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.social_can_view_post(v_post.author_id, v_post.visibility, v_me) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  if not exists (
    select 1 from public.community_poll_options
    where id = p_option_id and post_id = p_post_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_option');
  end if;

  -- صوت واحد قابل للتغيير: نمسح القديم ونثبّت الجديد
  delete from public.community_poll_votes where post_id = p_post_id and user_id = v_me;
  insert into public.community_poll_votes (post_id, user_id, option_id)
  values (p_post_id, v_me, p_option_id);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_poll_results(p_post_id uuid)
returns table (
  option_id uuid, option_text text, position int,
  vote_count bigint, voted_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id, o.option_text, o.position,
    (select count(*) from public.community_poll_votes v where v.option_id = o.id),
    exists (select 1 from public.community_poll_votes v
            where v.option_id = o.id and v.user_id = auth.uid())
  from public.community_posts p
  join public.community_poll_options o on o.post_id = p.id
  where p.id = p_post_id
    and p.deleted_at is null
    and p.kind = 'poll'
    and public.social_can_view_post(p.author_id, p.visibility, auth.uid())
  order by o.position asc;
$$;

-- ----------------------------------------------------------------------------
-- 5) إعادة النشر (repost = منشور kind='repost' يشير للأصلي)
-- ----------------------------------------------------------------------------

create or replace function public.repost_community_post(p_post_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_orig   public.community_posts;
  v_post   uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  select * into v_orig from public.community_posts
  where id = p_post_id and deleted_at is null and repost_of_post_id is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.social_can_view_post(v_orig.author_id, v_orig.visibility, v_me) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  -- منع التكرار: إعادة نفس الأصل بنفس الوضوح مرة واحدة
  if exists (
    select 1 from public.community_posts
    where author_id = v_me and repost_of_post_id = p_post_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_reposted');
  end if;

  insert into public.community_posts (author_id, kind, body, visibility, repost_of_post_id)
  values (v_me, 'repost', '🔁 إعادة نشر', 'public', p_post_id)
  returning id into v_post;
  return jsonb_build_object('ok', true, 'post_id', v_post);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) دوال القراءة الموسّعة — نفس منطق C2 + repost_of_post_id و quote_post_id
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
    sp.avatar_url,
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
    sp.avatar_url,
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
    sp.avatar_url,
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
    sp.avatar_url,
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
    sp.avatar_url,
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

-- ----------------------------------------------------------------------------
-- 7) ترتيب الطلاب حسب XP (الصدارة) — مع استثناء المحظورين
-- ----------------------------------------------------------------------------

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
    sp.avatar_url,
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

-- ترتيبك أنت (عدد اللي فوقك + 1) — null لو مش مسجل
create or replace function public.get_my_leaderboard_rank()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when me.uid is null then null::bigint
    else (
      select count(*) + 1
      from public.profiles pr
      where pr.xp > (select xp from public.profiles where id = me.uid)
    )
  end
  from (select auth.uid() as uid) me;
$$;

-- ----------------------------------------------------------------------------
-- 8) ترندات الهاشتاجات — الأكثر منشورًا آخر 7 أيام (عام ظاهر للكل)
-- ----------------------------------------------------------------------------

create or replace function public.get_trending_hashtags(p_limit int default 8)
returns table (tag text, post_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.tag,
    count(*) as post_count
  from public.community_post_hashtags ph
  join public.community_hashtags h on h.id = ph.hashtag_id
  join public.community_posts p on p.id = ph.post_id
  where p.deleted_at is null
    and p.visibility = 'public'
    and p.created_at > now() - interval '7 days'
  group by h.tag
  order by post_count desc, h.tag asc
  limit least(coalesce(p_limit, 8), 20);
$$;

-- ----------------------------------------------------------------------------
-- 9) صلاحيات الـRPCs الجديدة والموسّعة
-- ----------------------------------------------------------------------------

revoke all on function public.create_community_post(text, text, text, text, text[], uuid) from public;
grant execute on function public.create_community_post(text, text, text, text, text[], uuid) to authenticated;
revoke all on function public.vote_community_poll(uuid, uuid) from public;
grant execute on function public.vote_community_poll(uuid, uuid) to authenticated;
revoke all on function public.get_poll_results(uuid) from public;
grant execute on function public.get_poll_results(uuid) to authenticated;
revoke all on function public.repost_community_post(uuid) from public;
grant execute on function public.repost_community_post(uuid) to authenticated;
revoke all on function public.get_xp_leaderboard(int) from public;
grant execute on function public.get_xp_leaderboard(int) to authenticated;
revoke all on function public.get_my_leaderboard_rank() from public;
grant execute on function public.get_my_leaderboard_rank() to authenticated;
revoke all on function public.get_trending_hashtags(int) from public;
grant execute on function public.get_trending_hashtags(int) to authenticated;

-- إعادة منح الدوال الموسّعة (اتعمل لها drop عشان تغيير الـreturn type)
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
