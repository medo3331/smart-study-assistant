-- ============================================================================
-- MAGICLY — Community C2d: صور المنشورات على Supabase Storage
-- ============================================================================
--   1. باكت عمومي 'community' في Storage + سياسات (قراءة عامة، رفع للمُسجل
--      في مجلده الخاص فقط).
--   2. إصلاح تحقق create_community_post: كان يمنع أي شرطة مائلة بعد
--      /uploads/community فبيرفض المسار /uploads/community/2025/x.jpg،
--      ودلوقتي بيقبل روابط Supabase Storage العامة كذلك.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bucket + سياسات Storage
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('community', 'community', true)
on conflict (id) do update set public = true;

do $$
begin
  execute 'create policy "community storage: public read"
    on storage.objects for select
    using (bucket_id = ''community'')';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy "community storage: auth upload own folder"
    on storage.objects for insert to authenticated
    with check (bucket_id = ''community'' and (storage.foldername(name))[1] = auth.uid()::text)';
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) create_community_post بتحقق صور مُصلّح
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
  -- صور مسموحة: رابط Supabase Storage عام لباكت community،
  -- أو المسار المحلي القديم (بشرطة مائلة للمجلدات).
  if p_image_url is not null and p_image_url !~
    '^(https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/community/[A-Za-z0-9._/-]+|/uploads/community/[A-Za-z0-9._/-]+)$'
  then
    return jsonb_build_object('ok', false, 'code', 'invalid_image');
  end if;
  -- Rate limit: 20 منشور كحد أقصى في الساعة للطالب الواحد
  if (select count(*) from public.community_posts
      where author_id = v_me and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- الاقتباس: منشور موجود وغير محذوف ويحق للطالب رؤيته
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

  -- الاستطلاع: 2–4 خيارات، كل خيار 1–100 حرف
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
      insert into public.community_poll_options (post_id, option_text, option_position)
      values (v_post, v_opt, v_pos);
    end loop;
    -- لو ما اتحفش منشورين خيارات صالحين نمسح المنشور
    if v_pos < 2 then
      delete from public.community_posts where id = v_post;
      return jsonb_build_object('ok', false, 'code', 'invalid_poll');
    end if;
  end if;

  -- استخراج الهاشتاجات (#كلمة حتى لو عربية)
  for v_tag in
    select distinct m[1] from regexp_matches(p_body, '#([A-Za-z0-9_\u0600-\u06FF]{1,50})', 'g') as m
  loop
    insert into public.community_hashtags (tag) values (v_tag)
    on conflict (tag) do nothing;
    insert into public.community_post_hashtags (post_id, hashtag_id)
    select v_post, h.id from public.community_hashtags h where h.tag = v_tag
    on conflict do nothing;
  end loop;

  -- استخراج المنشنز MAG (@MAG-XXX-XXXX)
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
