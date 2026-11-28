-- ============================================================================
-- 114 — ECONOMY ROUTE WRITERS (P0-D) + LEDGER GUARD
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦ (نسخة ٢ — اعتماد الأجسام الحيّة من الإنتاج)
-- القرارات: D-M-01..D-M-07 · docs/STORE_GAMES_REBUILD_PROPOSAL.md
-- يعتمد على: **db/113-economy-truth.sql لازم يتشغّل الأول**
--
-- ── ليه النسخة دي؟ ──
--  عند التطبيق اتبيّن إن الإنتاج فيه تحويل أسابق للكُتّاب:
--  claim_break_game / claim_daily_mission / claim_weekly_mission /
--  sync_achievements / open_box / spin_wheel كلهم فعلًا بيعدّوا على
--  award_coins أو _award_coins_variable، وفيه حارس coin_ledger شغّال.
--  الأجسام الحيّة أحدث وأدق من اللي في ملفات db/43 وshop.sql (فيها إصلاح
--  باج القرعة المتحيزة في open_box/spin_wheel مثلًا)، فدي النسخة الكانونة
--  المعتمدة: نفس أجسام الإنتاج بالحرف — إعادة تطبيقها idempotent.
--
-- ── الفرق الفعلي اللي الملف ده بيطبّقه ──
--  ١) handle_signup_bonus: كان بيسجّل مباشرة في coin_ledger → اتحوّل على
--     _award_coins_core (نفس دلالات الـ trigger، لكن عبر القاعدة المركزية:
--     تحقق amount/سقف/فهرس فريد ref = profile id).
--  ٢) توثيق الحارس المعتمد (guard_coin_ledger_earn): بيرفض أي كتابة من
--     أدوار الكلاينت (anon/authenticated/service_role) على coin_ledger —
--     دوال definer بتكتب كمالكة فبتعدي. الصرف والتعويض مش متأثرين.
--  ٣) صلاحيات موحّدة: execute لـ authenticated + service_role بس.
--
-- ── الحفاظ على السلوك ──
--  - أسماء أعمدة الـ returns زي ما هي — lib/shop/shop-data.ts بيقراها بالحرف.
--  - game functions الأخرى (answer_break_riddle / answer_break_quiz /
--    solve_escape_step) مش هنا — نسخها الإنتاجية في db/62 بتنداء
--    award_coins بالفعل، وفروع المصادر موجودة في db/113.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ١) claim_break_game — award_coins('break_game')
--    المسار المركزي: المبلغ والسقف من coin_source_rules، والدليل صف المطالبة.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_break_game(p_game text)
 RETURNS TABLE(coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day();
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_break_game: سجّل حساب دائم للبريك'; end if;
  if p_game not in ('memory','reaction','quiz') then raise exception 'claim_break_game: لعبة غير معروفة'; end if;
  if p_game='quiz' and not exists(select 1 from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day and q.solved_at is not null) then return query select 0,0,'أجب عن سؤال Quiz Rush المرتبط بمادتك أولًا'; return; end if;
  if not public.break_studied_today(v_uid) then return query select 0,0,'ذاكر أو خلّص هدف الأول — البريك مكافأة للمذاكرة'; return; end if;
  if (select count(*) from public.break_game_claims where user_id=v_uid and day=v_day) >= 2 then return query select 0,0,'وصلت حد مكافآت الألعاب النهارده'; return; end if;
  insert into public.break_game_claims(user_id,day,game) values(v_uid,v_day,p_game) on conflict do nothing;
  if not found then return query select 0,0,'أخدت مكافأة اللعبة دي النهارده'; return; end if;
  select awarded into coins from public.award_coins('break_game', p_game || ':' || v_day);
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select coins,10, case when coins > 0 then 'مبروك — ٥ كوين و١٠ XP ضمن حد النهارده' else 'حد مكافآت الألعاب اتستنفد النهارده' end;
end; $function$;
revoke all on function public.claim_break_game(text) from public, anon;
grant execute on function public.claim_break_game(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ٢) claim_daily_mission — award_coins('daily_mission')
--    الدليل صف المطالبة + إنجاز المهمة في daily_missions().
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_daily_mission(p_mission text)
 RETURNS TABLE(coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_done boolean;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_daily_mission: سجّل حساب دائم أولًا'; end if;
  select dm.done into v_done from public.daily_missions() dm where dm.mission=p_mission;
  if not found then raise exception 'claim_daily_mission: مهمة غير معروفة'; end if;
  if not v_done then return query select 0,0,'أكمل المهمة الأول ثم استلم مكافأتها'; return; end if;
  insert into public.daily_mission_claims(user_id,day,mission) values(v_uid,v_day,p_mission) on conflict do nothing;
  if not found then return query select 0,0,'استلمت مكافأة المهمة دي بالفعل'; return; end if;
  select awarded into coins from public.award_coins('daily_mission', 'mission:' || p_mission || ':' || v_day);
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select coins, 10, case when coins > 0 then 'تمت المهمة — ٥ كوين و١٠ XP' else 'المهمة مسجّلة لكن المكافأة وصلت حدها' end;
end; $function$;
revoke all on function public.claim_daily_mission(text) from public, anon;
grant execute on function public.claim_daily_mission(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ٣) claim_weekly_mission — award_coins('weekly_mission')
--    الدليل صف المطالبة الأسبوعية.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_weekly_mission()
 RETURNS TABLE(coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_week  text := public.current_quiz_week();
  v_done  boolean;
  v_coins int;
  v_xp    int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'claim_weekly_mission: سجّل حساب دائم أولًا';
  end if;

  select wm.done, wm.coins, wm.xp into v_done, v_coins, v_xp
    from public.weekly_missions() wm
   where wm.id = 'weekly';

  if not found then
    raise exception 'claim_weekly_mission: مفيش مهمة أسبوعية';
  end if;
  if not v_done then
    return query select 0, 0, 'لسه ما كمّلتش شروط مهمة الأسبوع';
  end if;

  insert into public.weekly_mission_claims (user_id, week_key)
  values (v_uid, v_week)
  on conflict do nothing;

  if not found then
    return query select 0, 0, 'استلمت مكافأة الأسبوع ده بالفعل';
  end if;

  select awarded into v_coins from public.award_coins('weekly_mission', 'weekly:' || v_week);

  perform set_config('app.xp_bypass', 'on', true);
  update public.profiles
     set xp = greatest(0, coalesce(xp, 0) + v_xp)
   where id = v_uid;
  perform set_config('app.xp_bypass', 'off', true);

  return query select v_coins, v_xp, case when v_coins > 0 then 'مبروك! مهمة الأسبوع خلصت 🎉' else 'المهمة مسجّلة لكن مكافأة الأسبوع مستلمة بالفعل' end;
end;
$function$;
revoke all on function public.claim_weekly_mission() from public, anon;
grant execute on function public.claim_weekly_mission() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ٤) sync_achievements — _award_coins_variable('achievement')
--    المبلغ من كتالوج الإنجازات، والمطابقة بتتعاد داخل _award_coins_variable.
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
revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ٥) open_box — التعويض عبر _award_coins_variable('box_refund')
--    الخصم spend مباشر، والتعويض متغيّر بيتحقق مقابل shop_refunds.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_box(p_box_id text)
 RETURNS TABLE(item_id text, rarity text, duplicate boolean, refunded integer, spent integer, balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_price    int;
  v_odds     jsonb;
  v_max_ref  int;
  v_balance  int;
  v_item     text;
  v_rarity   text;
  v_dup      boolean := false;
  v_refund   int := 0;
  /* ⚠️⚠️ القرعة **لازم** تتحسب في متغير قبل الاستعلام. `random()` دالة
     volatile، يعني لو اتكتبت جوه `where` بتتحسب **من جديد لكل صف** —
     فكل صف بياخد قرعة مستقلة بدل ما يكون فيه رقم واحد بيقع في المجموع
     التراكمي، والاحتمالات الناتجة مالهاش علاقة بالأوزان (الانحياز
     بيروح للصفوف الأول في `order by id`). ده كان باج حقيقي هنا:
     صندوق الورق كانت قيمته المتوقّعة ٣٢١ وسعره ٢٦٠ — **ميل بيت سالب**،
     يعني مضخة كوينز. ومفيش فحص في scripts/shop-seed.mjs يقدر يمسكه،
     لأن السكربت بيحسب رياضيات النية مش سلوك الاستعلام. */
  v_roll     numeric;
begin
  if v_uid is null then
    raise exception 'open_box: لازم تكون داخل بحسابك';
  end if;

  -- الزائر المجهول جلسته role = authenticated زي أي حد، فالتمييز لازم
  -- يبقى من التوكن نفسه. نفس فحص award_coins.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'open_box: الصناديق للحسابات المسجّلة بس';
  end if;

  select price, odds into v_price, v_odds
    from public.shop_boxes where id = p_box_id;

  if not found then
    raise exception 'open_box: صندوق مش موجود: %', p_box_id;
  end if;

  -- 🔒 فحص المضخة. لاحظ إنه **قبل** الخصم: لو الإعدادات غلط، المستخدم
  -- ماينفعش يدفع أصلاً.
  select max(r.coins) into v_max_ref
    from public.shop_refunds r
   where coalesce((v_odds ->> r.rarity)::int, 0) > 0;

  if v_max_ref is not null and v_max_ref >= v_price then
    raise exception
      'open_box: إعدادات الصندوق % غلط — أقصى تعويض % والسعر %. الصندوق مقفول لحد ما يتصلّح.',
      p_box_id, v_max_ref, v_price;
  end if;

  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  -- 🔒 نفس قفل purchase_item: طلبين في نفس اللحظة كانوا هيقروا نفس الرصيد
  -- ويفتحوا صندوقين بسعر واحد.
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  if v_balance < v_price then
    raise exception 'open_box: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, v_price;
  end if;

  /* السحب: وزن كل **عنصر** = وزن ندرته ÷ عدد عناصر الندرة المؤهّلة.

     يعني الوزن على الندرة مش على العنصر: إضافة عنصر أسطوري جديد بتقلّل
     فرصة كل عنصر أسطوري لوحده وبتسيب فرصة «تطلّع أسطوري» زي ما هي.

     والقسمة دي كمان بتحل مشكلة الندرة الفاضية لوحدها: ندرة بلا عناصر
     مؤهّلة مش بتدخل البركة خالص، فوزنها بيتوزّع على الباقي بالتناسب بدل
     ما السحب يقع في فراغ. */
  v_roll := random();

  with pool as (
    select c.id,
           c.rarity as rar,
           ((v_odds ->> c.rarity)::numeric
             / count(*) over (partition by c.rarity)) as w
      from public.shop_catalog c
     where c.price > 0
       and c.unlock is null
       and c.slot is not null
       and c.rarity is not null
       and coalesce((v_odds ->> c.rarity)::int, 0) > 0
  ),
  cum as (
    select id, rar,
           sum(w) over (order by id rows between unbounded preceding and current row) as upto,
           sum(w) over () as total
      from pool
  )
  select id, rar into v_item, v_rarity
    from cum
   where upto >= v_roll * total
   order by upto
   limit 1;

  if v_item is null then
    raise exception 'open_box: مفيش عناصر مؤهّلة في الصندوق ده دلوقتي';
  end if;

  v_dup := exists (
    select 1 from public.shop_inventory
     where user_id = v_uid and shop_inventory.item_id = v_item
  );

  -- الخصم أول حاجة بعد ما النتيجة بقت معروفة — والتمليك/التعويض بعده في
  -- نفس المعاملة.
  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata)
  values (v_uid, 'box', -v_price, 'spend', p_box_id,
          jsonb_build_object('item', v_item, 'rarity', v_rarity, 'dup', v_dup));

  if v_dup then
    select coins into v_refund from public.shop_refunds where shop_refunds.rarity = v_rarity;
    v_refund := coalesce(v_refund, 0);

    -- الحزام والحمّالة: الفحص فوق على أقصى تعويض في الصندوق كله، وده على
    -- التعويض الفعلي. لو الاتنين اتخطّوا، المعاملة بترجع كلها.
    if v_refund >= v_price then
      raise exception 'open_box: تعويض % أكبر من سعر الصندوق % — مقفول', v_refund, v_price;
    end if;

    if v_refund > 0 then
      /* Phase 0: التعويض يمر عبر _award_coins_variable (مبلغ متغير)،
         والمبلغ يُتحقق منه مقابل shop_refunds داخل السيرفر.
         `ref_id` يفضل null عن قصد: التعويضات المتعددة مشروعة خلال اليوم،
         ومحدودة بعملية فتح صندوق فعلية (خصم حقيقي في نفس المعاملة). */
      select awarded into v_refund from public._award_coins_variable(
        'box_refund',
        null,
        v_refund,
        jsonb_build_object('box', p_box_id, 'item', v_item, 'rarity', v_rarity, 'dup', v_dup)
      );
    end if;
  else
    insert into public.shop_inventory (user_id, item_id) values (v_uid, v_item);
  end if;

  return query select v_item, v_rarity, v_dup, v_refund, v_price,
                      (v_balance - v_price + v_refund);
end;
$function$;
revoke all on function public.open_box(text) from public, anon;
grant execute on function public.open_box(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ٦) spin_wheel — الجائزة عبر _award_coins_variable('wheel')
--    الجائزة بيتحقق منها مقابل shop_wheel_prizes، وref = يوم القاهرة.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spin_wheel()
 RETURNS TABLE(prize_id text, label text, coins integer, balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_day   text := ((now() at time zone 'utc')::date)::text;
  v_id    text;
  v_label text;
  v_coins int;
  /* ⚠️ قرعة واحدة في متغير — نفس السبب المشروح بالتفصيل في `open_box`.
     هنا الباج كان بيرفع القيمة المتوقّعة من ١٨.٥ لـ ٣٦.١ كوين للفة،
     وجايزة الـ١٢٠ كانت بتطلع ١٧.٩٪ بدل ١٪. */
  v_roll  numeric;
begin
  if v_uid is null then
    raise exception 'spin_wheel: لازم تكون داخل بحسابك';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'spin_wheel: العجلة للحسابات المسجّلة بس';
  end if;

  -- 🔒 قفل المحفظة: لفّتين في نفس اللحظة كانوا هيعدّوا الفحص سوا. الفهرس
  -- الفريد تحت بيمسك الحالة دي كمان، بس القفل بيخلّي التانية تستنى
  -- وتطلّع رسالة مفهومة بدل خطأ قيد.
  insert into public.coin_wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  perform 1 from public.coin_wallets where user_id = v_uid for update;

  if exists (
    select 1 from public.coin_ledger
     where user_id = v_uid and source = 'wheel'
       and source_type = 'earn' and ref_id = v_day
  ) then
    raise exception 'spin_wheel: لفّيت النهارده خلاص — تعالى بكرة';
  end if;

  -- شرط المذاكرة. مقصود إنه بعد فحص «لفّيت خلاص»: اللي لف بيعرف إنه لف،
  -- مش بيتقاله «ذاكر الأول».
  if not exists (
    select 1 from public.coin_ledger
     where user_id = v_uid
       and source in ('day_done', 'goal_done')
       and source_type = 'earn'
       -- مش `::timestamptz` — الشرح عند السقف اليومي في award_coins. هنا
       -- الغلط كان بيمنع لفة مستحقة: بأوفست سالب مذاكرة أول اليوم بـ UTC
       -- بتقع بره النافذة، فالعجلة تقول «ذاكر الأول» لواحد ذاكر فعلاً.
       and created_at >= (((now() at time zone 'utc')::date)::timestamp
                          at time zone 'utc')
  ) then
    raise exception 'spin_wheel: ذاكر حاجة النهارده الأول — العجلة مكافأة مذاكرة';
  end if;

  -- سحب موزون. نفس فكرة الصناديق: مجموع تراكمي وقرعة واحدة في السيرفر.
  v_roll := random();

  /* ⚠️⚠️ الأعمدة متسمّية `p_*` عن قصد — مش تنميق.

     `returns table (prize_id, label, coins, balance)` بيعرّف الأربعة دول
     **كمتغيّرات** في نطاق جسم الدالة كله. فـ `select id, label, coins`
     على `shop_wheel_prizes` (وفيها عمودين بالاسمين دول) بيرمي وقت
     التشغيل:

         column reference "label" is ambiguous

     ولاحظ إن `id` ماكانش بيشتكي لأن اسم الخروج `prize_id` مش `id` —
     يعني الفخ بيضرب الأعمدة اللي اتفق اسمها بس، وده اللي بيخليه يعدّي
     من المراجعة بالعين.

     نفس السبب اللي خلّى `open_box` تكتب `c.rarity as rar`. القاعدة:
     أي عمود في `returns table` اسمه زي عمود في جدول الاستعلام لازم
     يتغيّر اسمه في الاستعلام. التسمية هنا أأمن من التقييد بـ `cum.label`
     لأنها بتفضل صح لو حد ضاف CTE تاني أو غيّر الأسماء بعدين.

     ⚠️ أسماء الخروج نفسها ممنوع تتغيّر — `lib/shop/shop-data.ts` بيقرا
     `row.prize_id` و`row.label` بالحرف. */
  with cum as (
    select w.id    as p_id,
           w.label as p_label,
           w.coins as p_coins,
           sum(w.weight) over (order by w.id rows between unbounded preceding and current row) as upto,
           sum(w.weight) over () as total
      from public.shop_wheel_prizes w
  )
  select p_id, p_label, p_coins into v_id, v_label, v_coins
    from cum
   where upto >= v_roll * total
   order by upto
   limit 1;

  if v_id is null then
    raise exception 'spin_wheel: مفيش جوايز متسجّلة';
  end if;

  /* الفهرس الفريد على (user_id, source, ref_id) هو الحد الحقيقي: حتى لو
     الفحص فوق اتخطّى بأي طريقة، الصف التاني في نفس اليوم بيفشل. */
  select awarded into v_coins from public._award_coins_variable('wheel', v_id, v_coins, jsonb_build_object('prize', v_id));

  return query
    select v_id, v_label, v_coins,
           coalesce((select sum(amount) from public.coin_ledger where user_id = v_uid), 0)::int;
end;
$function$;
revoke all on function public.spin_wheel() from public, anon;
grant execute on function public.spin_wheel() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- ٧) handle_signup_bonus — التحويل الفعلي في الملف ده
--    كان بيسجّل مباشرة في coin_ledger → بيمرّ على _award_coins_core.
--    الـ trigger يفضل هو المسار الأساسي لأن التسجيل بيحصل على insert في profiles.
-- ----------------------------------------------------------------------------
create or replace function public.handle_signup_bonus()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $$
declare
  v_amount int;
begin
  -- استثناء الزائر المجهول — لا نمنح
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return new;
  end if;

  select amount into v_amount from public.coin_source_rules
   where id = 'signup_bonus' and is_live = true;
  if not found then
    return new;
  end if;

  -- المسار المركزي: تحقق amount مقابل القاعدة + السقف + الفهرس الفريد
  -- (user, 'signup_bonus', ref = profile id) يمنع التكرار حتى لو الـ
  -- trigger اتنادى أكتر من مرة لنفس الملف.
  perform public._award_coins_core(
    new.id, 'signup_bonus', new.id::text, v_amount,
    jsonb_build_object('trigger', 'profile_insert')
  );

  return new;
end;
$$;
drop trigger if exists trg_signup_bonus on public.profiles;
create trigger trg_signup_bonus
after insert on public.profiles
for each row execute function public.handle_signup_bonus();

-- ----------------------------------------------------------------------------
-- ٨) الحارس — أي كتابة كلاينت مباشرة على coin_ledger بترفض (C1 — Phase 0)
--    المعتمد من الإنتاج: الفحص بـ current_user — دوال definer بتكتب كمالكة
--    (postgres) فبتعدي، وأي insert/update/delete من anon/authenticated/
--    service_role بيرفض. الكسب والإصدار بيمروا من award_coins /
--    _award_coins_variable / add_coins_grant فقط (db/113+114).
-- ----------------------------------------------------------------------------
create or replace function public.guard_coin_ledger_earn()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_catalog'
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception
      'coin_ledger: client writes are not allowed — use award_coins()/server RPC (current_user=%)',
      current_user;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_coin_ledger_earn_guard on public.coin_ledger;
create trigger trg_coin_ledger_earn_guard
before insert or delete or update on public.coin_ledger
for each row execute function public.guard_coin_ledger_earn();

