
-- ============ answer_break_riddle ============
CREATE OR REPLACE FUNCTION public.answer_break_riddle(p_answer text)
 RETURNS TABLE(correct boolean, attempts_left integer, coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_session public.break_riddle_sessions%rowtype; v_answer text; v_coins int := 0; v_xp int := 0;
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
    v_coins := 0; v_xp := 20;
    select awarded into v_coins from public.award_coins(
      case when now() - v_session.first_seen_at <= interval '5 minutes'
           then 'break_riddle_fast' else 'break_riddle' end,
      'riddle:' || v_day
    );
    update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid;
  end if;
  return query select true, 3-v_session.attempts, v_coins, v_xp, case when v_coins>0 then 'صح! مكافأة بريك محدودة نزلت' else 'صح! ذاكر نشاطًا اليوم لتفتح مكافآت البريك' end;
end; $function$


-- ============ answer_break_quiz ============
CREATE OR REPLACE FUNCTION public.answer_break_quiz(p_answer text)
 RETURNS TABLE(correct boolean, attempts_left integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid(); v_day date:=public.cairo_day(); q public.break_quiz_sessions%rowtype;
begin
 if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean,false) then raise exception 'answer_break_quiz: سجّل حساب دائم أولًا'; end if;
 perform public.daily_break_quiz(); select * into q from public.break_quiz_sessions where user_id=v_uid and day=v_day for update;
 if q.solved_at is not null then return query select true,3-q.attempts,'أنهيت Quiz Rush اليوم'; return; end if;
 if q.attempts>=3 then return query select false,0,'انتهت محاولات Quiz Rush اليوم'; return; end if;
 update public.break_quiz_sessions set attempts=attempts+1 where user_id=v_uid and day=v_day returning * into q;
 if lower(trim(p_answer))<>lower(trim(q.answer)) then return query select false,3-q.attempts,'راجع عنوان المرحلة التالية ثم حاول مرة أخرى'; return; end if;
 update public.break_quiz_sessions set solved_at=now() where user_id=v_uid and day=v_day;
 return query select true,3-q.attempts,'إجابة صحيحة — استلم مكافأة اللعبة';
end; $function$


-- ============ claim_break_game ============
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
end; $function$


-- ============ solve_escape_step ============
CREATE OR REPLACE FUNCTION public.solve_escape_step(p_answer text)
 RETURNS TABLE(correct boolean, step integer, attempts_left integer, coins integer, xp integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); s public.escape_sessions%rowtype; v_answer text; v_coins int:=0; v_xp int:=0;
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
 if public.break_studied_today(v_uid) then v_coins:=0; v_xp:=30; select awarded into v_coins from public.award_coins('escape_room', 'escape:' || v_day); update public.profiles set xp=coalesce(profiles.xp,0)+v_xp where id=v_uid; end if;
 return query select true,4,6-s.attempts,v_coins,v_xp,case when v_coins>0 then 'هربت! كسبت ٢٥ كوين و٣٠ XP' else 'هربت! ذاكر اليوم لتفتح المكافأة' end;
end; $function$


-- ============ daily_break_riddle ============
CREATE OR REPLACE FUNCTION public.daily_break_riddle()
 RETURNS TABLE(question text, hint text, attempts_left integer, solved boolean, studied boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_id text;
begin
  if v_uid is null then raise exception 'daily_break_riddle: لازم تكون داخل بحسابك'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'daily_break_riddle: سجّل حساب دائم للبريك'; end if;
  select id into v_id from public.break_riddles order by id offset (abs(hashtext(v_day::text)) % (select count(*) from public.break_riddles)) limit 1;
  insert into public.break_riddle_sessions(user_id, day, riddle_id) values(v_uid, v_day, v_id) on conflict do nothing;
  return query select r.question, r.hint, 3 - s.attempts, s.solved_at is not null, public.break_studied_today(v_uid)
    from public.break_riddle_sessions s join public.break_riddles r on r.id = s.riddle_id where s.user_id=v_uid and s.day=v_day;
end; $function$


-- ============ daily_break_quiz ============
CREATE OR REPLACE FUNCTION public.daily_break_quiz()
 RETURNS TABLE(question text, attempts_left integer, solved boolean, subject text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid(); v_day date:=public.cairo_day(); v_config uuid; v_subject text; v_topic text;
begin
 if v_uid is null then raise exception 'daily_break_quiz: لازم تكون داخل بحسابك'; end if;
 select coalesce(p.active_config_id,(select c.id from public.study_configs c where c.user_id=v_uid order by c.created_at desc limit 1)) into v_config from public.profiles p where p.id=v_uid;
 select c.subject into v_subject from public.study_configs c where c.id=v_config and c.user_id=v_uid;
 select coalesce(nullif(d.topic,''),nullif(d.title,'')) into v_topic from public.study_days d where d.user_id=v_uid and d.config_id=v_config and not d.is_completed order by d.day_number limit 1;
 v_subject:=coalesce(v_subject,'مراجعة عامة'); v_topic:=coalesce(v_topic,v_subject);
 insert into public.break_quiz_sessions(user_id,day,config_id,question,answer) values(v_uid,v_day,v_config,'Quiz Rush: في مسار «'||v_subject||'»، ما موضوع المرحلة التالية؟',v_topic) on conflict do nothing;
 return query select q.question,3-q.attempts,q.solved_at is not null,v_subject from public.break_quiz_sessions q where q.user_id=v_uid and q.day=v_day;
end; $function$


-- ============ escape_room_status ============
CREATE OR REPLACE FUNCTION public.escape_room_status()
 RETURNS TABLE(step integer, subject text, question text, hint text, attempts_left integer, solved boolean, studied boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_day date := public.cairo_day(); v_config uuid; v_step int;
begin
 if v_uid is null then raise exception 'escape_room_status: لازم تكون داخل بحسابك'; end if;
 select coalesce(p.active_config_id,(select c.id from public.study_configs c where c.user_id=v_uid order by c.created_at desc limit 1)) into v_config from public.profiles p where p.id=v_uid;
 insert into public.escape_sessions(user_id,day,config_id) values(v_uid,v_day,v_config) on conflict do nothing;
 select s.step into v_step from public.escape_sessions s where s.user_id=v_uid and s.day=v_day;
 return query select s.step::int, ctx.subject, ctx.question, ctx.hint, 6-s.attempts, s.solved_at is not null, public.break_studied_today(v_uid)
 from public.escape_sessions s left join lateral public.escape_room_context(v_uid,s.config_id,least(s.step,3)) ctx on true where s.user_id=v_uid and s.day=v_day;
end; $function$

