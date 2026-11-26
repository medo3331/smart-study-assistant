-- ============================================================================
-- G0-C (Engagement Engine) — Badges / Achievements Proof
-- Date: 2026-11-21
-- Branch: feat/engagement-p1b2-discovery
--
-- GOAL:
--   Make badge earning and achievement unlocking produce trusted engagement
--   events, and fix the ONE vulnerability that directly breaks badge proof:
--   the live client INSERT policy on public.badges.
--
-- ── مصدر الإثبات المُحدد (G0-C audit, الإنتاج) ─────────────────────────────
--   1. Badge: `public.grant_badge(uuid,int,text,text,int)` — SECURITY
--      DEFINER: هوية من auth.uid()، ملكية التراك، حدود الفصل (days_count/5)،
--      إثبات دراسة (يوم مكتمل واحد على الأقل)، منع تكرار (user, config,
--      chapter). العنوان/المادة/الدقة زخرفة من العميل — ليست مدخلات مكافأة.
--   2. Achievement: `public.sync_achievements()` — SECURITY DEFINER: كل
--      المقاييس محسوبة من الداتابيز (أيام مكتملة، سلسلة، مستوى، عدد الأوسمة،
--      تراكات مكتملة)، كتابة user_achievements داخل الدالة فقط، مكافأة
--      عبر _award_coins_variable بمرجع فريد (idempotent).
--
-- ── الثغرة المُصلَحة (تؤثر مباشرة على إثبات الأوسمة) ───────────────────────
--   سياسة `badges: owner writes` (INSERT) تسمح لأي authenticated بإدراج صف
--   وسام مزيّف: مكافأة 'badge' (٤٠ كوين ×٣/يوم) تُدفع بناءً على وجود الصف،
--   و`sync_achievements` تعدّ الأوسمة ⇒ إنجاز 'first-boss' المزيّف.
--   الإصلاح: حذف سياسة الإدخال — الكتابة عبر grant_badge فقط (definer)،
--   مع الحفاظ على قراءة المالك. (fallback الإدراج المباشر في BossFight
--   يبقى للتوافق مع قواعد قديمة، لكنه يفشل بعد الترحيل — ومع وجود
--   grant_badge في نفس الترحيل فالمسار الأساسي ينجح دائمًا).
--
-- ── الأحداث ───────────────────────────────────────────────────────────────
--   * badge_earned        — source: badges, source_id: badge UUID
--                           metadata: [chapter_number, accuracy, subject]
--   * achievement_unlocked — source: user_achievements, source_id: معرف
--                           الإنجاز (نص) — metadata: [metric, progress]
--   trust_level = 'server' لكليهما؛ verified_by تكتبه دالة الإدخال بنفسها.
--   الإصدار exception-safe (فشل الحدث لا يلغي الوسام/الإنجاز ولا مكافأته)،
--   داخل نفس المعاملة، وبعد تأكيد الحدث الفعلي (وسام جديد/إنجاز أول مرة).
--   إعادة الاستدعاء تعيد مبكرًا (already_existed / on conflict do nothing)
--   ⇒ لا أحداث مكررة.
--
-- ⚠️ لا تغيير على المكافآت: نصوص المكافآت في الدالتين محفوظة حرفيًا من
--    التعريفات الإنتاجية (docs/artifacts/g0c-production-badge-functions.sql).
--
-- DEPLOYMENT NOTE:
--   لا يُطبّق على الإنتاج بدون تفويض صريح. التحقق على Local/Staging فقط
--   (scripts/g0c-badges-achievements-verify.mjs يرفض الإنتاج بفشل مغلق).
--
-- ROLLBACK:
--   delete from public.engagement_event_types
--     where event_type in ('badge_earned','achievement_unlocked');
--   create policy "badges: owner writes" on public.badges
--     for insert with check (auth.uid() = user_id);   -- إرجاع السياسة القديمة
--   -- استعادة الدالتين من docs/artifacts/g0c-production-badge-functions.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) سجل الأنواع: حدثا الإثبات (server trust) — بذر idempotent
-- ----------------------------------------------------------------------------
INSERT INTO public.engagement_event_types
  (event_type, source_table, trust_level, allowed_metadata_keys, max_metadata_bytes,
   max_events_per_hour, description, is_active)
VALUES
  ('badge_earned', 'badges', 'server',
     ARRAY['chapter_number', 'accuracy', 'subject'],
     2048, 10,
     'كسب وسام فصل: يُصدر من داخل grant_badge (SECURITY DEFINER) بعد تأكيد ملكية التراك وحدود الفصل وإثبات يوم مكتمل، وفي نفس معاملة إدراج الوسام. حدث واحد لكل وسام على الإطلاق.',
     true),
  ('achievement_unlocked', 'user_achievements', 'server',
     ARRAY['metric', 'progress'],
     2048, 5,
     'فتح إنجاز: يُصدر من داخل sync_achievements (SECURITY DEFINER) عند أول فتح فقط (on conflict do nothing)، والمقاييس محسوبة من الداتابيز بالكامل. معرّف الإنجاز نص ثابت ⇒ حدث واحد لكل إنجاز.',
     true)
ON CONFLICT (event_type) DO UPDATE SET
  source_table = EXCLUDED.source_table,
  trust_level = EXCLUDED.trust_level,
  allowed_metadata_keys = EXCLUDED.allowed_metadata_keys,
  max_metadata_bytes = EXCLUDED.max_metadata_bytes,
  max_events_per_hour = EXCLUDED.max_events_per_hour,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- ٢) إصلاح مصدر الإثبات: الكتابة على badges عبر grant_badge فقط
--    (قراءة المالك محفوظة — لا حذف بيانات، لا تغيير أعمدة)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "badges: owner writes" ON public.badges;
DROP POLICY IF EXISTS "users manage their own badges" ON public.badges;

-- ----------------------------------------------------------------------------
-- ٣) grant_badge — المصدر الإنتاجي الحرفي + إصدار الحدث
-- ----------------------------------------------------------------------------
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

  -- G0-C: إصدار حدث الوسام الموثّق عبر مسار الإدخال الموثوق (P1-B2).
  --   * فقط عند إنشاء وسام جديد (إعادة الاستدعاء تعيد قبل هذه الكتلة).
  --   * بعد تأكيد الإدراج، وفي نفس المعاملة (rollback = لا وسام ولا حدث).
  --   * فشل الحدث لا يلغي الوسام ولا مكافأته (exception-safe).
  begin
    perform public.record_engagement_event(
      'badge_earned',
      'badges',
      v_new_id::text,
      v_uid,
      jsonb_build_object(
        'chapter_number', p_chapter_number,
        'accuracy', p_accuracy,
        'subject', p_subject
      ),
      now()
    );
  exception when others then
    raise warning 'grant_badge: engagement event emission failed: %', sqlerrm;
  end;

  return query select v_new_id, false::boolean, 'Badge granted'::text;
end;
$function$;

-- ----------------------------------------------------------------------------
-- ٤) sync_achievements — المصدر الإنتاجي الحرفي + إصدار الحدث عند أول فتح
-- ----------------------------------------------------------------------------
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

      -- G0-C: إصدار حدث الفتح الموثّق (أول مرة فقط، نفس المعاملة،
      --   exception-safe — فشل الحدث لا يلغي الإنجاز ولا مكافأته).
      begin
        perform public.record_engagement_event(
          'achievement_unlocked',
          'user_achievements',
          v_row.id,
          v_uid,
          jsonb_build_object(
            'metric', v_row.kind,
            'progress', v_progress
          ),
          now()
        );
      exception when others then
        raise warning 'sync_achievements: engagement event emission failed: %', sqlerrm;
      end;

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
$function$;

-- ----------------------------------------------------------------------------
-- ٥) إعادة تثبيت الصلاحيات (نفس حدود ما قبل الترحيل)
-- ----------------------------------------------------------------------------
revoke all on function public.grant_badge(uuid, integer, text, text, integer) from public;
revoke all on function public.sync_achievements() from public;
grant execute on function public.grant_badge(uuid, integer, text, text, integer) to authenticated;
grant execute on function public.sync_achievements() to authenticated;

COMMIT;
