-- ===========================================================================
-- MAGICLY — Community C2: المنشورات والفيد (لايكات + تعليقات + حفظ + هاشتاجات + منشن)
-- ===========================================================================
-- طبقة المحتوى الاجتماعي لمجتمع Magicly (المرحلة C2):
--   1. community_posts        — منشورات (نص/إنجاز/سؤال/معلومة/ملخص/تحدي)
--                               بخصوصية لكل منشور: public / friends / private
--   2. community_post_likes   — إعجابات (صف واحد لكل مستخدم/منشور)
--   3. community_comments     — تعليقات متداخلة (parent_id) بحذف ناعم
--   4. community_saved_posts  — حفظ المنشورات
--   5. community_hashtags     — هاشتاجات مستخرجة تلقائيًا من نص المنشور
--   6. community_mentions     — منشن عبر كود MAG (@MAG-XXX-XXXX)
--   7. RPCs security definer  — القراءة والكتابة كلها عبر الدوال؛ الجداول
--                               نفسها مقفولة تمامًا (RLS بلا سياسات)
--
-- قواعد الحماية (امتداد لقرارات C1):
--   - خصوصية المنشور مفروضة في قاعدة البيانات: «friends» لا يراه إلا الأصدقاء،
--     «private» لا يراه إلا صاحبه، والحظر بأي اتجاه يخفي كل شيء.
--   - سقف نشر (20 منشور/ساعة) كخط أول ضد السبام الآلي.
--   - الحذف ناعم (deleted_at) عشان المراجعة البشرية في C4.
--   - صور المنشورات من مسار /uploads/community/ فقط.
--
-- Idempotent: safe to run more than once.
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- 1) community_posts
-- ----------------------------------------------------------------------------

create table if not exists public.community_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references auth.users (id) on delete cascade,
  kind          text not null default 'text'
                check (kind in ('text','achievement','question','tip','summary','challenge')),
  body          text not null check (length(btrim(body)) between 1 and 2000),
  visibility    text not null default 'public'
                check (visibility in ('public','friends','private')),
  image_url     text,
  quote_post_id uuid references public.community_posts (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_community_posts_author
  on public.community_posts (author_id, created_at desc);
create index if not exists idx_community_posts_feed
  on public.community_posts (created_at desc);
create index if not exists idx_community_posts_quote
  on public.community_posts (quote_post_id);

-- ----------------------------------------------------------------------------
-- 2) لايكات + تعليقات + حفظ
-- ----------------------------------------------------------------------------

create table if not exists public.community_post_likes (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  parent_id  uuid references public.community_comments (id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_community_comments_post
  on public.community_comments (post_id, created_at);

create table if not exists public.community_saved_posts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ----------------------------------------------------------------------------
-- 3) هاشتاجات + منشن
-- ----------------------------------------------------------------------------

create table if not exists public.community_hashtags (
  id   uuid primary key default gen_random_uuid(),
  tag  text not null unique check (tag ~ '^#?[A-Za-z0-9_\u0600-\u06FF]{1,50}$')
);

create table if not exists public.community_post_hashtags (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  hashtag_id uuid not null references public.community_hashtags (id) on delete cascade,
  primary key (post_id, hashtag_id)
);

create index if not exists idx_community_post_hashtags_tag
  on public.community_post_hashtags (hashtag_id);

create table if not exists public.community_mentions (
  post_id  uuid not null references public.community_posts (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  primary key (post_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4) RLS — الجداول مقفولة تمامًا: كل القراءة والكتابة عبر الـRPCs (security
--    definer بفرض الخصوصية والحظر). لا سياسات ولا وصول مباشر إطلاقًا.
-- ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'community_posts','community_post_likes','community_comments',
    'community_saved_posts','community_hashtags','community_post_hashtags',
    'community_mentions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5) الإشعارات الاجتماعية — توسعة نوع الإشعار المسموح في الجدول الموحد
--    NOT VALID: القيد بيتطبق على الصفوف الجديدة/المعدّلة فقط، فمش بيكسر
--    صفوف الإشعارات القديمة بأنواع legacy (info/warning/feature).
-- ----------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (
    type in ('support_reply','support_status','announcement','system','social',
             'info','warning','feature')
  ) not valid;

-- ----------------------------------------------------------------------------
-- 6) دوال داخلية
-- ----------------------------------------------------------------------------

create or replace function public.social_can_view_post(p_author uuid, p_visibility text, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_viewer = p_author
    or (
      p_visibility = 'public'
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_author and b.blocked_id = p_viewer)
           or (b.blocker_id = p_viewer and b.blocked_id = p_author)
      )
    )
    or (
      p_visibility = 'friends'
      and public.social_are_friends(p_author, p_viewer)
    );
$$;

-- ----------------------------------------------------------------------------
-- 7) RPCs — الكتابة
-- ----------------------------------------------------------------------------

create or replace function public.create_community_post(
  p_kind       text default 'text',
  p_body       text,
  p_visibility text default 'public',
  p_image_url  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_post uuid;
  v_tag  text;
  v_code text;
  v_mentioned uuid;
  v_mentions jsonb := '[]'::jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  if p_kind not in ('text','achievement','question','tip','summary','challenge') then
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

  insert into public.community_posts (author_id, kind, body, visibility, image_url)
  values (v_me, p_kind, btrim(p_body), p_visibility, p_image_url)
  returning id into v_post;

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

create or replace function public.delete_community_post(p_post_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  update public.community_posts
  set deleted_at = now(), updated_at = now()
  where id = p_post_id and author_id = v_me and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.toggle_post_like(p_post_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_post public.community_posts;
  v_liked boolean;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.social_can_view_post(v_post.author_id, v_post.visibility, v_me) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;

  if exists (select 1 from public.community_post_likes where post_id = p_post_id and user_id = v_me) then
    delete from public.community_post_likes where post_id = p_post_id and user_id = v_me;
    v_liked := false;
  else
    insert into public.community_post_likes (post_id, user_id) values (p_post_id, v_me);
    v_liked := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'liked', v_liked,
    'like_count', (select count(*) from public.community_post_likes where post_id = p_post_id)
  );
end;
$$;

create or replace function public.add_post_comment(
  p_post_id  uuid,
  p_body     text,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_post    public.community_posts;
  v_comment uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.social_can_view_post(v_post.author_id, v_post.visibility, v_me) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.community_comments
    where id = p_parent_id and post_id = p_post_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_parent');
  end if;

  insert into public.community_comments (post_id, author_id, parent_id, body)
  values (p_post_id, v_me, p_parent_id, btrim(p_body))
  returning id into v_comment;

  return jsonb_build_object('ok', true, 'comment_id', v_comment);
end;
$$;

create or replace function public.delete_post_comment(p_comment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_post_author uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  select p.author_id into v_post_author
  from public.community_comments c
  join public.community_posts p on p.id = c.post_id
  where c.id = p_comment_id and c.deleted_at is null;
  if v_post_author is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  -- صاحب التعليق أو صاحب المنشور فقط
  update public.community_comments
  set deleted_at = now()
  where id = p_comment_id
    and (author_id = v_me or v_post_author = v_me);
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.toggle_saved_post(p_post_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_post public.community_posts;
  v_saved boolean;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.social_can_view_post(v_post.author_id, v_post.visibility, v_me) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;

  if exists (select 1 from public.community_saved_posts where post_id = p_post_id and user_id = v_me) then
    delete from public.community_saved_posts where post_id = p_post_id and user_id = v_me;
    v_saved := false;
  else
    insert into public.community_saved_posts (post_id, user_id) values (p_post_id, v_me);
    v_saved := true;
  end if;
  return jsonb_build_object('ok', true, 'saved', v_saved);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8) RPCs — القراءة
-- ----------------------------------------------------------------------------

-- عنصر منشور موحّد (بيتكرر في كل قوائم القراءة)
-- الأعمدة: post_id, kind, body, visibility, image_url, created_at,
--          author_id, author_name, author_code, author_avatar,
--          like_count, comment_count, liked_by_me, saved_by_me

create or replace function public.get_community_feed(
  p_before timestamptz default null,
  p_limit  int default 20
)
returns table (
  post_id uuid, kind text, body text, visibility text, image_url text,
  created_at timestamptz,
  author_id uuid, author_name text, author_code text, author_avatar text,
  like_count bigint, comment_count bigint,
  liked_by_me boolean, saved_by_me boolean
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
            where s.post_id = p.id and s.user_id = me.uid)
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
  liked_by_me boolean, saved_by_me boolean
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
            where s.post_id = p.id and s.user_id = me.uid)
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

create or replace function public.get_post_comments(
  p_post_id uuid,
  p_before  timestamptz default null,
  p_limit   int default 50
)
returns table (
  comment_id uuid, parent_id uuid, body text, created_at timestamptz,
  author_id uuid, author_name text, author_code text, author_avatar text,
  can_delete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  vp as (
    select p.author_id, p.visibility
    from public.community_posts p
    where p.id = p_post_id and p.deleted_at is null
  )
  select
    c.id, c.parent_id, c.body, c.created_at,
    c.author_id,
    coalesce(sp.display_name, pr.display_name),
    pr.public_user_code,
    sp.avatar_url,
    (c.author_id = me.uid or vp.author_id = me.uid)
  from public.community_comments c
  join public.profiles pr on pr.id = c.author_id
  left join public.social_profiles sp on sp.user_id = c.author_id
  cross join me, vp
  where c.post_id = p_post_id
    and c.deleted_at is null
    and c.created_at < coalesce(p_before, 'infinity'::timestamptz)
    and public.social_can_view_post(vp.author_id, vp.visibility, me.uid)
  order by c.created_at asc
  limit least(coalesce(p_limit, 50), 100);
$$;

create or replace function public.get_saved_posts(
  p_before timestamptz default null,
  p_limit  int default 20
)
returns table (
  post_id uuid, kind text, body text, visibility text, image_url text,
  created_at timestamptz,
  author_id uuid, author_name text, author_code text, author_avatar text,
  like_count bigint, comment_count bigint,
  liked_by_me boolean, saved_by_me boolean
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
    true
  from public.community_saved_posts s
  join public.community_posts p on p.id = s.post_id and p.deleted_at is null
  join public.profiles pr on pr.id = p.author_id
  left join public.social_profiles sp on sp.user_id = p.author_id
  where s.user_id = auth.uid()
    and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
  order by s.created_at desc
  limit least(coalesce(p_limit, 20), 30);
$$;

-- تفاصيل منشور واحد (للربط الدائم وللاقتباس في C2b)
create or replace function public.get_post_details(p_post_id uuid)
returns table (
  post_id uuid, kind text, body text, visibility text, image_url text,
  created_at timestamptz,
  author_id uuid, author_name text, author_code text, author_avatar text,
  like_count bigint, comment_count bigint,
  liked_by_me boolean, saved_by_me boolean
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
            where s.post_id = p.id and s.user_id = me.uid)
  from public.community_posts p
  join public.profiles pr on pr.id = p.author_id
  left join public.social_profiles sp on sp.user_id = p.author_id
  cross join me
  where p.id = p_post_id
    and p.deleted_at is null
    and public.social_can_view_post(p.author_id, p.visibility, me.uid);
$$;

-- منشورات هاشتاج معيّن (نفس قواعد الفيد: عام + أصدقاء + منشوراتك)
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
  liked_by_me boolean, saved_by_me boolean
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
            where s.post_id = p.id and s.user_id = me.uid)
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
-- 9) صلاحيات الـRPCs — security definer مغلق على public ومفتوح لـ authenticated
-- ----------------------------------------------------------------------------

revoke all on function public.social_can_view_post(uuid, text, uuid) from public;
grant execute on function public.social_can_view_post(uuid, text, uuid) to authenticated;
revoke all on function public.create_community_post(text, text, text, text) from public;
grant execute on function public.create_community_post(text, text, text, text) to authenticated;
revoke all on function public.delete_community_post(uuid) from public;
grant execute on function public.delete_community_post(uuid) to authenticated;
revoke all on function public.toggle_post_like(uuid) from public;
grant execute on function public.toggle_post_like(uuid) to authenticated;
revoke all on function public.add_post_comment(uuid, text, uuid) from public;
grant execute on function public.add_post_comment(uuid, text, uuid) to authenticated;
revoke all on function public.delete_post_comment(uuid) from public;
grant execute on function public.delete_post_comment(uuid) to authenticated;
revoke all on function public.toggle_saved_post(uuid) from public;
grant execute on function public.toggle_saved_post(uuid) to authenticated;
revoke all on function public.get_community_feed(timestamptz, int) from public;
grant execute on function public.get_community_feed(timestamptz, int) to authenticated;
revoke all on function public.get_user_posts(uuid, timestamptz, int) from public;
grant execute on function public.get_user_posts(uuid, timestamptz, int) to authenticated;
revoke all on function public.get_post_comments(uuid, timestamptz, int) from public;
grant execute on function public.get_post_comments(uuid, timestamptz, int) to authenticated;
revoke all on function public.get_saved_posts(timestamptz, int) from public;
grant execute on function public.get_saved_posts(timestamptz, int) to authenticated;
revoke all on function public.get_post_details(uuid) from public;
grant execute on function public.get_post_details(uuid) to authenticated;
revoke all on function public.get_hashtag_posts(text, timestamptz, int) from public;
grant execute on function public.get_hashtag_posts(text, timestamptz, int) to authenticated;
