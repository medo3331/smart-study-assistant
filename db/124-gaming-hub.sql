-- ============================================================================
-- 124 — GAMING HUB 🎮 (DEV-M3 جزء ٦ — Arcade Foundation)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
--
-- أساس عالم ألعاب Magicly (Arcade) — بنفس فلسفة الاقتصاد الموحد (db/113):
--
-- ١) game_profiles — بروفايل اللاعب لكل لعبة (XP / أفضل نتيجة / عدد لعب /
--    عدد انتصارات). RLS: المالك بس.
-- ٢) game_achievements — إنجازات Arcade المفتوحة لكل مستخدم (سيرفر-أوثوريتيتيف
--    بيتفتحوا جوا arcade_submit_score حسب حالة البروفايل، مش من الواجهة).
-- ٣) arcade_level — مستوى اللاعب من الـ XP (نفس معادلة الواجهة في
--    lib/games/arcade.ts — مصدر واحد للحقيقة).
-- ٤) arcade_submit_score — تسجيل نتيجة جولة (حد أقصى clamp + XP محسوب
--    على السيرفر من النتيجة والفوز — الواجهة ماتبعتش XP) + أول فوز/يولع
--    مكافأة ٥ كوين عبر award_coins('arcade_win') + فتح إنجازات جديدة
--    (كل إنجاز = ١٠ كوين عبر award_coins('achievement') — سقف يومي موجود).
-- ٥) arcade_leaderboard — ترتيب لعبة (Top 20) — security definer عشان
--    RLS بتمنع قراءة بروفايلات غيرك.
--
-- الكوينز من الألعاب محدودة عمدًا (فوز/يوم + إنجازات) — الألعاب بتكسب XP
-- أساسًا، مش مزرعة كوينز (قرار التصميم).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) game_profiles
-- ----------------------------------------------------------------------------
create table if not exists public.game_profiles (
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  game_id     text        not null,
  xp          integer     not null default 0,
  best_score  integer     not null default 0,
  plays       integer     not null default 0,
  wins        integer     not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, game_id),
  constraint game_profiles_game_chk check (game_id in
    ('chess', 'memory', 'reaction', 'quiz', 'penalty', 'blocks', 'run'))
);

alter table public.game_profiles enable row level security;

drop policy if exists "game_profiles_owner_all" on public.game_profiles;
create policy "game_profiles_owner_all"
  on public.game_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- ٢) game_achievements
-- ----------------------------------------------------------------------------
create table if not exists public.game_achievements (
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  achievement_id  text        not null,
  game_id         text        not null,
  claimed_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.game_achievements enable row level security;

drop policy if exists "game_achievements_owner_read" on public.game_achievements;
create policy "game_achievements_owner_read"
  on public.game_achievements
  for select
  using (auth.uid() = user_id);

drop policy if exists "game_achievements_server_insert" on public.game_achievements;
create policy "game_achievements_server_insert"
  on public.game_achievements
  for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- ٣) مستوى اللاعب — نفس معادلة الواجهة (lib/games/arcade.ts)
--    level = floor(sqrt(xp)/5) + 1  → ٣٤٥٠ XP = مستوى ١٢
-- ----------------------------------------------------------------------------
create or replace function public.arcade_level(p_xp integer)
returns integer
language sql
immutable
as $$ select greatest(1, floor(sqrt(greatest(coalesce(p_xp, 0), 0)) / 5.0)::int + 1) $$;

revoke all on function public.arcade_level(integer) from public;
grant execute on function public.arcade_level(integer) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- ٤) مصدر الكوينز الجديد — أول فوز في اليوم لكل لعبة = ٥ كوين
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live)
values ('arcade_win', 5, 1, true)
on conflict (id) do update set
  amount = excluded.amount,
  daily_cap = excluded.daily_cap,
  is_live = excluded.is_live;

-- ----------------------------------------------------------------------------
-- ٥) arcade_submit_score — تسجيل نتيجة الجولة (سيرفر-أوثوريتيتيف)
--    يرجع: xp / level / best / is_record / coins / achievements الجديدة / رسالة
-- ----------------------------------------------------------------------------
create or replace function public.arcade_submit_score(
  p_game  text,
  p_score integer,
  p_won   boolean default false
)
returns table (
  xp           integer,
  level        integer,
  best         integer,
  is_record    boolean,
  coins        integer,
  achievements text[],
  message      text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid  uuid := auth.uid();
  v_gain integer;
  v_xp   integer;
  v_best integer;
  v_rec  boolean;
  v_coins integer := 0;
  v_new  text[] := '{}';
  v_id   text;
begin
  if v_uid is null then
    raise exception 'arcade_submit_score: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'arcade_submit_score: الزائر مايلعبش للرصيد — سجّل حساب';
  end if;

  -- clamp: النتيجة بين 0 و ١٠٠ ألف — الواجهة ماتبعتش XP خالص
  p_score := greatest(0, least(coalesce(p_score, 0), 100000));

  -- XP محسوب على السيرفر: فوز = ٦٠، خسارة حسب النتيجة (٥–٤٠)
  v_gain := case when p_won then 60
                 else greatest(5, least(40, p_score / 10)) end;

  insert into public.game_profiles (user_id, game_id, xp, best_score, plays, wins)
    values (v_uid, p_game, v_gain, p_score, 1, case when p_won then 1 else 0 end)
  on conflict (user_id, game_id) do update set
      xp         = public.game_profiles.xp + excluded.xp,
      best_score = greatest(public.game_profiles.best_score, excluded.best_score),
      plays      = public.game_profiles.plays + 1,
      wins       = public.game_profiles.wins + case when p_won then 1 else 0 end,
      updated_at = now()
  returning xp, best_score into v_xp, v_best;

  v_rec := p_score > 0 and p_score >= v_best;

  -- أول فوز في اليوم لكل لعبة = ٥ كوين (ref_id يومي بيمنع التكرار)
  if p_won then
    begin
      select awarded into v_coins
        from public.award_coins('arcade_win', p_game || ':' || public.cairo_day()::text);
    exception when others then
      v_coins := 0; -- مصدر معطل — مافيش كوينز بس الجولة تتسجل
    end;
  end if;

  -- فتح الإنجازات من حالة البروفايل (سيرفر-أوثوريتيتيف) — كل واحد مرة واحدة
  for v_id in
    select a.id from (values
      ('arcade_first_win',  p_won),
      ('arcade_wins_10',    (select wins >= 10  from public.game_profiles where user_id = v_uid and game_id = p_game)),
      ('arcade_plays_25',   (select plays >= 25 from public.game_profiles where user_id = v_uid and game_id = p_game)),
      ('arcade_best_500',   (select best_score >= 500 from public.game_profiles where user_id = v_uid and game_id = p_game)),
      ('arcade_level_5',    public.arcade_level(v_xp) >= 5),
      ('arcade_level_12',   public.arcade_level(v_xp) >= 12)
    ) as a(id, unlocked)
    where a.unlocked
  loop
    insert into public.game_achievements (user_id, achievement_id, game_id)
      values (v_uid, v_id, p_game)
    on conflict (user_id, achievement_id) do nothing;
    if found then
      v_new := v_new || v_id;
      begin
        perform public.award_coins('achievement', 'arcade:' || v_id);
      exception when others then
        null; -- إنجاز متسجل حتى لو مكافأته معطلة
      end;
    end if;
  end loop;

  return query select v_xp, public.arcade_level(v_xp), v_best, v_rec, v_coins, v_new,
    case when array_length(v_new, 1) > 0 then 'إنجاز جديد! 🏅'
         when v_rec then 'رقم قياسي جديد! 🎉'
         when p_won then 'فوز! 💪'
         else 'تم تسجيل النتيجة' end;
end; $$;

revoke all on function public.arcade_submit_score(text, integer, boolean) from public, anon;
grant execute on function public.arcade_submit_score(text, integer, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- ٦) arcade_leaderboard — ترتيب لعبة (Top 20)
-- ----------------------------------------------------------------------------
create or replace function public.arcade_leaderboard(p_game text)
returns table (
  rank         bigint,
  display_name text,
  handle       text,
  code         text,
  xp           integer,
  level        integer,
  best_score   integer,
  wins         integer
)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select row_number() over (order by gp.best_score desc, gp.xp desc) as rank,
         coalesce(sp.display_name, pr.display_name) as display_name,
         sp.handle,
         pr.public_user_code,
         gp.xp, public.arcade_level(gp.xp), gp.best_score, gp.wins
    from public.game_profiles gp
    join public.profiles pr on pr.id = gp.user_id
    left join public.social_profiles sp on sp.user_id = gp.user_id
   where gp.game_id = p_game
   order by gp.best_score desc, gp.xp desc
   limit 20
$$;

revoke all on function public.arcade_leaderboard(text) from public, anon;
grant execute on function public.arcade_leaderboard(text) to authenticated;

COMMIT;
