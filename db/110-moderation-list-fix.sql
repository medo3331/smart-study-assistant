-- ===========================================================================
-- MAGICLY — Community C10: إصلاح دوال عرض طوابير الإشراف
-- ---------------------------------------------------------------------------
-- الغلطة: كل الدوال بتعمل join على social_profiles بعمود id غير موجود
-- (المفتاح الصحيح user_id) — فأي GET للوحة الإشراف كان بيحوّل النتيجة
-- لقائمة فاضية (RPC error → pick() يرجع {}) رغم إن التقارير محفوظة.
-- الإصلاح: sp.id → sp.user_id في mod_list_reports / mod_list_actions /
-- mod_list_appeals / mod_list_audit (بما فيها فرع target_author_name
-- للمستخدمين).
-- ===========================================================================

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
                          join public.social_profiles sp2 on sp2.user_id = p2.author_id
                          where p2.id = r.target_id)
        when 'comment' then (select sp3.display_name from public.community_comments c3
                             join public.social_profiles sp3 on sp3.user_id = c3.author_id
                             where c3.id = r.target_id)
        else (select sp4.display_name from public.social_profiles sp4 where sp4.user_id = r.target_id) end,
      'pending_count', (select count(*) from public.content_reports r2
                        where r2.target_type = r.target_type and r2.target_id = r.target_id
                          and r2.status = 'pending')
    ) order by r.created_at desc), '[]'::jsonb)
    from public.content_reports r
    left join public.social_profiles sp on sp.user_id = r.reporter_id
    where r.status = p_status
    limit least(greatest(p_limit, 1), 100)
  ));
end;
$$;

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
    left join public.social_profiles sp on sp.user_id = a.user_id
    left join public.profiles pr on pr.id = a.user_id
    where (not p_active_only or a.active)
    limit least(greatest(p_limit, 1), 100)
  ));
end;
$$;

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
    left join public.social_profiles sp on sp.user_id = ap.user_id
    left join public.profiles pr on pr.id = ap.user_id
    where ap.status = p_status
    limit least(greatest(p_limit, 1), 100)
  ));
end;
$$;

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
    left join public.social_profiles sp on sp.user_id = l.actor_id
    limit least(greatest(p_limit, 1), 200)
  ));
end;
$$;

revoke all on function public.mod_list_reports(text, int) from public, anon;
grant execute on function public.mod_list_reports(text, int) to authenticated, service_role;
revoke all on function public.mod_list_actions(boolean, int) from public, anon;
grant execute on function public.mod_list_actions(boolean, int) to authenticated, service_role;
revoke all on function public.mod_list_appeals(text, int) from public, anon;
grant execute on function public.mod_list_appeals(text, int) to authenticated, service_role;
revoke all on function public.mod_list_audit(int) from public, anon;
grant execute on function public.mod_list_audit(int) to authenticated, service_role;
