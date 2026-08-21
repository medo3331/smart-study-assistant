-- ============================================================================
-- Break Zone — مكافآت محدودة مرتبطة بنشاط دراسة حقيقي.
-- شغّل بعد db/shop.sql. لا توجد أي سياسة كتابة من المتصفح.
-- ============================================================================
create table if not exists public.break_riddles (
  id text primary key,
  question text not null,
  answer text not null,
  hint text not null
);

create table if not exists public.break_riddle_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  riddle_id text not null references public.break_riddles(id),
  first_seen_at timestamptz not null default now(),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  solved_at timestamptz,
  primary key (user_id, day)
);

create table if not exists public.break_game_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  game text not null check (game in ('memory', 'reaction', 'quiz')),
  claimed_at timestamptz not null default now(),
  primary key (user_id, day, game)
);

alter table public.break_riddle_sessions enable row level security;
alter table public.break_game_claims enable row level security;
drop policy if exists "break sessions: owner reads" on public.break_riddle_sessions;
drop policy if exists "break claims: owner reads" on public.break_game_claims;
create policy "break sessions: owner reads" on public.break_riddle_sessions for select using (auth.uid() = user_id);
create policy "break claims: owner reads" on public.break_game_claims for select using (auth.uid() = user_id);

insert into public.break_riddles (id, question, answer, hint) values
  ('shadow', 'ما الشيء الذي يمشي معك في النهار ويختفي في الظلام؟', 'الظل', 'تراه على الأرض مع الضوء.'),
  ('book', 'ما الشيء الذي كلما أخذت منه كبر؟', 'الحفرة', 'فكّر في الأرض.'),
  ('clock', 'ما الشيء الذي له وجه ويدان لكنه لا يصفق؟', 'الساعة', 'يساعدك في تنظيم وقت البريك.')
on conflict (id) do update set question = excluded.question, answer = excluded.answer, hint = excluded.hint;

create or replace function public.break_studied_today(p_uid uuid)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select exists (
    select 1 from public.coin_ledger
    where user_id = p_uid and source in ('day_done', 'goal_done') and source_type = 'earn'
      and created_at >= (((now() at time zone 'utc')::date)::timestamp at time zone 'utc')
  );
$$;

create or replace function public.daily_break_riddle()
returns table(question text, hint text, attempts_left int, solved boolean, studied boolean)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date; v_id text;
begin
  if v_uid is null then raise exception 'daily_break_riddle: لازم تكون داخل بحسابك'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'daily_break_riddle: سجّل حساب دائم للبريك'; end if;
  select id into v_id from public.break_riddles order by id offset (abs(hashtext(v_day::text)) % (select count(*) from public.break_riddles)) limit 1;
  insert into public.break_riddle_sessions(user_id, day, riddle_id) values(v_uid, v_day, v_id) on conflict do nothing;
  return query select r.question, r.hint, 3 - s.attempts, s.solved_at is not null, public.break_studied_today(v_uid)
    from public.break_riddle_sessions s join public.break_riddles r on r.id = s.riddle_id where s.user_id=v_uid and s.day=v_day;
end; $$;

create or replace function public.answer_break_riddle(p_answer text)
returns table(correct boolean, attempts_left int, coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date; v_session public.break_riddle_sessions%rowtype; v_answer text; v_coins int := 0; v_xp int := 0;
begin
  if v_uid is null then raise exception 'answer_break_riddle: لازم تكون داخل بحسابك'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'answer_break_riddle: سجّل حساب دائم للبريك'; end if;
  perform public.daily_break_riddle();
  select * into v_session from public.break_riddle_sessions where user_id=v_uid and day=v_day for update;
  if v_session.solved_at is not null then return query select true, 3-v_session.attempts, 0, 0, 'حلّيتها بالفعل النهارده'; return; end if;
  if v_session.attempts >= 3 then return query select false, 0, 0, 0, 'خلصت محاولات النهارده — ارجع بكرة'; return; end if;
  update public.break_riddle_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into v_session;
  select answer into v_answer from public.break_riddles where id=v_session.riddle_id;
  if lower(trim(p_answer)) <> lower(trim(v_answer)) then return query select false, 3-v_session.attempts, 0, 0, 'إجابة قريبة؟ جرّب تاني'; return; end if;
  update public.break_riddle_sessions set solved_at=now() where user_id=v_uid and day=v_day;
  if public.break_studied_today(v_uid) then
    v_coins := case when now() - v_session.first_seen_at <= interval '5 minutes' then 20 else 15 end; v_xp := 20;
    insert into public.coin_ledger(user_id, source, amount, source_type, ref_id, metadata) values(v_uid,'break_riddle',v_coins,'earn','riddle:'||v_day,jsonb_build_object('riddle',v_session.riddle_id));
    update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid;
  end if;
  return query select true, 3-v_session.attempts, v_coins, v_xp, case when v_coins>0 then 'صح! مكافأة بريك محدودة نزلت' else 'صح! ذاكر نشاطًا اليوم لتفتح مكافآت البريك' end;
end; $$;

create or replace function public.claim_break_game(p_game text)
returns table(coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then raise exception 'claim_break_game: لازم تكون داخل بحسابك'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_break_game: سجّل حساب دائم للبريك'; end if;
  if p_game not in ('memory','reaction','quiz') then raise exception 'claim_break_game: لعبة غير معروفة'; end if;
  if not public.break_studied_today(v_uid) then return query select 0,0,'ذاكر أو خلّص هدف الأول — البريك مكافأة للمذاكرة'; return; end if;
  if (select count(*) from public.break_game_claims where user_id=v_uid and day=v_day) >= 2 then return query select 0,0,'وصلت حد مكافآت الألعاب النهارده'; return; end if;
  insert into public.break_game_claims(user_id,day,game) values(v_uid,v_day,p_game) on conflict do nothing;
  if not found then return query select 0,0,'أخدت مكافأة اللعبة دي النهارده'; return; end if;
  insert into public.coin_ledger(user_id,source,amount,source_type,ref_id,metadata) values(v_uid,'break_game',5,'earn',p_game||':'||v_day,jsonb_build_object('game',p_game));
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select 5,10,'مبروك — ٥ كوين و١٠ XP ضمن حد النهارده';
end; $$;

revoke all on function public.break_studied_today(uuid) from public;
revoke all on function public.daily_break_riddle() from public;
revoke all on function public.answer_break_riddle(text) from public;
revoke all on function public.claim_break_game(text) from public;
grant execute on function public.daily_break_riddle() to authenticated;
grant execute on function public.answer_break_riddle(text) to authenticated;
grant execute on function public.claim_break_game(text) to authenticated;
