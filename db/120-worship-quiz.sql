-- ============================================================================
-- db/120 — الأسئلة الدينية والمسابقات (مركز العبادات)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القرار: صفحة أسئلة دينية — AI يولّد ١٠ اختيار من متعدد من مصادر موثوقة،
--         وإتمام الجلسة يكسب ١٠ كوينز من مصدر economy جديد worship_quiz،
--         مع لوحة ترتيب أسبوعية (قسم "المسابقات").
--
-- ── إيه اللي الملف ده بيبنيه ──
--  ١) جدول worship_quiz_sessions — جلسة أسئلة واحدة: الأسئلة **بإجاباتها
--     الصحيحة** محفوظة سيرفرًا (jsonb) من لحظة التوليد، فالتصحيح كله سيرفري
--     والكلاينت مابيبعتش غير اختياراته (نفس إثبات D-M-04 في /api/lesson-quiz/submit).
--  ٢) صف economic في coin_source_rules — worship_quiz (١٠ كوينز، سقف ٢/يوم)
--     بنفس أسلوب db/113. الرصيد بيمر عبر award_coins حصراً — مفيش كتابة
--     مباشرة لأي محفظة من هنا.
--  ٣) view worship_quiz_leaderboard — أفضل نتيجة لكل مستخدم في آخر ٧ أيام
--     (بتوقيت Africa/Cairo — نفس منطقة cairo_day في db/113).
--
-- ⚠️⚠️ **التوافق مع db/121** (شغل متوازٍ — worship-local-day):
--    دالة award_coins المحدّثة في db/121 فيها فرع worship_quiz يستقبل
--    ref_id بصيغة 'quiz:<uuid>' ويتحقق من وجود صف جلسة **مكتملة**
--    (completed_at not null) مملوكة للمستخدم في جدول worship_quiz_sessions
--    ده بالظبط. إذن:
--      • الترتيب عند التطبيق: db/120 أولاً (الجدول لازم يتعمل قبل الدالة)،
--        ثم db/121.
--      • الجدول ده (اسمه وأعمدته user_id/completed_at) هما عقد الإثبات
--        اللي فرع db/121 بيقرا منه — ماتغيّرش فيهم من غير مراجعة db/121.
--      • ملف ده مسؤول عن: الجدول + صف coin_source_rules + الـ view فقط.
--        دالة award_coins مش هنا (db/113 النسخة الموحّدة، وdb/121 الفرع).
--
-- idempotent بالكامل (if not exists / on conflict / create or replace) —
-- BEGIN/COMMIT واحد.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- ١) جدول جلسات الأسئلة
--    questions: مصفوفة JSON [{question, options:[4], correct:0..3, source,
--               explanation}] — **بإجاباتها الصحيحة، سيرفر فقط**. الـ RLS
--               owner-only فالكلاينت مش شايفها أصلاً من غير تصفية.
--    answers:   اختيارات الطالب بنفس الترتيب — بتتحدّث مع التصحيح.
--    day:       يوم UTC (نفس اصطلاح worship_progress).
-- ----------------------------------------------------------------------------
create table if not exists public.worship_quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  questions jsonb not null,
  answers jsonb,
  score int not null default 0,
  total int not null default 10,
  day date not null default (now() at time zone 'utc')::date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.worship_quiz_sessions enable row level security;

drop policy if exists "worship_quiz_sessions: owner select" on public.worship_quiz_sessions;
create policy "worship_quiz_sessions: owner select"
  on public.worship_quiz_sessions
  for select
  using (user_id = auth.uid());

drop policy if exists "worship_quiz_sessions: owner insert" on public.worship_quiz_sessions;
create policy "worship_quiz_sessions: owner insert"
  on public.worship_quiz_sessions
  for insert
  with check (user_id = auth.uid());

drop policy if exists "worship_quiz_sessions: owner update" on public.worship_quiz_sessions;
create policy "worship_quiz_sessions: owner update"
  on public.worship_quiz_sessions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists worship_quiz_sessions_user_day_idx
  on public.worship_quiz_sessions (user_id, day desc);

create index if not exists worship_quiz_sessions_week_idx
  on public.worship_quiz_sessions (completed_at desc)
  where completed_at is not null;

-- ----------------------------------------------------------------------------
-- ٢) مصدر الاقتصاد — worship_quiz (١٠ كوينز، سقف ٢/يوم)
--    نفس أسلوب db/113: المبلغ مرآة لـ COIN_SOURCES في lib/shop/economy.ts
--    (مصدر الحقيقة TS)، والسييد بيتولّد من scripts/shop-seed.mjs.
--    ⚠️ مصدر شغّال لازم يكون ليه daily_cap (قاعدة db/shop.sql رقم ٣) —
--       ١٠ × ٢ = ٢٠ كوينز أقصى كسب يومي من الأسئلة الدينية.
--    الفروع: المصدر بيتصرف من السيرفر بعد تصحيح سيرفري لجلسة كاملة —
--    الكلاينت مابيبعتش مبلغ، والفهرس الفريد (user_id, source, ref_id)
--    في db/shop.sql بيمنع منح نفس الجلسة مرتين.
-- ----------------------------------------------------------------------------
insert into public.coin_source_rules (id, amount, daily_cap, is_live) values
  ('worship_quiz', 10, 2, true)
on conflict (id) do update set
  amount = excluded.amount,
  daily_cap = excluded.daily_cap,
  is_live = excluded.is_live;

-- ----------------------------------------------------------------------------
-- ٣) لوحة الترتيب الأسبوعية — أفضل نتيجة لكل مستخدم في آخر ٧ أيام
--    (بتوقيت Africa/Cairo، نفس منطقة cairo_day في db/113).
--    security_invoker = true (نفس أسلوب db/116-market-hybrid): الاستعلام
--    بيتنفّذ بصلاحيات المستخدم المنادي — الـ RLS owner-only على
--    worship_quiz_sessions بتطبّق.
--
--    ⚠️ ملحوظة تصميمية صريحة: مع RLS owner-only، المستخدم هيشوف في الـ view
--       قرار المنسق: لوحة الترتيب العامة بتشتغل بدالة SECURITY DEFINER
--       (تحت) بترجّع الأعمدة الآمنة بس — مفيش user_id ولا أي بيانات حساسة،
--       والمكافأة الفعلية بتفضل owner-only على worship_quiz_sessions.
-- ----------------------------------------------------------------------------
create or replace view public.worship_quiz_leaderboard
with (security_invoker = true) as
select
  s.user_id,
  max(s.score)              as best_score,
  max(s.total)              as best_total,
  count(*)                  as sessions_count,
  max(s.completed_at)       as last_completed_at,
  coalesce(p.display_name, 'قارئ') as player_name
from public.worship_quiz_sessions s
left join public.profiles p on p.id = s.user_id
where s.completed_at is not null
  and s.completed_at >= ((now() at time zone 'Africa/Cairo')::date - interval '6 days')
group by s.user_id, coalesce(p.display_name, 'قارئ')
order by best_score desc, last_completed_at asc;

-- لوحة الترتيب العامة — SECURITY DEFINER عشان تتجاوز RLS owner-only،
-- وبتفضح الأعمدة الآمنة بس (الاسم + النتيجة) بدون user_id. القراءة
-- للمستخدمين المسجلين فقط.
create or replace function public.worship_quiz_top(n int default 10)
returns table (
  player_name text,
  best_score int,
  sessions_count bigint,
  last_completed_at timestamptz
)
language sql stable
security definer
set search_path = public, pg_catalog
as $$
  select
    l.player_name,
    l.best_score,
    l.sessions_count,
    l.last_completed_at
  from public.worship_quiz_leaderboard l
  order by l.best_score desc, l.last_completed_at asc
  limit greatest(coalesce(n, 10), 1)::int;
$$;

revoke all on function public.worship_quiz_top(int) from public;
grant execute on function public.worship_quiz_top(int) to authenticated;

commit;
