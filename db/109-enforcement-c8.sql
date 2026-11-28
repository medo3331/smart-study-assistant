-- ===========================================================================
-- MAGICLY — Community C8: فرض العقوبات على كل التفاعلات + رسائل + بحث
-- ---------------------------------------------------------------------------
-- 1) الإعجاب/الحفظ/التصويت/إعادة النشر: المقيّد/المحظور لا يتفاعل
--    (نشر وتعليق مفروضين من C4 — دي بقة إجراءات التفاعل الباقية)
-- 2) المراسلة: المقيّد/المحظور لا يرسل رسائل ولا طلبات مراسلة
--    (public_can_message + سياسة INSERT على messages)
-- 3) باك-فيل public_user_code لأي profiles قديمة ناقصة الكود
--    (سبب روابط البروفايل المكسورة — /u/[uuid] بيرجّع للرئيسية)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) تفاعلات المنشورات — نفس أجسام C2/C2b + فحص العقوبة بعد فحص الدخول
-- ---------------------------------------------------------------------------

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
  where id = p_post_id and deleted_at is null and repost_of_post_id is null;
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

-- ---------------------------------------------------------------------------
-- 2) المراسلة: المقيّد/المحظور لا يراسل — نحدّث public_can_message وسياسة messages
-- ---------------------------------------------------------------------------

create or replace function public.public_can_message(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    user_a <> user_b
    and exists (select 1 from public.profiles p where p.id = user_b)
    and not exists (
      select 1 from public.user_blocks ub
      where (ub.blocker_id = user_a and ub.blocked_id = user_b)
         or (ub.blocker_id = user_b and ub.blocked_id = user_a)
    )
    and coalesce((
      select sp.allow_messages
      from public.social_profiles sp
      where sp.user_id = user_b
    ), true)
    -- 🛡️ C8: المُرسِل المحظور أو المقيّد مؤقتًا لا يراسل
    and not coalesce((select p.is_banned from public.profiles p where p.id = user_a), false)
    and (select p.restriction_until from public.profiles p where p.id = user_a) is null
    and not coalesce((
      select p.restriction_until > now()
      from public.profiles p where p.id = user_a
    ), false);
$$;

revoke all on function public.public_can_message(uuid, uuid) from public, anon;
grant execute on function public.public_can_message(uuid, uuid) to authenticated;

drop policy if exists "messages: insert from authorized sender" on public.messages;
create policy "messages: insert from authorized sender"
  on public.messages for insert
  to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.participant_id = auth.uid()
  )
  -- 🛡️ C8: المقيّد/المحظور لا يرسل رسائل
  and public.community_penalty_state(auth.uid()) is null
);

-- ---------------------------------------------------------------------------
-- 3) باك-فيل أكواد MAG الناقصة (التريغر بيملاها عند التحديث)
-- ---------------------------------------------------------------------------

update public.profiles set public_user_code = public_user_code where public_user_code is null;
