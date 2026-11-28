-- ===========================================================================
-- MAGICLY — Community C4: الإشراف والحماية (Moderation & Safety)
-- ---------------------------------------------------------------------------
-- المحتويات:
--   1) أعمدة profiles الجديدة: restriction_until + warning_count
--   2) جداول: content_reports / moderation_actions / moderation_appeals /
--             moderation_audit_log  (RLS مفعّل — بلا سياسات، الوصول عبر
--             security definer RPCs أو service_role من APIs الأدمن فقط)
--   3) مساعد العقوبات: community_penalty_state
--   4) RPCs الطالب: report_content / community_my_moderation_status /
--             submit_moderation_appeal
--   5) فرض العقوبات: إعادة إنشاء create_community_post + add_post_comment
--             بفحص الحظر/التقييد + Trigger حماية على الإدراج المباشر
--   6) RPCs الأدمن (تُستدعى بـ service_role من API مُصرّح بصلاحية
--             community.moderate — التحقق في طبقة الـAPI):
--             mod_list_reports / mod_resolve_report / mod_issue_action /
--             mod_lift_action / mod_list_actions / mod_list_appeals /
--             mod_resolve_appeal
--   كل فعل إداري يُسجَّل في moderation_audit_log.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) أعمدة profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists restriction_until timestamptz,
  add column if not exists warning_count int not null default 0;

-- ---------------------------------------------------------------------------
-- 2) الجداول
-- ---------------------------------------------------------------------------
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user')),
  target_id uuid not null,
  reason text not null check (reason in (
    'harassment','hate','bullying','spam','doxxing','impersonation',
    'threat','illegal','other')),
  details text check (details is null or length(details) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- منع تكرار نفس المُبلِّغ على نفس الهدف وهو ما زال مفتوحًا
  unique (reporter_id, target_type, target_id, status) deferrable initially deferred
);
create index if not exists idx_content_reports_status on public.content_reports (status, created_at desc);
create index if not exists idx_content_reports_target on public.content_reports (target_type, target_id);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('warning','restrict','suspend','lift')),
  reason text not null,
  expires_at timestamptz,            -- للـ restrict المؤقت / suspend المؤقت
  report_id uuid references public.content_reports(id) on delete set null,
  active boolean not null default true,
  issued_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_mod_actions_user on public.moderation_actions (user_id, active, created_at desc);
create index if not exists idx_mod_actions_active on public.moderation_actions (active, expires_at);

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.moderation_actions(id) on delete cascade,
  message text not null check (length(message) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- اعتراض واحد فقط لكل عقوبة
  unique (action_id)
);
create index if not exists idx_mod_appeals_status on public.moderation_appeals (status, created_at);

create table if not exists public.moderation_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_mod_audit_created on public.moderation_audit_log (created_at desc);

alter table public.content_reports     enable row level security;
alter table public.moderation_actions  enable row level security;
alter table public.moderation_appeals  enable row level security;
alter table public.moderation_audit_log enable row level security;
-- ⚠️ أمان: لا سياسات — القراءة/الكتابة عبر RPCs (security definer) أو service_role.

-- ---------------------------------------------------------------------------
-- 3) مساعد حالة العقوبات
-- ---------------------------------------------------------------------------
create or replace function public.community_penalty_state(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.profiles
      where id = p_user and coalesce(is_banned, false)
    ) then 'banned'
    when exists (
      select 1 from public.profiles
      where id = p_user
        and restriction_until is not null
        and restriction_until > now()
    ) then 'restricted'
    else null
  end;
$$;

revoke all on function public.community_penalty_state(uuid) from public, anon;
grant execute on function public.community_penalty_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPCs الطالب
-- ---------------------------------------------------------------------------
-- إبلاغ عن محتوى/مستخدم — بسقوف ومنع تكرار
create or replace function public.report_content(
  p_target_type text,
  p_target_id   uuid,
  p_reason      text,
  p_details     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_exists boolean;
  v_author uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_target_type not in ('post','comment','user') then
    return jsonb_build_object('ok', false, 'code', 'invalid_target_type');
  end if;
  if p_reason not in ('harassment','hate','bullying','spam','doxxing',
                      'impersonation','threat','illegal','other') then
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;
  if p_details is not null and length(btrim(p_details)) > 500 then
    return jsonb_build_object('ok', false, 'code', 'invalid_details');
  end if;
  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_target');
  end if;

  -- التحقق من وجود الهدف + منع الإبلاغ عن نفسك
  if p_target_type = 'post' then
    select author_id into v_author from public.community_posts
    where id = p_target_id and deleted_at is null;
  elsif p_target_type = 'comment' then
    select author_id into v_author from public.community_comments
    where id = p_target_id and deleted_at is null;
  else
    select id into v_author from public.profiles where id = p_target_id;
  end if;
  if v_author is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_author = v_me then
    return jsonb_build_object('ok', false, 'code', 'cannot_report_self');
  end if;

  -- سقف: 10 إبلاغات في الساعة
  if (select count(*) from public.content_reports
      where reporter_id = v_me and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- منع تكرار الإبلاغ المفتوح عن نفس الهدف
  if exists (
    select 1 from public.content_reports
    where reporter_id = v_me and target_type = p_target_type
      and target_id = p_target_id and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_reported');
  end if;

  insert into public.content_reports
    (reporter_id, target_type, target_id, reason, details)
  values (v_me, p_target_type, p_target_id, p_reason, btrim(coalesce(p_details, '')));

  insert into public.moderation_audit_log (actor_id, action, target_type, target_id, details)
  values (v_me, 'content_reported', p_target_type, p_target_id::text,
          jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;

-- حالتي الإشرافية: عقوبة نشطة + اعتراضاتي
create or replace function public.community_my_moderation_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_banned boolean := false;
  v_ban_reason text;
  v_restricted_until timestamptz;
  v_last_active public.moderation_actions;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;

  select is_banned, ban_reason, restriction_until
  into v_banned, v_ban_reason, v_restricted_until
  from public.profiles where id = v_me;
  if coalesce(v_restricted_until, 'infinity'::timestamptz) < now() then
    v_restricted_until := null;
  end if;

  if v_banned or v_restricted_until is not null then
    select * into v_last_active from public.moderation_actions
    where user_id = v_me and active
    order by created_at desc limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'banned', coalesce(v_banned, false),
    'ban_reason', case when v_banned then v_ban_reason end,
    'restricted_until', v_restricted_until,
    'warning_count', (select warning_count from public.profiles where id = v_me),
    'active_action',
      case when v_last_active.id is not null then
        jsonb_build_object(
          'id', v_last_active.id,
          'action_type', v_last_active.action_type,
          'reason', v_last_active.reason,
          'expires_at', v_last_active.expires_at,
          'created_at', v_last_active.created_at)
      end,
    'my_appeals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'action_id', a.action_id,
        'status', a.status, 'message', a.message,
        'review_notes', a.review_notes, 'created_at', a.created_at
      ) order by a.created_at desc), '[]'::jsonb)
      from public.moderation_appeals a where a.user_id = v_me
    )
  );
end;
$$;

revoke all on function public.community_my_moderation_status() from public, anon;
grant execute on function public.community_my_moderation_status() to authenticated;

-- تقديم اعتراض على عقوبة نشطة
create or replace function public.submit_moderation_appeal(
  p_action_id uuid,
  p_message   text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'code', 'auth_required');
  end if;
  if p_message is null or length(btrim(p_message)) < 10 or length(p_message) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_message');
  end if;
  if not exists (
    select 1 from public.moderation_actions
    where id = p_action_id and user_id = v_me and active
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if exists (select 1 from public.moderation_appeals where action_id = p_action_id) then
    return jsonb_build_object('ok', false, 'code', 'already_appealed');
  end if;

  insert into public.moderation_appeals (user_id, action_id, message)
  values (v_me, p_action_id, btrim(p_message));

  insert into public.moderation_audit_log (actor_id, action, target_type, target_id, details)
  values (v_me, 'appeal_submitted', 'moderation_action', p_action_id::text, null);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_moderation_appeal(uuid, text) from public, anon;
grant execute on function public.submit_moderation_appeal(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) فرض العقوبات على النشر والتعليق
-- ---------------------------------------------------------------------------
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
  -- 🛡️ C4: المحظور/المقيّد لا ينشر
  if public.community_penalty_state(v_me) is not null then
    return jsonb_build_object('ok', false, 'code', 'restricted');
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

revoke all on function public.create_community_post(text, text, text, text, text[], uuid, uuid) from public;
grant execute on function public.create_community_post(text, text, text, text, text[], uuid, uuid) to authenticated;

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

revoke all on function public.add_post_comment(uuid, text, uuid) from public;
grant execute on function public.add_post_comment(uuid, text, uuid) to authenticated;

-- Trigger حماية احتياطي: أي إدراج مباشر من مستخدم محظور/مقيّد يُرفض
create or replace function public.trg_fn_moderation_block()
returns trigger
language plpgsql
as $$
begin
  if public.community_penalty_state(new.author_id) is not null then
    raise exception 'MAGICLY_MODERATION_BLOCKED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_posts_moderation on public.community_posts;
create trigger trg_community_posts_moderation
  before insert on public.community_posts
  for each row execute function public.trg_fn_moderation_block();

drop trigger if exists trg_community_comments_moderation on public.community_comments;
create trigger trg_community_comments_moderation
  before insert on public.community_comments
  for each row execute function public.trg_fn_moderation_block();

-- ---------------------------------------------------------------------------
-- 6) RPCs الأدمن — تُستدعى بـ service_role من API مُصرّح بصلاحية
--    community.moderate. محمية بـ auth.uid() للأدمن (site_admins) كخط دفاع
--    إضافي، والـ service_role يتجاوزها لأن auth.uid() يرجع null...
--    ⚠️ لأن service_role يرسل بدون جلسة مستخدم، نسمح بالاستدعاء إذا كان
--    المستخدم أدمن في site_admins. الـ env-owner يمر عبر طبقة الـAPI
--    (hasPermission) التي تنادي بـ service_role — والتحقق النهائي هناك.
-- ---------------------------------------------------------------------------

-- طابور التقارير مع تفاصيل الهدف
create or replace function public.mod_list_reports(
  p_status text default 'pending',
  p_limit  int  default 50
)
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
  return jsonb_build_object('ok', true, 'reports', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'reporter_id', r.reporter_id,
      'reporter_name', sp.display_name,
      'target_type', r.target_type,
      'target_id', r.target_id,
      'reason', r.reason,
      'details', r.details,
      'status', r.status,
      'review_notes', r.review_notes,
      'created_at', r.created_at,
      'target_preview', case r.target_type
        when 'post' then (select left(p.body, 200) from public.community_posts p where p.id = r.target_id)
        when 'comment' then (select left(c.body, 200) from public.community_comments c where c.id = r.target_id)
        else null end,
      'target_author_id', case r.target_type
        when 'post' then (select p.author_id from public.community_posts p where p.id = r.target_id)
        when 'comment' then (select c.author_id from public.community_comments c where c.id = r.target_id)
        else r.target_id end,
      'target_author_name', case r.target_type
        when 'post' then (select sp2.display_name from public.community_posts p2
                          join public.social_profiles sp2 on sp2.id = p2.author_id
                          where p2.id = r.target_id)
        when 'comment' then (select sp3.display_name from public.community_comments c3
                             join public.social_profiles sp3 on sp3.id = c3.author_id
                             where c3.id = r.target_id)
        else (select sp4.display_name from public.social_profiles sp4 where sp4.id = r.target_id) end,
      'pending_count', (select count(*) from public.content_reports r2
                        where r2.target_type = r.target_type and r2.target_id = r.target_id
                          and r2.status = 'pending')
    ) order by r.created_at desc), '[]'::jsonb)
    from public.content_reports r
    left join public.social_profiles sp on sp.id = r.reporter_id
    where r.status = p_status
    limit least(greatest(p_limit, 1), 100)
  ));
end;
$$;

revoke all on function public.mod_list_reports(text, int) from public, anon;
grant execute on function public.mod_list_reports(text, int) to authenticated, service_role;

-- إنهاء تقرير (مراجَع / مرفوض) — مع تسجيل المراجعة
create or replace function public.mod_resolve_report(
  p_report_id uuid,
  p_new_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_reporter uuid;
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_new_status not in ('reviewed','dismissed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  end if;
  select reporter_id into v_reporter from public.content_reports where id = p_report_id;
  if v_reporter is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  update public.content_reports
  set status = p_new_status,
      reviewed_by = coalesce(v_admin, reviewed_by),
      review_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      reviewed_at = now()
  where id = p_report_id;

  -- إشعار المُبلِّغ بنتيجة المراجعة
  insert into public.notifications (recipient_id, type, title, body, link_url)
  values (
    v_reporter, 'social',
    'تمت مراجعة إبلاغك',
    case when p_new_status = 'reviewed'
      then 'شكرًا ليك — تم اتخاذ إجراء بخصوص الإبلاغ اللي بعتّه.'
      else 'تمت مراجعة الإبلاغ اللي بعتّه، ومفيش مخالفة مؤكدة.' end,
    '/community');

  insert into public.moderation_audit_log (actor_id, action, target_type, target_id, details)
  values (v_admin, 'report_resolved', 'content_report', p_report_id::text,
          jsonb_build_object('new_status', p_new_status, 'notes', p_notes));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mod_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.mod_resolve_report(uuid, text, text) to authenticated, service_role;

-- إصدار عقوبة: تحذير / تقييد مؤقت / إيقاف
create or replace function public.mod_issue_action(
  p_user_id     uuid,
  p_action_type text,
  p_reason      text,
  p_days        int default null,
  p_report_id   uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_action uuid;
  v_expires timestamptz;
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_action_type not in ('warning','restrict','suspend') then
    return jsonb_build_object('ok', false, 'code', 'invalid_action_type');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if p_days is not null and (p_days < 1 or p_days > 365) then
    return jsonb_build_object('ok', false, 'code', 'invalid_days');
  end if;

  if p_action_type = 'restrict' then
    if p_days is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_days');
    end if;
    v_expires := now() + make_interval(days => p_days);
  elsif p_action_type = 'suspend' then
    -- suspend بلا أيام = حظر دائم
    v_expires := case when p_days is not null then now() + make_interval(days => p_days) end;
  end if;

  insert into public.moderation_actions
    (user_id, action_type, reason, expires_at, report_id, active, issued_by)
  values (p_user_id, p_action_type, btrim(p_reason), v_expires, p_report_id, true, v_admin)
  returning id into v_action;

  -- تطبيق الحالة على profiles
  if p_action_type = 'warning' then
    update public.profiles set warning_count = coalesce(warning_count, 0) + 1 where id = p_user_id;
  elsif p_action_type = 'restrict' then
    update public.profiles set restriction_until = v_expires where id = p_user_id;
  elsif p_action_type = 'suspend' then
    if p_days is null then
      update public.profiles
      set is_banned = true, banned_at = now(), ban_reason = btrim(p_reason)
      where id = p_user_id;
    else
      update public.profiles set restriction_until = v_expires where id = p_user_id;
    end if;
  end if;

  -- ربط التقرير بالعقوبة + إغلاقه كمراجَع
  if p_report_id is not null then
    update public.content_reports
    set status = 'reviewed',
        reviewed_by = coalesce(v_admin, reviewed_by),
        reviewed_at = now()
    where id = p_report_id and status = 'pending';
  end if;

  -- إشعار الطالب بالعقوبة
  insert into public.notifications (recipient_id, type, title, body, link_url)
  values (
    p_user_id, 'social',
    case p_action_type
      when 'warning' then '⚠️ تحذير من إشراف مجتمع Magicly'
      when 'restrict' then '⏸️ تقييد مؤقت لحسابك في المجتمع'
      else '🚫 إيقاف حسابك في المجتمع' end,
    'السبب: ' || btrim(p_reason) ||
    case when v_expires is not null
      then ' — حتى ' || to_char(v_expires, 'YYYY-MM-DD HH24:MI') || ' (تقدر تقدّم اعتراض).'
      else ' — تقدر تقدّم اعتراض للمراجعة.' end,
    '/community');

  insert into public.moderation_audit_log (actor_id, action, target_type, target_id, details)
  values (v_admin, 'action_issued', 'user', p_user_id::text,
          jsonb_build_object('action_id', v_action, 'action_type', p_action_type,
                             'days', p_days, 'reason', p_reason, 'report_id', p_report_id));

  return jsonb_build_object('ok', true, 'action_id', v_action);
end;
$$;

revoke all on function public.mod_issue_action(uuid, text, text, int, uuid) from public, anon;
grant execute on function public.mod_issue_action(uuid, text, text, int, uuid) to authenticated, service_role;

-- رفع العقوبة
create or replace function public.mod_lift_action(
  p_action_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_target uuid;
  v_type text;
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select user_id, action_type into v_target, v_type
  from public.moderation_actions where id = p_action_id and active;
  if v_target is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  update public.moderation_actions
  set active = false
  where id = p_action_id;

  -- إزالة آثار العقوبة من profiles (لو مفيش عقوبات نشطة تانية من نفس النوع)
  if not exists (
    select 1 from public.moderation_actions
    where user_id = v_target and active and id <> p_action_id
      and action_type in ('restrict','suspend')
  ) then
    update public.profiles
    set restriction_until = null, is_banned = false, ban_reason = null
    where id = v_target;
  end if;

  insert into public.notifications (recipient_id, type, title, body, link_url)
  values (v_target, 'social', 'تم رفع الإجراء الإشرافي',
          'تمت مراجعة حالتك ورُفع الإجراء — أهلًا بيك تاني في مجتمع Magicly.', '/community');

  insert into public.moderation_audit_log (actor_id, action, target_type, target_id, details)
  values (v_admin, 'action_lifted', 'moderation_action', p_action_id::text,
          jsonb_build_object('target_user', v_target, 'action_type', v_type, 'notes', p_notes));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mod_lift_action(uuid, text) from public, anon;
grant execute on function public.mod_lift_action(uuid, text) to authenticated, service_role;

-- سجل العقوبات النشطة والسابقة
create or replace function public.mod_list_actions(
  p_active_only boolean default false,
  p_limit int default 50
)
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
  return jsonb_build_object('ok', true, 'actions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'user_id', a.user_id,
      'user_name', sp.display_name,
      'user_code', pr.public_user_code,
      'action_type', a.action_type, 'reason', a.reason,
      'expires_at', a.expires_at, 'active', a.active,
      'report_id', a.report_id, 'created_at', a.created_at,
      'is_banned', coalesce(pr.is_banned, false),
      'restriction_until', pr.restriction_until,
      'warning_count', coalesce(pr.warning_count, 0)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.moderation_actions a
    left join public.social_profiles sp on sp.id = a.user_id
    left join public.profiles pr on pr.id = a.user_id
    where (not p_active_only or a.active)
    limit least(greatest(p_limit, 1), 100)
  ));
end;
$$;

revoke all on function public.mod_list_actions(boolean, int) from public, anon;
grant execute on function public.mod_list_actions(boolean, int) to authenticated, service_role;

-- طابور الاعتراضات
create or replace function public.mod_list_appeals(
  p_status text default 'pending',
  p_limit int default 50
)
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
  return jsonb_build_object('ok', true, 'appeals', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ap.id, 'user_id', ap.user_id,
      'user_name', sp.display_name,
      'user_code', pr.public_user_code,
      'action_id', ap.action_id,
      'action_type', ma.action_type,
      'action_reason', ma.reason,
      'message', ap.message,
      'status', ap.status,
      'review_notes', ap.review_notes,
      'created_at', ap.created_at
    ) order by ap.created_at), '[]'::jsonb)
    from public.moderation_appeals ap
    left join public.moderation_actions ma on ma.id = ap.action_id
    left join public.social_profiles sp on sp.id = ap.user_id
    left join public.profiles pr on pr.id = ap.user_id
    where ap.status = p_status
    limit least(greatest(p_limit, 1), 100)
  ));
end;
$$;

revoke all on function public.mod_list_appeals(text, int) from public, anon;
grant execute on function public.mod_list_appeals(text, int) to authenticated, service_role;

-- حسم الاعتراض: موافقة = رفع العقوبة، رفض = بقاء العقوبة
create or replace function public.mod_resolve_appeal(
  p_appeal_id uuid,
  p_approve   boolean,
  p_notes     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_user uuid;
  v_action_id uuid;
  v_action_active boolean;
begin
  if not public.is_site_admin() and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select ap.user_id, ap.action_id, ma.active
  into v_user, v_action_id, v_action_active
  from public.moderation_appeals ap
  join public.moderation_actions ma on ma.id = ap.action_id
  where ap.id = p_appeal_id and ap.status = 'pending';
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  update public.moderation_appeals
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = coalesce(v_admin, reviewed_by),
      review_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      reviewed_at = now()
  where id = p_appeal_id;

  if p_approve and coalesce(v_action_active, false) then
    update public.moderation_actions set active = false where id = v_action_id;
    if not exists (
      select 1 from public.moderation_actions
      where user_id = v_user and active and id <> v_action_id
        and action_type in ('restrict','suspend')
    ) then
      update public.profiles
      set restriction_until = null, is_banned = false, ban_reason = null
      where id = v_user;
    end if;
  end if;

  insert into public.notifications (recipient_id, type, title, body, link_url)
  values (v_user, 'social',
    case when p_approve then '✅ قَبِلنا اعتراضك'
         else 'اعتراضك تمت مراجعته' end,
    case when p_approve
      then 'تم قبول اعتراضك ورُفع الإجراء الإشرافي.'
      else 'بعد المراجعة، الإجراء الإشرافي فضل ساري. تقدر تواصل مع الدعم لو عندك جديد.' end,
    '/community');

  insert into public.moderation_audit_log (actor_id, action, target_type, target_id, details)
  values (v_admin, 'appeal_resolved', 'moderation_appeal', p_appeal_id::text,
          jsonb_build_object('approve', p_approve, 'user', v_user, 'notes', p_notes));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mod_resolve_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.mod_resolve_appeal(uuid, boolean, text) to authenticated, service_role;

-- سجل التدقيق للعرض
create or replace function public.mod_list_audit(
  p_limit int default 80
)
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
  return jsonb_build_object('ok', true, 'entries', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'actor_id', l.actor_id,
      'actor_name', sp.display_name,
      'action', l.action, 'target_type', l.target_type,
      'target_id', l.target_id, 'details', l.details,
      'created_at', l.created_at
    ) order by l.created_at desc), '[]'::jsonb)
    from public.moderation_audit_log l
    left join public.social_profiles sp on sp.id = l.actor_id
    limit least(greatest(p_limit, 1), 200)
  ));
end;
$$;

revoke all on function public.mod_list_audit(int) from public, anon;
grant execute on function public.mod_list_audit(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) ملاحظات التشغيل
-- ---------------------------------------------------------------------------
-- ⚠️ الأدمن env-owner (OWNER_EMAIL) مش لازم يكون في site_admins: طبقة الـAPI
--    بتتحقق من صلاحية community.moderate عبر hasPermission وبتنادي الـRPCs
--    دي بـ service_role (auth.uid() = null ⇒ فحص is_site_admin لازم يتخطاه).
--    الحل: نسمح بالاستدعاء لما مفيش جلسة مستخدم (service_role) أو مستخدم أدمن.
-- ---------------------------------------------------------------------------
