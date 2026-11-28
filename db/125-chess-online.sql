-- ============================================================
-- db/125 — Magic Chess Online (Phase 2 — Master Spec)
-- أونلاين + matchmaking + Rating مستقل لكل فئة وقت + ساعات سيرفرية.
--
-- المعمارية:
--   - chess_ratings: Elo منفصل لكل فئة (bullet/blitz/rapid/classical) K=32.
--   - chess_games: حالة المباراة (GameState كما هو من محركنا) + الساعات بالميلي.
--   - chess_queue: طلبات البحث — الوصول للعميل فقط عبر RPCs (RLS بلا سياسات).
--   - النقلات بتتحقق على السيرفر بمحرك الشطرنج (route: /api/chess/move
--     بـ service-role) — العميل مبيكتبش على chess_games مباشرة أبدًا.
-- ============================================================

-- 1) Rating — صف لكل لاعب، عمود لكل فئة وقت
create table if not exists public.chess_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bullet int not null default 1200,
  blitz int not null default 1200,
  rapid int not null default 1200,
  classical int not null default 1200,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.chess_ratings enable row level security;
drop policy if exists "chess_ratings_owner_read" on public.chess_ratings;
create policy "chess_ratings_owner_read" on public.chess_ratings
  for select using (auth.uid() = user_id);

-- 2) المباريات — المشاركين بيقرأوا بس؛ الكتابة من السيرفر (service-role)
create table if not exists public.chess_games (
  id uuid primary key default gen_random_uuid(),
  white uuid not null references auth.users(id) on delete cascade,
  black uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bullet','blitz','rapid','classical')),
  initial_seconds int not null check (initial_seconds between 30 and 5400),
  increment_seconds int not null default 0 check (increment_seconds between 0 and 60),
  rated boolean not null default true,
  status text not null default 'active' check (status in ('active','finished','aborted')),
  state jsonb not null,               -- GameState (board/turn/castling/ep) من محركنا
  moves jsonb not null default '[]',  -- [{from,to,promo}]
  white_ms int not null,
  black_ms int not null,
  last_move_at timestamptz not null default now(),
  result text check (result in ('white','black','draw')),
  result_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.chess_games enable row level security;
drop policy if exists "chess_games_players_read" on public.chess_games;
create policy "chess_games_players_read" on public.chess_games
  for select using (auth.uid() = white or auth.uid() = black);

create index if not exists chess_games_active_idx
  on public.chess_games (status, created_at desc);
create index if not exists chess_games_white_idx on public.chess_games (white);
create index if not exists chess_games_black_idx on public.chess_games (black);

-- 3) طابور البحث — RPCs بس (RLS بلا سياسات)
create table if not exists public.chess_queue (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  initial_seconds int not null,
  increment_seconds int not null,
  rated boolean not null,
  rating int not null default 1200,
  joined_at timestamptz not null default now(),
  primary key (user_id, category, initial_seconds, increment_seconds, rated)
);

alter table public.chess_queue enable row level security;

create index if not exists chess_queue_match_idx
  on public.chess_queue (category, initial_seconds, increment_seconds, rated, joined_at);

-- 4) الحالة الابتدائية — نفس شكل GameState من lib/games/chess/engine.ts
create or replace function public.chess_initial_state()
returns jsonb
language plpgsql
immutable
as $$
declare
  back text[] := array['r','n','b','q','k','b','n','r'];
  board jsonb := '[]'::jsonb;
  sq int; t text; c text;
begin
  for sq in 0..63 loop
    c := null; t := null;
    if sq < 16 then c := 'b';
    elsif sq >= 48 then c := 'w';
    end if;
    if c is not null then
      if sq < 8 or sq >= 56 then t := back[(sq % 8) + 1];
      else t := 'p';
      end if;
      board := board || jsonb_build_object('t', t, 'c', c);
    else
      board := board || 'null'::jsonb;
    end if;
  end loop;
  return jsonb_build_object(
    'board', board,
    'turn', 'w',
    'castling', jsonb_build_object('wK', true, 'wQ', true, 'bK', true, 'bQ', true),
    'ep', null
  );
end;
$$;

-- 5) Elo — K=32 بأرضية 100
create or replace function public.chess_elo(p_rating int, p_opponent int, p_score numeric, p_k int)
returns int
language sql
immutable
as $$
  select greatest(100, round(
    p_rating + p_k * (p_score - 1.0 / (1.0 + power(10.0, (p_opponent - p_rating)::numeric / 400.0)))
  ))::int;
$$;

-- 6) إنهاء مباراة + تطبيق Elo — للسيرفر بس (service-role)
create or replace function public.chess_finish_game(p_game_id uuid, p_result text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  wr int; br int;
  sw numeric; sb numeric;
begin
  if p_result not in ('white','black','draw') then
    raise exception 'BAD_RESULT';
  end if;

  select * into g from public.chess_games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if g.status <> 'active' then return; end if; -- idempotent

  update public.chess_games
    set status = 'finished',
        result = p_result,
        result_reason = p_reason,
        ended_at = now(),
        updated_at = now()
    where id = p_game_id;

  if not g.rated then return; end if;

  insert into public.chess_ratings (user_id) values (g.white), (g.black)
    on conflict (user_id) do nothing;

  select
    case p_result when 'white' then 1 when 'draw' then 0.5 else 0 end,
    case p_result when 'black' then 1 when 'draw' then 0.5 else 0 end
  into sw, sb;

  select
    case g.category when 'bullet' then r.bullet when 'blitz' then r.blitz
                     when 'rapid' then r.rapid else r.classical end,
    case g.category when 'bullet' then b.bullet when 'blitz' then b.blitz
                     when 'rapid' then b.rapid else b.classical end
  into wr, br
  from public.chess_ratings r, public.chess_ratings b
  where r.user_id = g.white and b.user_id = g.black;

  update public.chess_ratings set
    wins = wins + (case when p_result = 'white' then 1 else 0 end),
    losses = losses + (case when p_result = 'black' then 1 else 0 end),
    draws = draws + (case when p_result = 'draw' then 1 else 0 end),
    bullet = case when g.category = 'bullet' then public.chess_elo(bullet, br, sw, 32) else bullet end,
    blitz = case when g.category = 'blitz' then public.chess_elo(blitz, br, sw, 32) else blitz end,
    rapid = case when g.category = 'rapid' then public.chess_elo(rapid, br, sw, 32) else rapid end,
    classical = case when g.category = 'classical' then public.chess_elo(classical, br, sw, 32) else classical end,
    updated_at = now()
  where user_id = g.white;

  update public.chess_ratings set
    wins = wins + (case when p_result = 'black' then 1 else 0 end),
    losses = losses + (case when p_result = 'white' then 1 else 0 end),
    draws = draws + (case when p_result = 'draw' then 1 else 0 end),
    bullet = case when g.category = 'bullet' then public.chess_elo(bullet, wr, sb, 32) else bullet end,
    blitz = case when g.category = 'blitz' then public.chess_elo(blitz, wr, sb, 32) else blitz end,
    rapid = case when g.category = 'rapid' then public.chess_elo(rapid, wr, sb, 32) else rapid end,
    classical = case when g.category = 'classical' then public.chess_elo(classical, wr, sb, 32) else classical end,
    updated_at = now()
  where user_id = g.black;
end;
$$;

revoke execute on function public.chess_finish_game(uuid, text, text) from public, anon, authenticated;
grant execute on function public.chess_finish_game(uuid, text, text) to service_role;

-- 7) الانضمام لطابور البحث (matchmaking) — للاعبين
create or replace function public.chess_join_queue(
  p_category text, p_initial_seconds int, p_increment_seconds int, p_rated boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  opp record;
  gid uuid;
  my_rating int;
  i_am_white boolean;
begin
  if uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_category not in ('bullet','blitz','rapid','classical') then raise exception 'BAD_CATEGORY'; end if;
  if p_initial_seconds is null or p_initial_seconds < 30 or p_initial_seconds > 5400
     or p_increment_seconds is null or p_increment_seconds < 0 or p_increment_seconds > 60 then
    raise exception 'BAD_TIME';
  end if;

  -- إعادة اتصال: عندي مباراة شغالة؟ رجّعها
  select g.id into gid from public.chess_games g
  where g.status = 'active' and (g.white = uid or g.black = uid)
  order by g.created_at desc
  limit 1;
  if gid is not null then return gid; end if;

  -- نظّف الطلبات اليتيمة
  delete from public.chess_queue where joined_at < now() - interval '3 minutes';

  select
    case p_category when 'bullet' then r.bullet when 'blitz' then r.blitz
                     when 'rapid' then r.rapid else r.classical end
  into my_rating
  from public.chess_ratings r
  where r.user_id = uid;
  my_rating := coalesce(my_rating, 1200);

  -- دور على خصم بنفس الإعدادات (الأقدم أولًا) — SKIP LOCKED ضد السباق
  select q.user_id into opp
  from public.chess_queue q
  where q.category = p_category
    and q.initial_seconds = p_initial_seconds
    and q.increment_seconds = p_increment_seconds
    and q.rated = p_rated
    and q.user_id <> uid
  order by q.joined_at asc
  limit 1
  for update skip locked;

  if opp is not null then
    delete from public.chess_queue q
    where (q.user_id = opp.user_id or q.user_id = uid)
      and q.category = p_category
      and q.initial_seconds = p_initial_seconds
      and q.increment_seconds = p_increment_seconds
      and q.rated = p_rated;

    i_am_white := random() < 0.5; -- الألوان عشوائية
    insert into public.chess_games
      (white, black, category, initial_seconds, increment_seconds, rated,
       state, white_ms, black_ms)
    values
      (case when i_am_white then uid else opp.user_id end,
       case when i_am_white then opp.user_id else uid end,
       p_category, p_initial_seconds, p_increment_seconds, p_rated,
       public.chess_initial_state(), p_initial_seconds * 1000, p_initial_seconds * 1000)
    returning id into gid;

    return gid;
  end if;

  -- مفيش خصم — سجّلني في الطابور
  insert into public.chess_queue (user_id, category, initial_seconds, increment_seconds, rated, rating)
  values (uid, p_category, p_initial_seconds, p_increment_seconds, p_rated, my_rating)
  on conflict (user_id, category, initial_seconds, increment_seconds, rated) do update
    set rating = excluded.rating, joined_at = now();

  return null;
end;
$$;

grant execute on function public.chess_join_queue(text, int, int, boolean) to authenticated;

-- 8) الخروج من الطابور
create or replace function public.chess_leave_queue(
  p_category text, p_initial_seconds int, p_increment_seconds int, p_rated boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.chess_queue
  where user_id = auth.uid()
    and category = p_category
    and initial_seconds = p_initial_seconds
    and increment_seconds = p_increment_seconds
    and rated = p_rated;
$$;

grant execute on function public.chess_leave_queue(text, int, int, boolean) to authenticated;

-- 9) الاستسلام — اللاعب بس
create or replace function public.chess_resign(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g record;
begin
  if uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.chess_games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if g.status <> 'active' then return; end if;
  if uid <> g.white and uid <> g.black then raise exception 'NOT_PLAYER'; end if;

  perform public.chess_finish_game(
    p_game_id,
    case when uid = g.white then 'black' else 'white' end,
    'resign'
  );
end;
$$;

grant execute on function public.chess_resign(uuid) to authenticated;

-- 10) المطالبة بانتهاء وقت الخصم (أو نفسي) — السيرفر بيتحقق بالحساب
create or replace function public.chess_claim_timeout(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g record;
  turn text;
  elapsed_ms int;
  mover_ms int;
  winner text;
begin
  if uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.chess_games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if g.status <> 'active' then return g.result; end if;
  if uid <> g.white and uid <> g.black then raise exception 'NOT_PLAYER'; end if;

  turn := g.state->>'turn';
  elapsed_ms := (extract(epoch from (now() - g.last_move_at)) * 1000)::int;
  mover_ms := (case when turn = 'w' then g.white_ms else g.black_ms end) - elapsed_ms;

  if mover_ms > 0 then
    return 'not_expired'; -- لسه فيه وقت — مفيش إنهاء
  end if;

  winner := case when turn = 'w' then 'black' else 'white' end;
  perform public.chess_finish_game(p_game_id, winner, 'timeout');
  return winner;
end;
$$;

grant execute on function public.chess_claim_timeout(uuid) to authenticated;
