-- ============================================================================
-- 114 — ECONOMY ROUTE WRITERS (P0-D) + LEDGER GUARD
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القرارات: D-M-01..D-M-07 · docs/STORE_GAMES_REBUILD_PROPOSAL.md
-- يعتمد على: **db/113-economy-truth.sql لازم يتشغّل الأول**
--
-- ── اللي الملف ده بيعمله ──
--  ١) تحويل آخر الكتابات المباشرة في coin_ledger إلى المسار المركزي:
--     claim_break_game / claim_daily_mission / claim_weekly_mission /
--     sync_achievements (إنجازات variable) / open_box (تعويض variable) /
--     spin_wheel (جائزة variable) / handle_signup_bonus (trigger + bypass).
--  ٢) حارس coin_ledger: أي insert لكسب (source_type='earn') من غير
--     app.coin_bypass بيرفض — أي دالة definer مستقبلية تنسى المسار
--     بتفشل فورًا بدل ما توزّع كوينز في صمت (C1 — Phase 0).
--     الحارس بيتفعّل هنا فقط لأن كل الكتابات المعروفة اتحولت في نفس
--     الملف — لو رجّعت ملفًا قديمًا (45/43/shop.sql) بعد 114، دواله
--     القديمة هتكتب مباشرة والحارس هيوقفها بدل ما يوزّع.
--
-- ── الحفاظ على السلوك ──
--  - كل دالة بتحتفظ بتحققها الأصلي من الحدث (قاعدة P0-D) — award_coins
--    بيعيد التحقق كطبقة تانية.
--  - المبالغ والـ XP والرسائل زي ما هي. أسماء أعمدة الـ returns زي ما هي
--    (lib/shop/shop-data.ts بيقراها بالحرف).
--  - game functions الأخرى (answer_break_riddle / answer_break_quiz /
--    solve_escape_step) **مش هنا** — نسخها الإنتاجية في db/62 بتنداء
--    award_coins بالفعل، وفرع المصادر بقى موجود في db/113.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ١) claim_break_game — كان بينسجل مباشرة → award_coins('break_game')
--    (الجسم من db/43 — الإنتاج)
-- ----------------------------------------------------------------------------
create or replace function public.claim_break_game(p_game text)
returns table(coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_awarded int := 0;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_break_game: سجّل حساب دائم للبريك'; end if;
  if p_game not in ('memory','reaction','quiz') then raise exception 'claim_break_game: لعبة غير معروفة'; end if;
  if p_game='quiz' and not exists(select 1 from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day and q.solved_at is not null) then return query select 0,0,'أجب عن سؤال Quiz Rush المرتبط بمادتك أولًا'; return; end if;
  if not public.break_studied_today(v_uid) then return query select 0,0,'ذاكر أو خلّص هدف الأول — البريك مكافأة للمذاكرة'; return; end if;
  if (select count(*) from public.break_game_claims where user_id=v_uid and day=v_day) >= 2 then return query select 0,0,'وصلت حد مكافآت الألعاب النهارده'; return; end if;
  insert into public.break_game_claims(user_id,day,game) values(v_uid,v_day,p_game) on conflict do nothing;
  if not found then return query select 0,0,'أخدت مكافأة اللعبة دي النهارده'; return; end if;
  -- المسار المركزي: المبلغ والسقف من coin_source_rules، والتحقق من صف المطالبة
  select awarded into v_awarded from public.award_coins('break_game', p_game||':'||v_day::text, jsonb_build_object('game',p_game));
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select v_awarded,10,case when v_awarded>0 then 'مبروك — ٥ كوين و١٠ XP ضمن حد النهارده' else 'وصلت سقف مكافآت الألعاب النهارده' end;
end; $$;

revoke all on function public.claim_break_game(text) from public, anon;
grant execute on function public.claim_break_game(text) to authenticated;

-- ----------------------------------------------------------------------------
-- ٢) claim_daily_mission — كان بينسجل مباشرة → award_coins('daily_mission')
-- ----------------------------------------------------------------------------
create or replace function public.claim_daily_mission(p_mission text)
returns table(coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_done boolean; v_awarded int := 0;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_daily_mission: سجّل حساب دائم أولًا'; end if;
  select dm.done into v_done from public.daily_missions() dm where dm.mission=p_mission;
  if not found then raise exception 'claim_daily_mission: مهمة غير معروفة'; end if;
  if not v_done then return query select 0,0,'أكمل المهمة الأول ثم استلم مكافأتها'; return; end if;
  insert into public.daily_mission_claims(user_id,day,mission) values(v_uid,v_day,p_mission) on conflict do nothing;
  if not found then return query select 0,0,'استلمت مكافأة المهمة دي بالفعل'; return; end if;
  select awarded into v_awarded from public.award_coins('daily_mission', 'mission:'||p_mission||':'||v_day::text, jsonb_build_object('mission',p_mission));
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select v_awarded,10,case when v_awarded>0 then 'تمت المهمة — ٥ كوين و١٠ XP' else 'وصلت سقف مهام اليوم' end;
end; $$;

revoke all on function public.claim_daily_mission(text) from public, anon;
grant execute on function public.claim_daily_mission(text) to authenticated;

-- ----------------------------------------------------------------------------
-- ٣) claim_weekly_mission — كان بينسجل مباشرة → award_coins('weekly_mission')
--    (الجسم من db/45)
-- ----------------------------------------------------------------------------
create or replace function public.claim_weekly_mission()
returns table (coins int, xp int, message text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid     uuid := auth.uid();
  v_week    text := public.current_quiz_week();
  v_done    boolean;
  v_xp      int;
  v_awarded int := 0;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'claim_weekly_mission: سجّل حساب دائم أولًا';
  end if;

  select wm.done, wm.xp into v_done, v_xp
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

  select awarded into v_awarded
    from public.award_coins('weekly_mission', 'weekly:' || v_week,
                            jsonb_build_object('week', v_week));

  perform set_config('app.xp_bypass', 'on', true);
  update public.profiles
     set xp = greatest(0, coalesce(xp, 0) + v_xp)
   where id = v_uid;
  perform set_config('app.xp_bypass', 'off', true);

  return query select v_awarded, v_xp,
    case when v_awarded > 0 then 'مبروك! مهمة الأسبوع خلصت 🎉'
         else 'وصلت سقف مكافآت النهارده' end;
end;
$$;

revoke all on function public.claim_weekly_mission() from public, anon;
grant execute on function public.claim_weekly_mission() to authenticated;

-- ----------------------------------------------------------------------------
-- ٤) sync_achievements — كان بينسجل مباشرة → _award_coins_variable
--    (الجسم من db/45 — التغيير الوحيد: بلوك الكوينز)
-- ----------------------------------------------------------------------------
create or replace function public.sync_achievements()
returns table (
  achievement_id text,
  icon           text,
  title          text,
  requirement    text,
  target         int,
  progress       int,
  coins          int,
  xp             int,
  unlocked       boolean,
  unlocked_at    timestamptz,
  newly          boolean,
  sort_order     int
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
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
  v_awarded  int;
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
        /* المرجع = معرّف الإنجاز — الفهرس الفريد يمنع التكرار حتى من
           تابّين. المبلغ من كتالوج الإنجازات (سيرفر) عبر المسار المتغيّر. */
        perform set_config('app.coin_bypass', 'on', true);
        v_awarded := public._award_coins_variable(
          'achievement',
          'achievement:' || v_row.id,
          v_row.coins,
          jsonb_build_object('achievement', v_row.id)
        );
        perform set_config('app.coin_bypass', 'off', true);
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
$$;

revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated;

-- ----------------------------------------------------------------------------
-- ٥) open_box — التعويض كان بينسجل مباشرة → _award_coins_variable
--    (الجسم من db/shop.sql — التغيير الوحيد: بلوك box_refund)
-- ----------------------------------------------------------------------------
create or replace function public.open_box(p_box_id text)
returns table (
  item_id   text,
  rarity    text,
  duplicate boolean,
  refunded  int,
  spent     int,
  balance   int
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
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
  /* ⚠️⚠️ القرعة لازم تتحسب في متغير قبل الاستعلام — الباج كامل مشروح
     في db/shop.sql (ميل بيت سالب في صندوق الورق). */
  v_roll     numeric;
begin
  if v_uid is null then
    raise exception 'open_box: لازم تكون داخل بحسابك';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'open_box: الصناديق للحسابات المسجّلة بس';
  end if;

  select price, odds into v_price, v_odds
    from public.shop_boxes where id = p_box_id;

  if not found then
    raise exception 'open_box: صندوق مش موجود: %', p_box_id;
  end if;

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

  perform 1 from public.coin_wallets where user_id = v_uid for update;

  select coalesce(sum(amount), 0)::int into v_balance
    from public.coin_ledger where user_id = v_uid;

  if v_balance < v_price then
    raise exception 'open_box: الرصيد مش كفاية (معاك % ومحتاج %)', v_balance, v_price;
  end if;

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

    if v_refund >= v_price then
      raise exception 'open_box: تعويض % أكبر من سعر الصندوق % — مقفول', v_refund, v_price;
    end if;

    if v_refund > 0 then
      /* التعويض من جدول shop_refunds (سيرفر) عبر المسار المتغيّر.
         ref_id يفضل null عن قصد — نفس قرار db/shop.sql (تكرار نفس
         الصندوق لازم يتقبل، فممنوع ندخل معرّف الصندوق في الفهرس الفريد). */
      perform set_config('app.coin_bypass', 'on', true);
      v_refund := public._award_coins_variable(
        'box_refund', null, v_refund,
        jsonb_build_object('box', p_box_id, 'item', v_item, 'rarity', v_rarity)
      );
      perform set_config('app.coin_bypass', 'off', true);
    end if;
  else
    insert into public.shop_inventory (user_id, item_id) values (v_uid, v_item);
  end if;

  return query select v_item, v_rarity, v_dup, v_refund, v_price,
                      (v_balance - v_price + v_refund);
end;
$$;

revoke all on function public.open_box(text) from public, anon;
grant execute on function public.open_box(text) to authenticated;

-- ----------------------------------------------------------------------------
-- ٦) spin_wheel — الجائزة كانت بتتكتب مباشرة → _award_coins_variable
--    (الجسم من db/shop.sql — التغيير الوحيد: بلوك الكتابة)
-- ----------------------------------------------------------------------------
create or replace function public.spin_wheel()
returns table (prize_id text, label text, coins int, balance int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid    uuid := auth.uid();
  v_day    text := ((now() at time zone 'utc')::date)::text;
  v_id     text;
  v_label  text;
  v_coins  int;
  v_awarded int := 0;
  /* قرعة واحدة في متغير — الباج كامل مشروح في db/shop.sql (open_box). */
  v_roll   numeric;
begin
  if v_uid is null then
    raise exception 'spin_wheel: لازم تكون داخل بحسابك';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'spin_wheel: العجلة للحسابات المسجّلة بس';
  end if;

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

  -- شرط المذاكرة (نفس نافذة UTC الأصلية — الشرح في db/shop.sql)
  if not exists (
    select 1 from public.coin_ledger
     where user_id = v_uid
       and source in ('day_done', 'goal_done')
       and source_type = 'earn'
       and created_at >= (((now() at time zone 'utc')::date)::timestamp
                          at time zone 'utc')
  ) then
    raise exception 'spin_wheel: ذاكر حاجة النهارده الأول — العجلة مكافأة مذاكرة';
  end if;

  v_roll := random();

  /* أسماء الخروج p_* مقصودة — lib/shop/shop-data.ts بيقرا row.prize_id
     وrow.label بالحرف (قاعدة db/shop.sql رقم ٥). */
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

  -- الفهرس الفريد (user_id, source, ref_id = يوم UTC) هو الحد الحقيقي.
  perform set_config('app.coin_bypass', 'on', true);
  v_awarded := public._award_coins_variable(
    'wheel', v_day, v_coins, jsonb_build_object('prize', v_id)
  );
  perform set_config('app.coin_bypass', 'off', true);
  v_coins := v_awarded;

  return query
    select v_id, v_label, v_coins,
           coalesce((select sum(amount) from public.coin_ledger where user_id = v_uid), 0)::int;
end;
$$;

revoke all on function public.spin_wheel() from public, anon;
grant execute on function public.spin_wheel() to authenticated;

-- ----------------------------------------------------------------------------
-- ٧) handle_signup_bonus — Trigger يفضل هو المسار الأساسي، لكن بالتصريح
--    للحارس (app.coin_bypass) — (الجسم من db/economy-phase-4-foundation.sql)
-- ----------------------------------------------------------------------------
create or replace function public.handle_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_amount int;
begin
  -- استثناء الزائر المجهول — لا نمنح
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return new;
  end if;

  select amount into v_amount from public.coin_source_rules where id = 'signup_bonus' and is_live = true;
  if not found then return new; end if;

  insert into public.coin_wallets (user_id) values (new.id) on conflict (user_id) do nothing;

  perform set_config('app.coin_bypass', 'on', true);
  insert into public.coin_ledger (user_id, source, amount, source_type, ref_id, metadata, source_class)
  values (new.id, 'signup_bonus', v_amount, 'earn', new.id::text,
          jsonb_build_object('trigger', 'profile_insert'), 'study')
  on conflict do nothing;
  perform set_config('app.coin_bypass', 'off', true);

  return new;
end;
$$;

drop trigger if exists trg_signup_bonus on public.profiles;
create trigger trg_signup_bonus
after insert on public.profiles
for each row execute function public.handle_signup_bonus();

-- ----------------------------------------------------------------------------
-- ٨) الحارس — أي كسب خارج المسار المركزي بيرفض (C1 — Phase 0)
--    المسموح: award_coins / _award_coins_variable / add_coins_grant /
--    handle_signup_bonus — كلهم بيعملوا set_config('app.coin_bypass','on')
--    حول الـ insert بتاعهم بس (is_local). الصرف (spend) مش متأثر.
-- ----------------------------------------------------------------------------
create or replace function public.guard_coin_ledger_earn_writes()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.source_type = 'earn'
     and coalesce(current_setting('app.coin_bypass', true), '') <> 'on'
  then
    raise exception
      'coin_ledger: الكسب بيمر من award_coins/_award_coins_variable/add_coins_grant فقط (db/113+114)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_coin_ledger_earn on public.coin_ledger;
create trigger trg_guard_coin_ledger_earn
before insert on public.coin_ledger
for each row execute function public.guard_coin_ledger_earn_writes();

-- ============================================================================
-- نهاية 114 — الاقتصاد بقى: مسار كسب واحد + مسار متغيّر داخلي + مسار منح
-- (شراء/إعلانات/إداري) + حارس. التالي: تشغيل الاختبارات + تقرير المرحلة.
-- ============================================================================
