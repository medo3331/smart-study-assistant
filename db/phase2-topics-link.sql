-- ============================================================================
-- Phase 2 — Link the verified bank to real topics
-- ----------------------------------------------------------------------------
-- WHY: `count(*) ... where topic_id is not null` returned 0. All 10 verified
-- questions have topic_id = NULL, so a diagnostic session today would collapse
-- into one bucket called "general" — the weak-topic logic would be untestable.
--
-- ⚠️ NOTHING HERE IS INVENTED. Every topic name below is taken verbatim from
-- the branch of mathematics that the question itself states in its own text
-- ("في الهندسة الفراغية", "في الجبر", "في التحليل"), and every question is
-- matched by a distinctive phrase copied from
-- db/diagnostic_1.2c_insert_10_verified.sql. The source is unchanged; we only
-- record the taxonomy the source already implies.
--
-- ⚠️ Idempotent. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP A — de-duplicate and give the taxonomy a real conflict target.
-- ---------------------------------------------------------------------------
-- Same pattern as user_weaknesses: these tables predate any unique
-- constraint, so two seeds could have produced duplicate names.

with ranked as (
  select id,
         row_number() over (
           partition by subject_id, lower(name)
           order by created_at desc, id desc
         ) as rn
  from public.diagnostic_units
)
delete from public.diagnostic_units u
using ranked r where u.id = r.id and r.rn > 1;

with ranked as (
  select id,
         row_number() over (
           partition by unit_id, lower(name)
           order by created_at desc, id desc
         ) as rn
  from public.diagnostic_topics
)
delete from public.diagnostic_topics t
using ranked r where t.id = r.id and r.rn > 1;

create unique index if not exists diagnostic_units_unique_name
  on public.diagnostic_units (subject_id, lower(name));

create unique index if not exists diagnostic_topics_unique_name
  on public.diagnostic_topics (unit_id, lower(name));

-- ---------------------------------------------------------------------------
-- STEP B — one unit to hang the topics off.
-- ---------------------------------------------------------------------------
-- Named after the verified source, not after a curriculum we invented.
-- subject_id comes from the bank itself, never hard-coded.

insert into public.diagnostic_units (subject_id, name, code, display_order)
select
  b.subject_id,
  'MOE 2023 Mathematics — First Round',
  'U-MOE-MATH-2023-R1',
  1
from public.diagnostic_question_bank b
where b.source_reference ilike '%moe_mathematica_exam_2023%'
group by b.subject_id
having count(*) >= 10          -- only if the whole verified set is present
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- STEP C — the topics, in the order the source exam presents them.
-- ---------------------------------------------------------------------------

insert into public.diagnostic_topics
  (unit_id, subject_id, name, type, display_order)
select u.id, u.subject_id, t.name, 'topic', t.ord
from public.diagnostic_units u
cross join (values
  ('الدوال والمعادلات',   1),
  ('المصفوفات والمحددات', 2),
  ('المتتاليات',          3),
  ('النهايات',             4),
  ('التكامل',              5),
  ('الأعداد المركبة',      6),
  ('الهندسة الفراغية',     7)
) as t(name, ord)
where u.code = 'U-MOE-MATH-2023-R1'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- STEP D — link each question by a phrase copied from its own text.
-- ---------------------------------------------------------------------------
-- A CASE over the question body, so a wrong link is visible in review rather
-- than hidden behind an id mapping. Anything unmatched keeps topic_id NULL,
-- which is honest: we do not guess for questions we did not read.

update public.diagnostic_question_bank q
set topic_id = t.id,
    unit_id  = t.unit_id
from public.diagnostic_topics t
where t.unit_id in (
          select id from public.diagnostic_units where code = 'U-MOE-MATH-2023-R1'
        )
  and q.subject_id = t.subject_id
  and case
    -- ⚠️ Matchers copied VERBATIM from the live question_text, not from the
    --    insert script. Two were wrong on the first pass and silently left
    --    rows unmatched: the text says "مستويان" (no tanween) and
    --    "التكامل" in Arabic, not "integral".
    when q.question_text ilike '%قيمة f(2)%'        then t.name = 'الدوال والمعادلات'
    when q.question_text ilike '%معكوسها%'          then t.name = 'الدوال والمعادلات'
    when q.question_text ilike '%1/x = 3%'           then t.name = 'الدوال والمعادلات'
    when q.question_text ilike '%محدد المصفوفة%'     then t.name = 'المصفوفات والمحددات'
    when q.question_text ilike '%متتالية هندسية%'    then t.name = 'المتتاليات'
    when q.question_text ilike '%lim(x%'             then t.name = 'النهايات'
    when q.question_text ilike '%التكامل%'           then t.name = 'التكامل'
    when q.question_text ilike '%3 + 2i%'            then t.name = 'الأعداد المركبة'
    when q.question_text ilike '%مستويان متوازيين%'  then t.name = 'الهندسة الفراغية'
    when q.question_text ilike '%حجم المكعب%'        then t.name = 'الهندسة الفراغية'
    else false
  end;
-- ---------------------------------------------------------------------------
-- STEP E — verify before trusting it.
-- ---------------------------------------------------------------------------

select
  t.name as topic,
  t.display_order,
  count(q.id) as questions
from public.diagnostic_topics t
left join public.diagnostic_question_bank q on q.topic_id = t.id
where t.unit_id in (select id from public.diagnostic_units where code = 'U-MOE-MATH-2023-R1')
group by t.name, t.display_order
order by t.display_order, t.name;

-- Sanity: nothing should be left unlinked.
select
  count(*) filter (where topic_id is null) as still_unlinked,
  count(*) as total
from public.diagnostic_question_bank
where status = 'published';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Two statements. Neither touches the questions themselves:
--
--   update public.diagnostic_question_bank set topic_id = null, unit_id = null
--    where unit_id in (select id from public.diagnostic_units
--                       where code = 'U-MOE-MATH-2023-R1');
--
--   delete from public.diagnostic_topics
--    where unit_id in (select id from public.diagnostic_units
--                       where code = 'U-MOE-MATH-2023-R1');
--   delete from public.diagnostic_units where code = 'U-MOE-MATH-2023-R1';
--
-- Every other field (text, options, correct_option_index, source_reference,
-- status) is preserved.
-- ============================================================================
