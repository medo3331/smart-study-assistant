
-- ===== grant_badge =====
CREATE OR REPLACE FUNCTION public.grant_badge(p_config_id uuid, p_chapter_number integer, p_title text, p_subject text, p_accuracy integer)
 RETURNS TABLE(badge_id uuid, already_existed boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_new_id uuid;
  v_days_count int;
  v_max_chapter int;
  v_has_completed boolean := false;
begin
  if v_uid is null then
    raise exception 'grant_badge: not authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'grant_badge: anonymous not allowed';
  end if;
  if p_config_id is null then
    raise exception 'grant_badge: p_config_id required';
  end if;
  if p_chapter_number is null or p_chapter_number < 1 or p_chapter_number > 1000 then
    raise exception 'grant_badge: invalid p_chapter_number';
  end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then
    raise exception 'grant_badge: p_accuracy must be 0..100';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'grant_badge: p_title required';
  end if;
  if length(p_title) > 200 then
    raise exception 'grant_badge: p_title too long';
  end if;

  -- ملكية التراك
  select days_count into v_days_count
  from public.study_configs
  where id = p_config_id and user_id = v_uid;

  if not found then
    raise exception 'grant_badge: config not found for user';
  end if;

  v_days_count := coalesce(v_days_count, 0);
  -- CHAPTER_SIZE = 5 (موحد في app/dashboard/components/StudySections.tsx)
  v_max_chapter := greatest(1, ceil(v_days_count::float / 5));
  -- السماح بفصل واحد إضافي للمرونة (boss قد يظهر بعد إكمال الفصل)
  if p_chapter_number > v_max_chapter + 1 then
    raise exception 'grant_badge: chapter % out of range (max %)', p_chapter_number, v_max_chapter;
  end if;

  -- إثبات إنجاز: على الأقل يوم مكتمل في هذا التراك
  -- (لا نطلب كل أيام الفصل الخمسة — يكفي أن المستخدم ذاكر فعلاً)
  select exists(
    select 1 from public.study_days d
    where d.user_id = v_uid
      and d.config_id = p_config_id
      and coalesce(d.is_completed,false) = true
  ) into v_has_completed;

  if not v_has_completed then
    raise exception 'grant_badge: complete at least one study day before earning a badge';
  end if;

  -- منع التكرار
  select id into v_existing
  from public.badges
  where user_id = v_uid
    and config_id = p_config_id
    and chapter_number = p_chapter_number
  limit 1;

  if v_existing is not null then
    return query select v_existing, true::boolean, 'Badge already earned'::text;
    return;
  end if;

  insert into public.badges (user_id, config_id, chapter_number, title, subject, accuracy)
  values (v_uid, p_config_id, p_chapter_number, btrim(p_title), p_subject, p_accuracy)
  returning id into v_new_id;

  return query select v_new_id, false::boolean, 'Badge granted'::text;
end;
$function$


-- ===== sync_achievements =====
CREATE OR REPLACE FUNCTION public.sync_achievements()
 RETURNS TABLE(achievement_id text, icon text, title text, requirement text, target integer, progress integer, coins integer, xp integer, unlocked boolean, unlocked_at timestamp with time zone, newly boolean, sort_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_days     int := 0;
  v_streak   int := 0;
  v_level    int := 1;
  v_badges   int := 0;
  v_courses  int := 0;
  v_new      text[] := '{}';
  v_row      public.achievements_catalog%rowtype;
  v_progress int;
begin
  if v_uid is null then
    raise exception 'sync_achievements: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sync_achievements: سجّل حساب دائم الأول';
  end if;

  -- الأرقام اللي الإنجازات بتقيس عليها — كلها من الداتابيز، مش من الكلاينت.
  select count(*) into v_days
    from public.study_days
   where user_id = v_uid and is_completed = true;

  select coalesce(streak, 0), (floor(greatest(coalesce(xp, 0), 0) / 200)::int + 1)
    into v_streak, v_level
    from public.profiles
   where id = v_uid;

  if not found then
    raise exception 'sync_achievements: profile not found';
  end if;

  select count(*) into v_badges
    from public.badges
   where user_id = v_uid;

  -- تراك كامل = كل مراحله مكتملة (نفس تعريف الواجهة: totalDays > 0 && completed >= total).
  select count(*) into v_courses
    from (
      select c.id
        from public.study_configs c
        join public.study_days d
          on d.config_id = c.id and d.user_id = c.user_id
       where c.user_id = v_uid
       group by c.id
      having count(*) > 0
         and count(*) filter (where d.is_completed) >= count(*)
    ) finished;

  for v_row in select * from public.achievements_catalog order by sort_order loop
    v_progress := case v_row.kind
      when 'days_done' then v_days
      when 'streak'    then v_streak
      when 'level'     then v_level
      when 'badges'    then v_badges
      when 'courses'   then v_courses
      else 0
    end;

    if v_progress < v_row.target then
      continue;
    end if;

    insert into public.user_achievements (user_id, achievement_id, coins, xp)
    values (v_uid, v_row.id, v_row.coins, v_row.xp)
    on conflict (user_id, achievement_id) do nothing;

    -- مفتاح الإنجاز لسه ما كانش موجود ⇒ ده أول مرة ⇒ استحق المكافأة.
    if found then
      v_new := array_append(v_new, v_row.id);

      if v_row.coins > 0 then
        /* المرجع مركّب من معرّف الإنجاز — الفهرس الفريد (user_id, source, ref_id)
           بيضمن إن الكوينز ما تتكررش حتى لو الدالة اتنادت في نفس اللحظة من
           تابّين. السقف اليومي مش مستخدم هنا لأن الإنجاز بيحصل مرة/حياة. */
        perform public._award_coins_variable(
          'achievement',
          'achievement:' || v_row.id,
          v_row.coins,
          jsonb_build_object('achievement', v_row.id)
        );
      end if;

      if v_row.xp > 0 then
        perform set_config('app.xp_bypass', 'on', true);
        update public.profiles
           set xp = greatest(0, coalesce(xp, 0) + v_row.xp)
         where id = v_uid;
        perform set_config('app.xp_bypass', 'off', true);
      end if;
    end if;
  end loop;

  return query
    select c.id,
           c.icon,
           c.title,
           c.requirement,
           c.target,
           (case c.kind
              when 'days_done' then v_days
              when 'streak'    then v_streak
              when 'level'     then v_level
              when 'badges'    then v_badges
              when 'courses'   then v_courses
              else 0
            end) as progress,
           c.coins,
           c.xp,
           (ua.user_id is not null) as unlocked,
           ua.unlocked_at,
           (c.id = any(v_new)) as newly,
           c.sort_order
      from public.achievements_catalog c
      left join public.user_achievements ua
        on ua.user_id = v_uid and ua.achievement_id = c.id
     order by c.sort_order;
end;
$function$

