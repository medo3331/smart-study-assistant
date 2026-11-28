-- ============================================================================
-- 117 — COMMUNITY POST APPROVAL (C15)
-- كل منشور جديد بيتطلب موافقة المشرف قبل النشر (p.status = 'pending')
-- ----------------------------------------------------------------------------
-- ١) عمود status على community_posts — المنشورات القديمة تفضل ظاهرة
--    (default 'approved' للباكفيل ثم default 'pending' للجديد)
-- ٢) القرّاء (db/103 — آخر نسخة) بيشوفوا المنشورات المعتمدة فقط
-- ٣) التفاعل (لايك/حفظ/تصويت/إعادة نشر/تعليق) على المعتمد فقط
-- ٤) mod_review_post — موافقة/رفض للمشرف + إشعار صاحب المنشور + ربط التحديات
-- ملاحظة: create_community_post مش محتاج تعديل — الـ default الجديد بيكفي.
-- ============================================================================

-- ١) عمود الحالة
alter table public.community_posts
  add column if not exists status text not null default 'approved';

alter table public.community_posts
  alter column status set default 'pending';

do $$ begin
  alter table public.community_posts
    add constraint community_posts_status_check
    check (status in ('pending','approved','rejected'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_community_posts_status
  on public.community_posts (status, created_at desc);

-- ----------------------------------------------------------------------------
-- ٢) القرّاء — المعتمد فقط
-- ----------------------------------------------------------------------------
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
  where p.deleted_at is null and p.status = 'approved'
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
  where p.deleted_at is null and p.status = 'approved'
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
  join public.community_posts p on p.id = s.post_id and p.deleted_at is null and p.status = 'approved'
  join public.profiles pr on pr.id = p.author_id
  left join public.social_profiles sp on sp.user_id = p.author_id
  where s.user_id = auth.uid()
    and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
  order by s.created_at desc
  limit least(coalesce(p_limit, 20), 30);
$$;

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
    and p.deleted_at is null and p.status = 'approved'
    and public.social_can_view_post(p.author_id, p.visibility, me.uid);
$$;

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
  where p.deleted_at is null and p.status = 'approved'
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
-- ٣) التفاعل على المنشور المعتمد فقط (غير المعتمد = not_found)
-- ----------------------------------------------------------------------------
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
  -- 🛡️ C8: المقيّد/المحظور لا يتفاعل
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null and status = 'approved';
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
  -- 🛡️ C8: المقيّد/المحظور لا يتفاعل
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null and status = 'approved';
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
  -- 🛡️ C8: المقيّد/المحظور لا يتفاعل
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null and status = 'approved' and kind = 'poll';
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

  delete from public.community_poll_votes where post_id = p_post_id and user_id = v_me;
  insert into public.community_poll_votes (post_id, user_id, option_id)
  values (p_post_id, v_me, p_option_id);

  return jsonb_build_object('ok', true);
end;
$$;

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
  -- 🛡️ C8: المقيّد/المحظور لا يتفاعل
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
  end if;
  select * into v_orig from public.community_posts
  where id = p_post_id and deleted_at is null and status = 'approved' and repost_of_post_id is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.social_can_view_post(v_orig.author_id, v_orig.visibility, v_me) then
    return jsonb_build_object('ok', false, 'code', 'not_allowed');
  end if;
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
  -- 🛡️ C4: المحظور/المقيّد لا يعلّق
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  select * into v_post from public.community_posts
  where id = p_post_id and deleted_at is null and status = 'approved';
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

-- ----------------------------------------------------------------------------
-- ٤) موافقة/رفض المشرف — للأدمن أو service_role من الـAPI المصرّح
-- ----------------------------------------------------------------------------
create or replace function public.mod_review_post(p_post_id uuid, p_approve boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_post public.community_posts;
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select * into v_post from public.community_posts where id = p_post_id;
  if v_post.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  update public.community_posts
  set status = case when p_approve then 'approved' else 'rejected' end,
      updated_at = now()
  where id = p_post_id;

  -- إشعار صاحب المنشور بالقرار
  insert into public.notifications (recipient_id, type, title, body, link_url)
  values (
    v_post.author_id, 'social',
    case when p_approve then '✅ منشورك اتفعّل' else '❌ منشورك اترفض' end,
    case when p_approve
      then 'منشورك عدّى مراجعة الإشراف ونزل في المجتمع.'
      else 'منشورك مخالف لقواعد المجتمع فمانشرش. راجع قواعد المجتمع واعتذر لو حصل خطأ.' end,
    '/community'
  );

  -- لو اتفقّل: نعيد ربط هاشتاجات التحديات (الـ trigger بيسجّل المشاركة)
  if p_approve then
    with old as (
      delete from public.community_post_hashtags where post_id = p_post_id
      returning post_id, hashtag_id
    )
    insert into public.community_post_hashtags (post_id, hashtag_id)
    select post_id, hashtag_id from old;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.mod_review_post(uuid, boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ٥) طابور الموافقات — قايمة المنشورات المنتظرة للمشرف
-- ----------------------------------------------------------------------------
create or replace function public.mod_list_pending_posts(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  return jsonb_build_object('ok', true, 'entries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'post_id',      p.id,
      'kind',         p.kind,
      'body',         p.body,
      'image_url',    p.image_url,
      'created_at',   p.created_at,
      'author_id',    p.author_id,
      'author_name',  coalesce(sp.display_name, pr.display_name, 'طالب'),
      'author_code',  pr.public_user_code,
      'author_avatar', sp.avatar_url
    ) order by p.created_at asc)
    from public.community_posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.social_profiles sp on sp.user_id = p.author_id
    where p.status = 'pending' and p.deleted_at is null
    limit greatest(coalesce(p_limit, 50), 1)
  ), '[]'::jsonb));
end;
$$;

grant execute on function public.mod_list_pending_posts(int) to authenticated, service_role;
