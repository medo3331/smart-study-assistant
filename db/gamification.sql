-- ============================================================================
-- Gamification 2.0 + Escape Room. شغّل بعد db/shop.sql وdb/break-zone.sql.
-- المكافآت كلها تتحقق داخل الدوال، ولا يمكن تمرير Coins أو XP من المتصفح.
-- ============================================================================
create table if not exists public.daily_mission_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  mission text not null check (mission in ('study', 'goal', 'riddle', 'game')),
  claimed_at timestamptz not null default now(),
  primary key (user_id, day, mission)
);
alter table public.daily_mission_claims enable row level security;
drop policy if exists "missions: owner reads" on public.daily_mission_claims;
create policy "missions: owner reads" on public.daily_mission_claims for select using (auth.uid() = user_id);

-- Quiz Rush يراجع عنوان المرحلة التالية في المادة النشطة، والإجابة لا تعود
-- للمتصفح قبل التحقق؛ لذلك لا يكفي الضغط على زر «أنهيت» للحصول على مكافأة.
create table if not exists public.break_quiz_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  config_id uuid references public.study_configs(id) on delete set null,
  question text not null,
  answer text not null,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  solved_at timestamptz,
  primary key(user_id,day)
);
alter table public.break_quiz_sessions enable row level security;
drop policy if exists "break quiz: owner reads" on public.break_quiz_sessions;
create policy "break quiz: owner reads" on public.break_quiz_sessions for select using(auth.uid()=user_id);

create or replace function public.daily_break_quiz()
returns table(question text, attempts_left int, solved boolean, subject text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid:=auth.uid(); v_day date:=(now() at time zone 'utc')::date; v_config uuid; v_subject text; v_topic text;
begin
 if v_uid is null then raise exception 'daily_break_quiz: لازم تكون داخل بحسابك'; end if;
 select coalesce(p.active_config_id,(select c.id from public.study_configs c where c.user_id=v_uid order by c.created_at desc limit 1)) into v_config from public.profiles p where p.id=v_uid;
 select c.subject into v_subject from public.study_configs c where c.id=v_config and c.user_id=v_uid;
 select coalesce(nullif(d.topic,''),nullif(d.title,'')) into v_topic from public.study_days d where d.user_id=v_uid and d.config_id=v_config and not d.is_completed order by d.day_number limit 1;
 v_subject:=coalesce(v_subject,'مراجعة عامة'); v_topic:=coalesce(v_topic,v_subject);
 insert into public.break_quiz_sessions(user_id,day,config_id,question,answer) values(v_uid,v_day,v_config,'Quiz Rush: في مسار «'||v_subject||'»، ما موضوع المرحلة التالية؟',v_topic) on conflict do nothing;
 return query select q.question,3-q.attempts,q.solved_at is not null,v_subject from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day;
end; $$;

create or replace function public.answer_break_quiz(p_answer text)
returns table(correct boolean, attempts_left int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid:=auth.uid(); v_day date:=(now() at time zone 'utc')::date; q public.break_quiz_sessions%rowtype;
begin
 if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean,false) then raise exception 'answer_break_quiz: سجّل حساب دائم أولًا'; end if;
 perform public.daily_break_quiz(); select * into q from public.break_quiz_sessions where user_id=v_uid and day=v_day for update;
 if q.solved_at is not null then return query select true,3-q.attempts,'أنهيت Quiz Rush اليوم'; return; end if;
 if q.attempts>=3 then return query select false,0,'انتهت محاولات Quiz Rush اليوم'; return; end if;
 update public.break_quiz_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into q;
 if lower(trim(p_answer))<>lower(trim(q.answer)) then return query select false,3-q.attempts,'راجع عنوان المرحلة التالية ثم حاول مرة أخرى'; return; end if;
 update public.break_quiz_sessions set solved_at=now() where user_id=v_uid and day=v_day;
 return query select true,3-q.attempts,'إجابة صحيحة — استلم مكافأة اللعبة';
end; $$;

-- نعيد تعريف مطالبة اللعبة بعد إنشاء Quiz Rush حتى لا تُصرف مكافأته قبل
-- اجتياز سؤال المادة الحالي.
create or replace function public.claim_break_game(p_game text)
returns table(coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_break_game: سجّل حساب دائم للبريك'; end if;
  if p_game not in ('memory','reaction','quiz') then raise exception 'claim_break_game: لعبة غير معروفة'; end if;
  if p_game='quiz' and not exists(select 1 from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day and q.solved_at is not null) then return query select 0,0,'أجب عن سؤال Quiz Rush المرتبط بمادتك أولًا'; return; end if;
  if not public.break_studied_today(v_uid) then return query select 0,0,'ذاكر أو خلّص هدف الأول — البريك مكافأة للمذاكرة'; return; end if;
  if (select count(*) from public.break_game_claims where user_id=v_uid and day=v_day) >= 2 then return query select 0,0,'وصلت حد مكافآت الألعاب النهارده'; return; end if;
  insert into public.break_game_claims(user_id,day,game) values(v_uid,v_day,p_game) on conflict do nothing;
  if not found then return query select 0,0,'أخدت مكافأة اللعبة دي النهارده'; return; end if;
  insert into public.coin_ledger(user_id,source,amount,source_type,ref_id,metadata) values(v_uid,'break_game',5,'earn',p_game||':'||v_day,jsonb_build_object('game',p_game));
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select 5,10,'مبروك — ٥ كوين و١٠ XP ضمن حد النهارده';
end; $$;

create or replace function public.daily_missions()
returns table(mission text, label text, done boolean, claimed boolean, coins int, xp int)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then raise exception 'daily_missions: لازم تكون داخل بحسابك'; end if;
  return query
  select m.id, m.label, m.done, exists(select 1 from public.daily_mission_claims c where c.user_id=v_uid and c.day=v_day and c.mission=m.id), 5, 10
  from (
    select 'study'::text id, 'أكمل خطوة مذاكرة'::text label, exists(select 1 from public.coin_ledger l where l.user_id=v_uid and l.source='day_done' and l.source_type='earn' and l.created_at >= (v_day::timestamp at time zone 'utc')) done
    union all select 'goal', 'أنجز هدفًا في المخطط', exists(select 1 from public.coin_ledger l where l.user_id=v_uid and l.source='goal_done' and l.source_type='earn' and l.created_at >= (v_day::timestamp at time zone 'utc'))
    union all select 'riddle', 'حل فزورة البريك', exists(select 1 from public.break_riddle_sessions s where s.user_id=v_uid and s.day=v_day and s.solved_at is not null)
    union all select 'game', 'أكمل لعبة بريك', exists(select 1 from public.break_game_claims g where g.user_id=v_uid and g.day=v_day)
  ) m;
end; $$;

create or replace function public.claim_daily_mission(p_mission text)
returns table(coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date; v_done boolean;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'claim_daily_mission: سجّل حساب دائم أولًا'; end if;
  select dm.done into v_done from public.daily_missions() dm where dm.mission=p_mission;
  if not found then raise exception 'claim_daily_mission: مهمة غير معروفة'; end if;
  if not v_done then return query select 0,0,'أكمل المهمة الأول ثم استلم مكافأتها'; return; end if;
  insert into public.daily_mission_claims(user_id,day,mission) values(v_uid,v_day,p_mission) on conflict do nothing;
  if not found then return query select 0,0,'استلمت مكافأة المهمة دي بالفعل'; return; end if;
  insert into public.coin_ledger(user_id,source,amount,source_type,ref_id,metadata) values(v_uid,'daily_mission',5,'earn','mission:'||p_mission||':'||v_day,jsonb_build_object('mission',p_mission));
  update public.profiles set xp=coalesce(profiles.xp,0)+10 where id=v_uid;
  return query select 5,10,'تمت المهمة — ٥ كوين و١٠ XP';
end; $$;

create table if not exists public.escape_puzzles (
  step smallint primary key check (step between 1 and 3), question text not null, answer text not null, hint text not null
);
insert into public.escape_puzzles(step,question,answer,hint) values
 (1,'لغز البداية: ما الذي يزيد كلما شاركته مع الآخرين؟','المعرفة','شيء نتعلمه.'),
 (2,'لغز الباب الثاني: ما الأداة التي ترتب ما ستدرسه يومًا بيوم؟','الخطة','تبدأ منها قبل الجلسة.'),
 (3,'لغز الخروج: ما أفضل طريقة للتحقق من أنك فهمت الدرس؟','الاختبار','تفعلها بعد المراجعة.')
on conflict(step) do update set question=excluded.question, answer=excluded.answer, hint=excluded.hint;

create table if not exists public.escape_sessions (
 user_id uuid not null references auth.users(id) on delete cascade, day date not null,
 step smallint not null default 1 check(step between 1 and 4), attempts smallint not null default 0 check(attempts between 0 and 6), started_at timestamptz not null default now(), solved_at timestamptz,
 primary key(user_id,day)
);
alter table public.escape_sessions add column if not exists config_id uuid references public.study_configs(id) on delete set null;
alter table public.escape_sessions enable row level security;
drop policy if exists "escape: owner reads" on public.escape_sessions;
create policy "escape: owner reads" on public.escape_sessions for select using(auth.uid()=user_id);

create or replace function public.escape_room_context(p_uid uuid, p_config uuid, p_step int)
returns table(subject text, question text, hint text, answer text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_subject text; v_topic text; v_title text;
begin
  select c.subject into v_subject from public.study_configs c where c.id=p_config and c.user_id=p_uid;
  if v_subject is null then
    return query select 'مراجعة عامة'::text, p.question, p.hint, p.answer from public.escape_puzzles p where p.step=p_step;
    return;
  end if;
  if p_step = 1 then
    return query select v_subject, 'بوابة المادة: ما اسم المادة أو الهدف الذي تذاكره الآن؟', 'اكتب الاسم الظاهر في خطتك.', v_subject;
    return;
  end if;
  select d.topic, d.title into v_topic, v_title from public.study_days d where d.user_id=p_uid and d.config_id=p_config and (case when p_step=2 then not d.is_completed else true end) order by d.day_number limit 1;
  v_topic := coalesce(nullif(v_topic,''), nullif(v_title,''), v_subject);
  if p_step = 2 then
    return query select v_subject, 'بوابة الخطة: ما موضوع أول مرحلة لم تُكملها بعد؟', 'ابحث في المرحلة التالية من خطتك.', v_topic;
  else
    return query select v_subject, 'بوابة المراجعة: اكتب موضوعًا من مراحل خطتك الحالية.', 'ابدأ بعنوان المرحلة الأولى في مسارك.', v_topic;
  end if;
end; $$;

-- PostgreSQL لا يسمح لـ CREATE OR REPLACE بتغيير أعمدة RETURNS TABLE.
-- الدالة القديمة كانت تعيد 6 أعمدة؛ النسخة المرتبطة بالمادة تضيف subject.
-- لا توجد بيانات داخل الدالة نفسها، لذلك حذف تعريفها ثم إنشاؤه آمن.
-- solve_escape_step تعتمد على status في النسخ السابقة، فنزيل تعريفها
-- أولاً حتى لا يمنع PostgreSQL حذف الدالة القديمة بسبب dependency.
drop function if exists public.solve_escape_step(text);
drop function if exists public.escape_room_status();
create function public.escape_room_status()
returns table(step int, subject text, question text, hint text, attempts_left int, solved boolean, studied boolean)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date; v_config uuid; v_step int;
begin
 if v_uid is null then raise exception 'escape_room_status: لازم تكون داخل بحسابك'; end if;
 select coalesce(p.active_config_id,(select c.id from public.study_configs c where c.user_id=v_uid order by c.created_at desc limit 1)) into v_config from public.profiles p where p.id=v_uid;
 insert into public.escape_sessions(user_id,day,config_id) values(v_uid,v_day,v_config) on conflict do nothing;
 select s.step into v_step from public.escape_sessions s where s.user_id=v_uid and s.day=v_day;
 return query select s.step::int, ctx.subject, ctx.question, ctx.hint, 6-s.attempts, s.solved_at is not null, public.break_studied_today(v_uid)
 from public.escape_sessions s left join lateral public.escape_room_context(v_uid,s.config_id,least(s.step,3)) ctx on true where s.user_id=v_uid and s.day=v_day;
end; $$;

create or replace function public.solve_escape_step(p_answer text)
returns table(correct boolean, step int, attempts_left int, coins int, xp int, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_day date := (now() at time zone 'utc')::date; s public.escape_sessions%rowtype; v_answer text; v_coins int:=0; v_xp int:=0;
begin
 if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean,false) then raise exception 'solve_escape_step: سجّل حساب دائم أولًا'; end if;
 perform public.escape_room_status(); select * into s from public.escape_sessions where user_id=v_uid and day=v_day for update;
 if s.solved_at is not null then return query select true,4,6-s.attempts,0,0,'أنهيت الغرفة اليوم'; return; end if;
 if s.attempts >= 6 then return query select false,s.step::int,0,0,0,'انتهت محاولات اليوم — ارجع بكرة'; return; end if;
 update public.escape_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into s;
 select ctx.answer into v_answer from public.escape_room_context(v_uid,s.config_id,s.step) ctx;
 if lower(trim(p_answer))<>lower(trim(v_answer)) then return query select false,s.step::int,6-s.attempts,0,0,'ليست الإجابة؛ استخدم التلميح وحاول ثانية'; return; end if;
 if s.step < 3 then update public.escape_sessions set step=step+1 where user_id=v_uid and day=v_day returning * into s; return query select true,s.step::int,6-s.attempts,0,0,'صحيح! فتحت اللغز التالي'; return; end if;
 update public.escape_sessions set step=4, solved_at=now() where user_id=v_uid and day=v_day;
 if public.break_studied_today(v_uid) then v_coins:=25; v_xp:=30; insert into public.coin_ledger(user_id,source,amount,source_type,ref_id,metadata) values(v_uid,'escape_room',v_coins,'earn','escape:'||v_day,'{}'); update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid; end if;
 return query select true,4,6-s.attempts,v_coins,v_xp,case when v_coins>0 then 'هربت! كسبت ٢٥ كوين و٣٠ XP' else 'هربت! ذاكر اليوم لتفتح المكافأة' end;
end; $$;

revoke all on function public.escape_room_context(uuid, uuid, int) from public;
revoke all on function public.daily_break_quiz() from public; revoke all on function public.answer_break_quiz(text) from public;
revoke all on function public.daily_missions() from public; revoke all on function public.claim_daily_mission(text) from public; revoke all on function public.escape_room_status() from public; revoke all on function public.solve_escape_step(text) from public;
grant execute on function public.daily_break_quiz() to authenticated; grant execute on function public.answer_break_quiz(text) to authenticated;
grant execute on function public.daily_missions() to authenticated; grant execute on function public.claim_daily_mission(text) to authenticated; grant execute on function public.escape_room_status() to authenticated; grant execute on function public.solve_escape_step(text) to authenticated;
