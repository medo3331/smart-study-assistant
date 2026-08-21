-- ============================================================================
-- صفحة المجتمع — الأسماء الحقيقية + مسابقة الكويز الأسبوعية
-- ----------------------------------------------------------------------------
-- شغّل الملف ده **مرة واحدة** في Supabase SQL Editor. آمن للتكرار (idempotent):
-- كل حاجة `if not exists` / `create or replace`.
--
-- بيعمل تلات حاجات:
--   ١) عمود display_name على profiles — عشان لوحة الصدارة تعرض أسماء حقيقية
--      بدل «لاعب #1234». null = لسه ما اختارش اسم → الواجهة بتقع على الاسم
--      المستعار من معرّف الحساب.
--   ٢) جدول community_quiz_scores — بيمسك **أحسن نتيجة لكل مستخدم في كل أسبوع**
--      (مش كل محاولة). ده اللي لوحة صدارة المسابقة بتترتّب عليه.
--   ٣) تلات دوال RPC (security definer) بتكتب/بتقرا الجدول ده. الكتابة كلها من
--      هنا مش من الكلاينت — نفس فلسفة award_coins في db/shop.sql: المبالغ
--      والتحقق في السيرفر، والكلاينت بيطلب بس.
--
-- الأسبوع بيبدأ الأحد وبينتهي السبت بالليل (بتوقيت القاهرة) — نفس منطق
-- العدّاد في صفحة المجتمع (getTimeUntilWeekEnd بينتهي السبت). المفتاح =
-- تاريخ أول يوم في الأسبوع (الأحد) كنص، وبيتحسب في السيرفر لوحده عشان
-- الكلاينت (اللي ممكن يكون بتوقيت تاني) ما يختلفش مع الداتابيز.
-- ============================================================================


-- ١) الاسم المعروض على profiles ------------------------------------------------
-- الاسم الحقيقي متخزّن في auth.users.user_metadata، ودي مش بتتقري لغير صاحبها.
-- عشان كده بننسخه هنا في profiles اللي ليها سياسة قراءة عامة (لوحة الصدارة
-- بتقراها أصلاً). الواجهة بتكتبه لنفسها أول ما تفتح الصفحة لو لسه فاضي.
alter table public.profiles
  add column if not exists display_name text;


-- ٢) نتايج المسابقة — أحسن نتيجة لكل مستخدم في الأسبوع ---------------------------
-- المفتاح المركّب (user_id, week_key) بيضمن صف واحد بس لكل مستخدم في الأسبوع،
-- فالـ upsert بيحدّث نفس الصف بدل ما يكرّره. الترتيب على best_accuracy الأول
-- وبعدين best_score (لو الاتنين متساويين، الأقدم بيتقدّم — updated_at asc).
--
-- xp_today / xp_today_date: سقف يومي على الـ XP من الكويز عشان محدش يفرم XP
-- بإعادة الكويز مليون مرة. نفس فلسفة السقف اليومي في اقتصاد الكوينز.
create table if not exists public.community_quiz_scores (
  user_id        uuid    not null references auth.users (id) on delete cascade,
  week_key       text    not null,
  subject        text,
  best_score     int     not null default 0,
  best_total     int     not null default 0,
  best_accuracy  int     not null default 0,
  attempts       int     not null default 0,
  xp_today       int     not null default 0,
  xp_today_date  date,
  updated_at     timestamptz not null default now(),
  primary key (user_id, week_key)
);

alter table public.community_quiz_scores enable row level security;

-- الكلاينت يقرا صفّه هو بس (عشان «أحسن نتيجة ليك» حتى لو مش في التوب).
-- لوحة الصدارة الكاملة بتيجي من RPC (security definer) اللي بيتخطى الـ RLS،
-- فمفيش سياسة بتفتح صفوف الناس التانية للكلاينت مباشرةً.
-- مافيش سياسة insert/update/delete خالص: كل الكتابة من submit_quiz_result.
drop policy if exists "read own quiz score" on public.community_quiz_scores;
create policy "read own quiz score" on public.community_quiz_scores
  for select using (auth.uid() = user_id);


-- مساعد داخلي: مفتاح الأسبوع الحالي بتوقيت القاهرة (تاريخ الأحد اللي بدأ بيه) ----
-- extract(dow) بترجّع 0 للأحد و6 للسبت، فطرح الرقم ده من تاريخ النهاردة
-- بيرجّعنا لأحد الأسبوع ده. دالة واحدة = مصدر حقيقة واحد للأسبوع، بتستخدمها
-- التلات دوال تحت من غير ما أي واحدة تعيد الحساب غلط.
create or replace function public.current_quiz_week()
returns text
language sql
stable
set search_path = public, pg_catalog
as $$
  select (
    (now() at time zone 'Africa/Cairo')::date
    - extract(dow from (now() at time zone 'Africa/Cairo')::date)::int
  )::text;
$$;


-- ٣) تسجيل نتيجة كويز ----------------------------------------------------------
-- بياخد النتيجة (عدد الصح) والإجمالي، بيتحقق منهم، بيحسب الدقة والـ XP،
-- بيحدّث أحسن نتيجة في الأسبوع، وبيزوّد XP في profiles (بسقف يومي).
--
-- الترتيب على «أحسن نتيجة» معناه إعادة الكويز ما بترفعش ترتيبك غير لو
-- كسرت رقمك، والسقف اليومي بيقفل فرم الـ XP. الاتنين مع بعض = المسابقة
-- بتكافئ الإتقان مش الطحن.
create or replace function public.submit_quiz_result(
  p_subject text,
  p_score   int,
  p_total   int
)
returns table (
  xp_earned   int,
  is_new_best boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid       uuid := auth.uid();
  v_week      text := public.current_quiz_week();
  v_today     date := (now() at time zone 'Africa/Cairo')::date;
  v_accuracy  int;
  v_raw_xp    int;
  v_xp        int;
  v_daily_cap constant int := 150;   -- أقصى XP من الكويز في اليوم الواحد
  v_per_ok    constant int := 8;     -- XP لكل إجابة صح
  v_perfect   constant int := 40;    -- بونص الدرجة الكاملة
  v_row       public.community_quiz_scores%rowtype;
  v_is_best   boolean := false;
  v_xp_today  int := 0;
begin
  -- لازم حساب حقيقي — الزائر (جلسة مجهولة) بيلعب للتمرين بس، مايتسجّلش.
  if v_uid is null then
    raise exception 'submit_quiz_result: لازم تكون داخل بحسابك';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'submit_quiz_result: الزائر مايشاركش في المسابقة — سجّل حساب';
  end if;

  -- تحقق المدخلات: الإجمالي بين ١ و٥٠، والنتيجة بين ٠ والإجمالي.
  -- من غير ده حد يبعت score=999 من الكونسول ويتصدّر.
  if p_total is null or p_total <= 0 or p_total > 50 then
    raise exception 'submit_quiz_result: عدد أسئلة غير صالح: %', p_total;
  end if;
  if p_score is null or p_score < 0 or p_score > p_total then
    raise exception 'submit_quiz_result: نتيجة غير صالحة: % من %', p_score, p_total;
  end if;

  v_accuracy := round((p_score::numeric / p_total) * 100);
  v_raw_xp   := p_score * v_per_ok + case when p_score = p_total then v_perfect else 0 end;

  -- الصف الحالي للأسبوع ده (لو موجود) — عشان نعرف أحسن نتيجة و XP النهاردة
  select * into v_row
    from public.community_quiz_scores
   where user_id = v_uid and week_key = v_week;

  -- سقف الـ XP اليومي: لو آخر مكسب كان في يوم تاني، نصفّر العداد
  if found then
    v_xp_today := case when v_row.xp_today_date is distinct from v_today
                       then 0 else v_row.xp_today end;
  end if;

  v_xp := least(v_raw_xp, greatest(0, v_daily_cap - v_xp_today));
  v_xp_today := v_xp_today + v_xp;

  if not found then
    -- أول محاولة في الأسبوع ده
    v_is_best := true;
    insert into public.community_quiz_scores (
      user_id, week_key, subject, best_score, best_total, best_accuracy,
      attempts, xp_today, xp_today_date, updated_at
    ) values (
      v_uid, v_week, p_subject, p_score, p_total, v_accuracy,
      1, v_xp_today, v_today, now()
    );
  else
    -- محاولة إضافية: نحدّث أحسن نتيجة بس لو اتكسرت
    v_is_best := (v_accuracy > v_row.best_accuracy)
              or (v_accuracy = v_row.best_accuracy and p_score > v_row.best_score);
    update public.community_quiz_scores
       set best_score    = case when v_is_best then p_score    else best_score    end,
           best_total    = case when v_is_best then p_total    else best_total    end,
           best_accuracy = case when v_is_best then v_accuracy  else best_accuracy end,
           subject       = coalesce(p_subject, subject),
           attempts      = attempts + 1,
           xp_today      = v_xp_today,
           xp_today_date = v_today,
           updated_at    = now()
     where user_id = v_uid and week_key = v_week;
  end if;

  -- زوّد الـ XP في البروفايل (بيغذّي لوحة الصدارة الرئيسية)
  if v_xp > 0 then
    update public.profiles
       set xp = coalesce(xp, 0) + v_xp
     where id = v_uid;
  end if;

  return query select v_xp, v_is_best;
end;
$$;


-- لوحة صدارة المسابقة — أعلى اللاعبين في الأسبوع الحالي ------------------------
-- security definer عشان تقرا صفوف كل الناس (الـ RLS بيمنع الكلاينت من كده).
-- بترجّع الاسم المعروض، وبتقع على «لاعب #xxxx» لو لسه فاضي — نفس سلوك
-- لوحة صدارة الداشبورد. is_you عشان الواجهة تعلّم صفّك.
create or replace function public.weekly_quiz_leaderboard(p_limit int default 20)
returns table (
  user_id       uuid,
  display_name  text,
  best_score    int,
  best_total    int,
  best_accuracy int,
  is_you        boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid  uuid := auth.uid();
  v_week text := public.current_quiz_week();
begin
  return query
    select s.user_id,
           coalesce(nullif(btrim(p.display_name), ''),
                    'لاعب #' || left(s.user_id::text, 4)) as display_name,
           s.best_score,
           s.best_total,
           s.best_accuracy,
           (s.user_id = v_uid) as is_you
      from public.community_quiz_scores s
      left join public.profiles p on p.id = s.user_id
     where s.week_key = v_week
     order by s.best_accuracy desc, s.best_score desc, s.updated_at asc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;


-- أحسن نتيجة ليك + ترتيبك في الأسبوع الحالي -----------------------------------
-- بيرجّع صف واحد (أو ولا صف لو لسه ما لعبتش). الترتيب من نافذة rank() على
-- كل صفوف الأسبوع، فبيطلع صح حتى لو إنت بره التوب اللي بتعرضه اللوحة.
create or replace function public.my_weekly_best()
returns table (
  best_score    int,
  best_total    int,
  best_accuracy int,
  attempts      int,
  rank          int
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid  uuid := auth.uid();
  v_week text := public.current_quiz_week();
begin
  if v_uid is null then
    return;
  end if;

  return query
    with ranked as (
      select s.user_id, s.best_score, s.best_total, s.best_accuracy, s.attempts,
             rank() over (order by s.best_accuracy desc, s.best_score desc,
                                   s.updated_at asc) as rnk
        from public.community_quiz_scores s
       where s.week_key = v_week
    )
    select r.best_score, r.best_total, r.best_accuracy, r.attempts, r.rnk::int
      from ranked r
     where r.user_id = v_uid;
end;
$$;


-- صلاحيات التنفيذ — دور authenticated بيغطّي المستخدم المسجّل والزائر
-- (الجلسة المجهولة دورها authenticated برضه). التحقق من الزائر جوه الدالة.
grant execute on function public.current_quiz_week()            to authenticated;
grant execute on function public.submit_quiz_result(text, int, int) to authenticated;
grant execute on function public.weekly_quiz_leaderboard(int)   to authenticated;
grant execute on function public.my_weekly_best()               to authenticated;
