# MAGICLY — Sprint 2b.2 P1 — Revision 9
## Memory Migration: Fix 10 defects from independent review

> **Mode:** STRICT READ-ONLY (design + SQL draft only). No DB connection, no SQL execution, no commit/push.
> **Output:** `docs/REVISION_9_REPORT.md` (single designated file).
> **Date:** 2026-11-10

---

## 1. Executive Summary (ملخص تنفيذي)

Revision 9 is the ninth iteration of the Sprint 2b.2 P1 student-memory migration. It retains the additive, backward-compatible design of Revision 8 (12 kinds, 12 new columns, RPC, expire helper, trigger, indexes) but corrects all ten defects raised by the independent review plus a new P0 source-forgery vulnerability. Key corrections: drift detection before every `DROP CONSTRAINT`; `0::oid` instead of the invalid `'public'::regrole::oid`; exact-definition comparison for all six CHECK constraints; full FK target/column/confdeltype/convalidated verification; true per-kind replace in `replace_session_memories` (delete stale values, then upsert) with a seven-scenario behavior matrix; exact `tgtype = 23` plus `tgfoid` binding; exact ACL set matching with explicit revokes; per-policy RLS verification; relocation of all data checks into Phase 0 (pre-commit) so Phase 3 is post-commit smoke only; and a new `ai_memories_protect_source` trigger that rejects forged `source`/`confidence` for non-privileged callers while allowing service_role and SECURITY DEFINER owners. The verdict is **READY FOR STATIC REVIEW** — not execution-ready; database preflight, clone tests, and production approval remain separate gates. / المراجعة 9 هي التكرار التاسع لترحيل ذاكرة الطالب في Sprint 2b.2 P1. تحافظ على التصميم الإضافي (12 نوعًا، 12 عمودًا جديدًا، RPC، مساعد انتهاء، محفّز، فهارس) لكنها تصحح جميع العيوب العشرة من المراجعة المستقلة بالإضافة إلى ثغرة P0 جديدة (تزوير source). التدقيق (static review) فقط — التحقق (clone tests) والاعتماد (production) بوابات منفصلة.

---

## 2. Defect Mapping Table (جدول ربط العيوب)

| # | Defect (العيب) | Location in Rev 8 (الموقع) | Fix in Rev 9 (الإصلاح) | Verification (التحقق) |
|---|---|---|---|---|
| P0-01 | Drop constraint without checking definition | Rev8 Phase 1 `drop constraint if exists` for 6 CHECKs | DO block: `pg_get_constraintdef` compare to expected; RAISE on drift before drop | Clone: wrong-def constraint → STOP |
| P0-02 | Invalid cast `'public'::regrole::oid` | Rev8 ACL checks | Replace with `0::oid`; keep `'anon'/'authenticated'::regrole::oid` (valid) | No "role public does not exist" |
| P0-03 | Incomplete CHECK verification (2 of 6) | Rev8 Phase 3 only kind+layer full compare | All 6 CHECKs exact `pg_get_constraintdef` compare + RAISE NOTICE actual value | All 6 compared by definition |
| P0-04 | FK verification weak | Rev8 only "FK exists on subject_id" | Verify target table, single col (conkey/confkey), confdeltype='n', convalidated=true for both FKs | Both FKs fully verified |
| P1-01 | `replace_session_memories` doesn't actually replace | Rev8 deletes ALL session kinds then upserts only supplied (accumulation on new value) | Per-kind: delete rows where value <> new, then upsert new; empty/placeholder preserves kind | 7-scenario matrix |
| P1-02 | Trigger tgtype check incomplete | Rev8 `(tgtype & 22)=22` | Exact `tgtype = 23` + `tgfoid` matches `ai_memories_defaults` | Both verified |
| P1-03 | Function ACL not fully verified | Rev8 aclexplode "has/doesn't have" | Exact array_agg set match; explicit REVOKE from public/anon first | Exact set match |
| P1-04 | RLS verification weak (count only) | Rev8 `count(*)=4` | Each of 4 policies verified by cmd + qual/with_check + total count | 4 policies individually |
| P1-05 | Phase 3 runs after COMMIT (verify too late) | Rev8 Phase 3 data checks post-commit | Move ALL data checks to Phase 0 (pre-commit STOP); Phase 3 = smoke only | Clone: confidence=0.7 legacy row → Phase 0 STOP |
| NEW P0 | RLS allows forging source/confidence | Rev8 trigger only fills NULLs | New trigger `ai_memories_protect_source`: reject forged source/confidence for non-privileged; allow service_role + SECURITY DEFINER owner | Clone: 3 forgery scenarios |

---

## 3. Complete SQL (Phases 0 → 4C)

### Phase 0 — Preflight (READ-ONLY, pre-commit) / فحص مسبق (قراءة فقط، قبل COMMIT)

```sql
-- Phase 0: READ-ONLY preflight. Wraps in transaction then ROLLS BACK.
-- Phase 0: فحص مسبق للقراءة فقط. يُغلّف في معاملة ثم ROLLBACK.
begin;

-- 0.1 Target exists / الهدف موجود
do $$
begin
  if to_regclass('public.ai_memories') is null then
    raise exception 'PREFLIGHT_FAIL: public.ai_memories does not exist';
  end if;
end $$;

-- 0.2 Base constraints have EXPECTED definitions (drift guard) / القيود الأساسية بالتعريفات المتوقعة
do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint
   where conrelid = 'public.ai_memories'::regclass and conname = 'ai_memories_kind_check';
  if d is null then raise exception 'PREFLIGHT_FAIL: ai_memories_kind_check missing'; end if;
  -- expected base 6-kind definition
  if d <> 'CHECK ((kind = ANY (ARRAY[''weak_topic''::text, ''preferred_style''::text, ''recent_subject''::text, ''recent_lesson''::text, ''completed_topic''::text, ''common_mistake''::text])))' then
    raise notice 'Phase0: base kind def = %', d;
  end if;
end $$;

-- 0.3 Legacy rows with trusted values must NOT exist (P1-05) / صفوف legacy بقيم موثوقة يجب ألا توجد
do $$
declare n int;
begin
  -- confidence > 0.5 with source NULL (backfill would keep high confidence)
  select count(*) into n from public.ai_memories
   where source is null and confidence is not null and confidence > 0.5;
  if n > 0 then
    raise exception 'PREFLIGHT_FAIL: % legacy rows have confidence>0.5 with source NULL', n;
  end if;
  -- any trusted source already present (should not happen pre-migration)
  select count(*) into n from public.ai_memories
   where source in ('system_observed','diagnostic_evidence') or confidence > 0.5;
  if n > 0 then
    raise exception 'PREFLIGHT_FAIL: % rows already carry trusted source/confidence', n;
  end if;
end $$;

-- 0.4 Skew gate: created_at must not exceed updated_at (if column exists) / بوابة الانحراف
do $$
declare n int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='ai_memories' and column_name='created_at') then
    select count(*) into n from public.ai_memories
     where created_at is not null and created_at > updated_at;
    if n > 0 then
      raise exception 'PREFLIGHT_FAIL: % rows have created_at > updated_at (skew)', n;
    end if;
  end if;
end $$;

-- 0.5 Single-instant cluster gate (STOP) / بوابة تجمّع لحظة واحدة
do $$
declare distinct_ts int; total int;
begin
  select count(distinct updated_at), count(*) into distinct_ts, total from public.ai_memories;
  if total > 5 and distinct_ts = 1 then
    raise exception 'PREFLIGHT_FAIL: all % rows share a single updated_at (single-instant cluster)', total;
  end if;
end $$;

-- 0.6 FK targets exist / أهداف FK موجودة
do $$
begin
  if to_regclass('public.subjects') is null then
    raise exception 'PREFLIGHT_FAIL: public.subjects missing';
  end if;
  if to_regclass('public.chat_conversations') is null then
    raise exception 'PREFLIGHT_FAIL: public.chat_conversations missing';
  end if;
end $$;

rollback;
-- Phase 0 ends here. If any RAISE EXCEPTION fired, migration must NOT proceed.
```

### Phase 1 — Transactional migration / الترحيل المعاملاتي

```sql
begin;

-- 1.1 Drift detection + drop + add columns (additive) / كشف انحراف + إسقاط + إضافة أعمدة
-- created_at added NULLABLE first (backfill → default/NOT NULL last)
alter table public.ai_memories
  add column if not exists layer text,
  add column if not exists source text,
  add column if not exists confidence numeric(4,3),
  add column if not exists language text,
  add column if not exists subject_id uuid,
  add column if not exists topic_key text,
  add column if not exists conversation_id uuid,
  add column if not exists evidence_ref jsonb,
  add column if not exists created_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists status text;

-- FKs (add if missing) — single column, SET NULL / FK (أضف إن كانت مفقودة)
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_subject_id_fkey') then
    alter table public.ai_memories
      add constraint ai_memories_subject_id_fkey
      foreign key (subject_id) references public.subjects(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_conversation_id_fkey') then
    alter table public.ai_memories
      add constraint ai_memories_conversation_id_fkey
      foreign key (conversation_id) references public.chat_conversations(id) on delete set null;
  end if;
end $$;

-- 1.2 Drift-guarded CHECK drops / إسقاط CHECK مع كشف انحراف
do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_layer_check';
  if d is not null and d <> 'CHECK ((layer IS NULL) OR (layer = ANY (ARRAY[''profile''::text, ''behavior''::text, ''progress_hint''::text, ''conversation''::text])))' then
    raise exception 'DRIFT_DETECTED: ai_memories_layer_check unexpected: %', d;
  end if;
end $$;
alter table public.ai_memories drop constraint if exists ai_memories_layer_check;
alter table public.ai_memories add constraint ai_memories_layer_check
  check (layer is null or layer in ('profile','behavior','progress_hint','conversation'));

do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_source_check';
  if d is not null and d <> 'CHECK ((source IS NULL) OR (source = ANY (ARRAY[''explicit_student''::text, ''confirmed_by_student''::text, ''system_observed''::text, ''diagnostic_evidence''::text, ''inferred_ai''::text, ''legacy_unknown''::text])))' then
    raise exception 'DRIFT_DETECTED: ai_memories_source_check unexpected: %', d;
  end if;
end $$;
alter table public.ai_memories drop constraint if exists ai_memories_source_check;
alter table public.ai_memories add constraint ai_memories_source_check
  check (source is null or source in ('explicit_student','confirmed_by_student','system_observed','diagnostic_evidence','inferred_ai','legacy_unknown'));

do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_confidence_check';
  if d is not null and d <> 'CHECK ((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))' then
    raise exception 'DRIFT_DETECTED: ai_memories_confidence_check unexpected: %', d;
  end if;
end $$;
alter table public.ai_memories drop constraint if exists ai_memories_confidence_check;
alter table public.ai_memories add constraint ai_memories_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_language_check';
  if d is not null and d <> 'CHECK ((language IS NULL) OR (language = ANY (ARRAY[''ar''::text, ''en''::text, ''mixed''::text])))' then
    raise exception 'DRIFT_DETECTED: ai_memories_language_check unexpected: %', d;
  end if;
end $$;
alter table public.ai_memories drop constraint if exists ai_memories_language_check;
alter table public.ai_memories add constraint ai_memories_language_check
  check (language is null or language in ('ar','en','mixed'));

do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_status_check';
  if d is not null and d <> 'CHECK ((status = ANY (ARRAY[''active''::text, ''superseded''::text, ''expired''::text])))' then
    raise exception 'DRIFT_DETECTED: ai_memories_status_check unexpected: %', d;
  end if;
end $$;
alter table public.ai_memories drop constraint if exists ai_memories_status_check;
alter table public.ai_memories add constraint ai_memories_status_check
  check (status in ('active','superseded','expired'));

-- kind CHECK widen (drift-guarded) / توسيع CHECK للأنواع
do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_kind_check';
  if d is not null and d not in (
    'CHECK ((kind = ANY (ARRAY[''weak_topic''::text, ''preferred_style''::text, ''recent_subject''::text, ''recent_lesson''::text, ''completed_topic''::text, ''common_mistake''::text])))',
    'CHECK ((kind = ANY (ARRAY[''weak_topic''::text, ''preferred_style''::text, ''recent_subject''::text, ''recent_lesson''::text, ''completed_topic''::text, ''common_mistake''::text, ''explicit_style''::text, ''example_domain''::text, ''language_pref''::text, ''goal_note''::text, ''misconception_note''::text, ''interest_topic''::text])))'
  ) then
    raise exception 'DRIFT_DETECTED: ai_memories_kind_check unexpected: %', d;
  end if;
end $$;
alter table public.ai_memories drop constraint if exists ai_memories_kind_check;
alter table public.ai_memories add constraint ai_memories_kind_check
  check (kind in (
    'weak_topic','preferred_style','recent_subject','recent_lesson','completed_topic','common_mistake',
    'explicit_style','example_domain','language_pref','goal_note','misconception_note','interest_topic'
  ));

-- 1.3 Backfill (per-column COALESCE; never overwrite non-NULL) / تعبئة (COALESCE لكل عمود)
-- created_at: never overwrite pre-existing; skew gate already passed in Phase 0
update public.ai_memories
   set created_at = coalesce(created_at, updated_at)
 where created_at is null;

-- kind/source/confidence/layer/topic_key/expires_at for legacy rows only where null
update public.ai_memories
   set layer = coalesce(layer, case kind
         when 'recent_subject' then 'conversation'
         when 'recent_lesson'  then 'conversation'
         when 'preferred_style' then 'behavior'
         when 'weak_topic' then 'progress_hint'
         when 'common_mistake' then 'progress_hint'
         when 'completed_topic' then 'progress_hint'
         else 'conversation' end),
       source = coalesce(source, 'legacy_unknown'),
       confidence = coalesce(confidence, case kind
         when 'preferred_style' then 0.5
         else 0.3 end),
       topic_key = coalesce(topic_key, lower(btrim(value))),
       expires_at = coalesce(expires_at, case kind
         when 'recent_subject' then updated_at + interval '30 days'
         when 'recent_lesson'  then updated_at + interval '30 days'
         else updated_at + interval '90 days' end),
       status = coalesce(status, 'active')
 where layer is null or source is null or confidence is null
    or topic_key is null or expires_at is null or status is null;

-- 1.4 created_at DEFAULT + NOT NULL (last) / DEFAULT + NOT NULL (أخيرًا)
alter table public.ai_memories alter column created_at set default now();
alter table public.ai_memories alter column created_at set not null;
alter table public.ai_memories alter column status set default 'active';
alter table public.ai_memories alter column status set not null;

-- 1.5 Trigger: ai_memories_defaults (BEFORE INSERT OR UPDATE, NO UPDATE OF) / محفّز defaults
create or replace function public.ai_memories_defaults()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  new.layer := coalesce(new.layer, case new.kind
    when 'recent_subject' then 'conversation'
    when 'recent_lesson'  then 'conversation'
    when 'preferred_style' then 'behavior'
    when 'explicit_style'  then 'behavior'
    when 'language_pref'   then 'behavior'
    when 'weak_topic'      then 'progress_hint'
    when 'common_mistake'  then 'progress_hint'
    when 'completed_topic' then 'progress_hint'
    when 'misconception_note' then 'progress_hint'
    when 'example_domain'  then 'conversation'
    when 'goal_note'       then 'conversation'
    when 'interest_topic'  then 'conversation'
    else 'conversation' end);
  new.source := coalesce(new.source, 'legacy_unknown');
  new.confidence := coalesce(new.confidence, 0.3);
  new.topic_key := coalesce(new.topic_key, lower(btrim(new.value)));
  new.created_at := coalesce(new.created_at, now());
  new.status := coalesce(new.status, 'active');
  new.expires_at := coalesce(new.expires_at, new.updated_at + interval '90 days');
  -- updated_at is NEVER assigned here
  return new;
end;
$$;

drop trigger if exists ai_memories_defaults on public.ai_memories;
create trigger ai_memories_defaults
  before insert or update on public.ai_memories
  for each row execute function public.ai_memories_defaults();

-- 1.6 Trigger: protect source/confidence forgery (NEW P0) / حماية تزوير source/confidence
create or replace function public.ai_memories_protect_source()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_role text := coalesce((auth.jwt() ->> 'role'), '');
begin
  -- privileged DB roles / service_role bypass (backend trusted)
  if current_user in ('postgres','supabase_admin','supabase_auth_admin') then return new; end if;
  if v_role = 'service_role' then return new; end if;
  -- authenticated/anon: restrict source
  if new.source is not null and new.source <> 'explicit_student' then
    raise exception 'source_forgery_rejected: role % cannot set source = %', v_role, new.source
      using errcode = '42501';
  end if;
  -- cap confidence for non-diagnostic sources
  if new.confidence is not null and new.confidence > 0.5 then
    if new.source is null or new.source <> 'explicit_student' then
      raise exception 'confidence_cap_rejected: role % cannot set confidence = % without valid source', v_role, new.confidence
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_memories_protect_source on public.ai_memories;
create trigger ai_memories_protect_source
  before insert or update on public.ai_memories
  for each row execute function public.ai_memories_protect_source();

revoke all on function public.ai_memories_defaults() from public, anon, authenticated;
revoke all on function public.ai_memories_protect_source() from public, anon, authenticated;

-- 1.7 RPC: replace_session_memories (true per-kind replace) / RPC استبدال جلسة (استبدال حقيقي لكل نوع)
create or replace function public.replace_session_memories(p_user_id uuid, p_subject text, p_lesson text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_lesson  text := nullif(btrim(coalesce(p_lesson,  '')), '');
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;
  if auth.uid() is distinct from p_user_id then
    raise exception 'not_your_memory' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- subject kind: independent replace / نوع subject: استبدال مستقل
  if v_subject is not null and v_subject <> 'المادة الحالية' then
    delete from public.ai_memories
     where user_id = p_user_id and kind = 'recent_subject'
       and value <> left(v_subject, 300);
    insert into public.ai_memories
      (user_id, kind, value, updated_at, layer, source, confidence, topic_key, expires_at, status)
    values
      (p_user_id, 'recent_subject', left(v_subject, 300), now(),
       'conversation', 'inferred_ai', 0.3, lower(v_subject), now() + interval '30 days', 'active')
    on conflict (user_id, kind, value) do update
      set updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          status = 'active';
  end if;

  -- lesson kind: independent replace / نوع lesson: استبدال مستقل
  if v_lesson is not null and v_lesson <> 'الدرس الحالي' then
    delete from public.ai_memories
     where user_id = p_user_id and kind = 'recent_lesson'
       and value <> left(v_lesson, 300);
    insert into public.ai_memories
      (user_id, kind, value, updated_at, layer, source, confidence, topic_key, expires_at, status)
    values
      (p_user_id, 'recent_lesson', left(v_lesson, 300), now(),
       'conversation', 'inferred_ai', 0.3, lower(v_lesson), now() + interval '30 days', 'active')
    on conflict (user_id, kind, value) do update
      set updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          status = 'active';
  end if;
  -- both empty/placeholder => no-op (no delete) / كلاهما فارغ/عنصر نائب => لا عملية
end;
$$;

comment on function public.replace_session_memories(uuid, text, text) is
  'Sprint 2b.2 P1 R9 — atomic per-kind replace for session memories.';

revoke all on function public.replace_session_memories(uuid, text, text) from public, anon;
grant execute on function public.replace_session_memories(uuid, text, text) to authenticated;

-- 1.8 expire_stale_memories (service_role only) / مساعد انتهاء (service_role فقط)
create or replace function public.expire_stale_memories()
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.ai_memories
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_memories() from public, anon, authenticated;
grant execute on function public.expire_stale_memories() to service_role;

commit;
```

### Phase 2 — Concurrent indexes (autocommit, top-level) / فهارس متزامنة (autocommit، top-level)

```sql
-- Phase 2 runs OUTSIDE any transaction (autocommit). Top-level only.
-- Phase 2 تُنفَّذ خارج أي معاملة (autocommit). top-level فقط.
-- State machine (manual):
--   (a) ABSENT        -> run CREATE INDEX CONCURRENTLY below
--   (b) PRESENT-CORRECT (full def match) -> skip
--   (c) PRESENT-WRONG/INVALID -> STOP; recover (drop invalid index manually) then re-run

-- recovery check (read-only):
-- select indexname, indexdef from pg_indexes where schemaname='public' and tablename='ai_memories';

create index concurrently if not exists ai_memories_user_layer_updated_idx
  on public.ai_memories (user_id, layer, updated_at desc);

create index concurrently if not exists ai_memories_user_expires_idx
  on public.ai_memories (user_id, expires_at)
  where expires_at is not null;

create index concurrently if not exists ai_memories_user_subject_topic_idx
  on public.ai_memories (user_id, subject_id, topic_key);

-- NOTE: original ai_memories_user_updated_idx is NEVER dropped.
```

### Phase 3 — Post-commit smoke (structure only) / فحص دخاني بعد COMMIT (البنية فقط)

```sql
-- Phase 3 runs AFTER commit. Structure only — NO data checks (those are Phase 0).
-- Phase 3 تُنفَّذ بعد COMMIT. البنية فقط — لا فحوصات بيانات (تلك في Phase 0).

-- 3.1 All 12 columns exist with expected types
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='ai_memories'
   and column_name in ('layer','source','confidence','language','subject_id','topic_key',
                       'conversation_id','evidence_ref','created_at','last_used_at','expires_at','status');

-- 3.2 All 6 CHECKs exact definition (P0-03) / جميع CHECK الستة بتعريف دقيق
do $$
declare
  d text; expected text[];
begin
  expected := array[
    'CHECK ((kind = ANY (ARRAY[''weak_topic''::text, ''preferred_style''::text, ''recent_subject''::text, ''recent_lesson''::text, ''completed_topic''::text, ''common_mistake''::text, ''explicit_style''::text, ''example_domain''::text, ''language_pref''::text, ''goal_note''::text, ''misconception_note''::text, ''interest_topic''::text])))',
    'CHECK ((layer IS NULL) OR (layer = ANY (ARRAY[''profile''::text, ''behavior''::text, ''progress_hint''::text, ''conversation''::text])))',
    'CHECK ((source IS NULL) OR (source = ANY (ARRAY[''explicit_student''::text, ''confirmed_by_student''::text, ''system_observed''::text, ''diagnostic_evidence''::text, ''inferred_ai''::text, ''legacy_unknown''::text])))',
    'CHECK ((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))',
    'CHECK ((language IS NULL) OR (language = ANY (ARRAY[''ar''::text, ''en''::text, ''mixed''::text])))',
    'CHECK ((status = ANY (ARRAY[''active''::text, ''superseded''::text, ''expired''::text])))'
  ];
  for i in 1..6 loop
    -- compare each by name
  end loop;
  -- kind
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_kind_check';
  raise notice 'Phase3 kind def = %', d;
  if d <> expected[1] then raise exception 'PHASE3_FAIL kind mismatch: %', d; end if;
  -- layer
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_layer_check';
  raise notice 'Phase3 layer def = %', d;
  if d <> expected[2] then raise exception 'PHASE3_FAIL layer mismatch: %', d; end if;
  -- source
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_source_check';
  raise notice 'Phase3 source def = %', d;
  if d <> expected[3] then raise exception 'PHASE3_FAIL source mismatch: %', d; end if;
  -- confidence
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_confidence_check';
  raise notice 'Phase3 confidence def = %', d;
  if d <> expected[4] then raise exception 'PHASE3_FAIL confidence mismatch: %', d; end if;
  -- language
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_language_check';
  raise notice 'Phase3 language def = %', d;
  if d <> expected[5] then raise exception 'PHASE3_FAIL language mismatch: %', d; end if;
  -- status
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.ai_memories'::regclass and conname='ai_memories_status_check';
  raise notice 'Phase3 status def = %', d;
  if d <> expected[6] then raise exception 'PHASE3_FAIL status mismatch: %', d; end if;
end $$;

-- 3.3 FK verification (P0-04): target table, single col, confdeltype='n', convalidated
do $$
declare
  r record;
begin
  -- subject_id -> subjects(id)
  select count(*) into r from pg_constraint
   where conrelid='public.ai_memories'::regclass and conname='ai_memories_subject_id_fkey';
  -- reuse r as int via separate var
end $$;

do $$
declare c int; k int[]; fk int[]; del char; val bool; tgt oid;
begin
  select count(*) into c from pg_constraint
   where conrelid='public.ai_memories'::regclass and conname='ai_memories_subject_id_fkey';
  if c <> 1 then raise exception 'PHASE3_FAIL subject FK count=% (expected 1)', c; end if;
  select conkey, confkey, confdeltype, convalidated, confrelid
    into k, fk, del, val, tgt
    from pg_constraint
   where conrelid='public.ai_memories'::regclass and conname='ai_memories_subject_id_fkey';
  if array_length(k,1) <> 1 or array_length(fk,1) <> 1 then
    raise exception 'PHASE3_FAIL subject FK not single-column: conkey=% confkey=%', k, fk;
  end if;
  if del <> 'n' then raise exception 'PHASE3_FAIL subject FK confdeltype=% (expected n)', del; end if;
  if val is not true then raise exception 'PHASE3_FAIL subject FK not validated'; end if;
  if tgt <> 'public.subjects'::regclass then raise exception 'PHASE3_FAIL subject FK target=% (expected subjects)', tgt; end if;
  -- conversation
  select count(*) into c from pg_constraint
   where conrelid='public.ai_memories'::regclass and conname='ai_memories_conversation_id_fkey';
  if c <> 1 then raise exception 'PHASE3_FAIL conversation FK count=%', c; end if;
  select conkey, confkey, confdeltype, convalidated, confrelid
    into k, fk, del, val, tgt
    from pg_constraint
   where conrelid='public.ai_memories'::regclass and conname='ai_memories_conversation_id_fkey';
  if array_length(k,1) <> 1 or array_length(fk,1) <> 1 then
    raise exception 'PHASE3_FAIL conversation FK not single-column';
  end if;
  if del <> 'n' then raise exception 'PHASE3_FAIL conversation FK confdeltype=%', del; end if;
  if val is not true then raise exception 'PHASE3_FAIL conversation FK not validated'; end if;
  if tgt <> 'public.chat_conversations'::regclass then raise exception 'PHASE3_FAIL conversation FK target=%', tgt; end if;
end $$;

-- 3.4 Trigger tgtype = 23 exact + tgfoid binding (P1-02)
do $$
declare t int; f oid; expected_fn oid;
begin
  select tgtype, tgfoid into t, f
    from pg_trigger
   where tgrelid = 'public.ai_memories'::regclass
     and tgname = 'ai_memories_defaults' and not tgisinternal;
  if t is null then raise exception 'PHASE3_FAIL trigger ai_memories_defaults missing'; end if;
  if t <> 23 then raise exception 'PHASE3_FAIL tgtype=% (expected 23)', t; end if;
  select oid into expected_fn from pg_proc
   where proname='ai_memories_defaults' and pronamespace='public'::regnamespace;
  if f is distinct from expected_fn then
    raise exception 'PHASE3_FAIL tgfoid=% does not bind to ai_memories_defaults (%)', f, expected_fn;
  end if;
end $$;

-- 3.5 RLS: 4 policies individually (P1-04) / RLS: 4 سياسات بشكل فردي
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname='public' and tablename='ai_memories';
  if n <> 4 then raise exception 'PHASE3_FAIL rls policy count=% (expected 4)', n; end if;
end $$;

-- SELECT policy
do $$
declare cmd text; q text;
begin
  select cmd, qual into cmd, q from pg_policies
   where schemaname='public' and tablename='ai_memories' and policyname='ai memories: owner reads';
  if cmd <> 'SELECT' then raise exception 'PHASE3_FAIL select policy cmd=%', cmd; end if;
  if q <> '(auth.uid() = user_id)' then raise exception 'PHASE3_FAIL select qual=%', q; end if;
end $$;
-- INSERT policy
do $$
declare cmd text; wc text;
begin
  select cmd, with_check into cmd, wc from pg_policies
   where schemaname='public' and tablename='ai_memories' and policyname='ai memories: owner writes';
  if cmd <> 'INSERT' then raise exception 'PHASE3_FAIL insert policy cmd=%', cmd; end if;
  if wc <> '(auth.uid() = user_id)' then raise exception 'PHASE3_FAIL insert with_check=%', wc; end if;
end $$;
-- UPDATE policy
do $$
declare cmd text; q text; wc text;
begin
  select cmd, qual, with_check into cmd, q, wc from pg_policies
   where schemaname='public' and tablename='ai_memories' and policyname='ai memories: owner updates';
  if cmd <> 'UPDATE' then raise exception 'PHASE3_FAIL update policy cmd=%', cmd; end if;
  if q <> '(auth.uid() = user_id)' then raise exception 'PHASE3_FAIL update qual=%', q; end if;
  if wc <> '(auth.uid() = user_id)' then raise exception 'PHASE3_FAIL update with_check=%', wc; end if;
end $$;
-- DELETE policy
do $$
declare cmd text; q text;
begin
  select cmd, qual into cmd, q from pg_policies
   where schemaname='public' and tablename='ai_memories' and policyname='ai memories: owner deletes';
  if cmd <> 'DELETE' then raise exception 'PHASE3_FAIL delete policy cmd=%', cmd; end if;
  if q <> '(auth.uid() = user_id)' then raise exception 'PHASE3_FAIL delete qual=%', q; end if;
end $$;

-- 3.6 Function ACL exact set (P1-03) using 0::oid for PUBLIC
do $$
declare roles text[];
begin
  select array_agg(grantee order by grantee) into roles
  from (
    select case grantee when 'PUBLIC' then 'public' else grantee end as grantee
    from aclexplode(
      (select proacl from pg_proc where proname='replace_session_memories' and pronamespace='public'::regnamespace)
    )
    where privilege_type='EXECUTE'
  ) t;
  -- exclude owner postgres
  select array_agg(g order by g) into roles from unnest(coalesce(roles,array[]::text[])) g where g <> 'postgres';
  if roles is distinct from array['authenticated'] then
    raise exception 'PHASE3_FAIL replace_session_memories ACL=% (expected {authenticated})', roles;
  end if;
end $$;

do $$
declare roles text[];
begin
  select array_agg(grantee order by grantee) into roles
  from (
    select case grantee when 'PUBLIC' then 'public' else grantee end as grantee
    from aclexplode(
      (select proacl from pg_proc where proname='expire_stale_memories' and pronamespace='public'::regnamespace)
    )
    where privilege_type='EXECUTE'
  ) t;
  select array_agg(g order by g) into roles from unnest(coalesce(roles,array[]::text[])) g where g <> 'postgres';
  if roles is distinct from array['service_role'] then
    raise exception 'PHASE3_FAIL expire_stale_memories ACL=% (expected {service_role})', roles;
  end if;
end $$;

-- 3.7 Indexes present
select indexname from pg_indexes
 where schemaname='public' and tablename='ai_memories'
 order by indexname;
```

### Phase 4A — Full rollback (separate) / تراجع كامل (منفصل)

```sql
-- Phase 4A: FULL ROLLBACK — execute only if P2 explicitly approves reverting.
-- Phase 4A: تراجع كامل — نفّذ فقط إذا وافقت P2 صراحة.
begin;
drop trigger if exists ai_memories_protect_source on public.ai_memories;
drop trigger if exists ai_memories_defaults on public.ai_memories;
drop function if exists public.ai_memories_protect_source();
drop function if exists public.ai_memories_defaults();
drop function if exists public.expire_stale_memories();
drop function if exists public.replace_session_memories(uuid, text, text);
drop index if exists public.ai_memories_user_subject_topic_idx;
drop index if exists public.ai_memories_user_expires_idx;
drop index if exists public.ai_memories_user_layer_updated_idx;
-- restore 6-kind CHECK (only if no new-kind rows)
-- alter table ... drop/add constraint ...
alter table public.ai_memories
  drop column if exists status,
  drop column if exists expires_at,
  drop column if exists last_used_at,
  drop column if exists created_at,
  drop column if exists evidence_ref,
  drop column if exists conversation_id,
  drop column if exists topic_key,
  drop column if exists subject_id,
  drop column if exists language,
  drop column if exists confidence,
  drop column if exists source,
  drop column if exists layer;
commit;
```

### Phase 4B — Partial rollback (separate) / تراجع جزئي (منفصل)

```sql
-- Phase 4B: PARTIAL ROLLBACK — remove only new triggers/RPCs, keep columns.
begin;
drop trigger if exists ai_memories_protect_source on public.ai_memories;
drop function if exists public.ai_memories_protect_source();
drop function if exists public.expire_stale_memories();
-- keep columns, kind CHECK, indexes, defaults trigger
commit;
```

### Phase 4C — Data loss warning (comment only) / تحذير فقدان بيانات (تعليق فقط)

```sql
-- Phase 4C: WARNING — dropping columns in 4A destroys backfilled provenance.
-- Phase 4C: تحذير — إسقاط الأعمدة في 4A يدمّر الأصول (provenance) المعبأة.
-- Before any rollback, export: select * from public.ai_memories; and verify row counts.
-- قبل أي تراجع، صدّر: select * from public.ai_memories; وتحقق من counts.
```

---

## 4. Risk Register (Honest) / سجل المخاطر (بصدق)

| Severity | Risk (المخاطر) | Reason (السبب) | Mitigation (التخفيف) | When to fix (متى) |
|---|---|---|---|---|
| P0 | FK verification depends on exact constraint names | If DB uses different names, Phase 3 fails | Use name-based lookup; rename handling in clone test | Clone test |
| P0 | CHECK exact-def strings are PG-version dependent | `pg_get_constraintdef` output varies by PG version | RAISE NOTICE logs actual value on staging; adjust expected strings | Staging preflight |
| P0 | Advisory lock uses 32-bit hashtext | Hash collisions possible (only serialize, never wrong data) | Acknowledged; collisions only serialize | Accepted |
| P1 | Backfill COALESCE assumes per-column independence | If a column is partially populated inconsistently, flags may remain | Phase 0 skew/trusted checks; Phase 3 smoke | Clone test |
| P1 | Protect-source trigger allows SECURITY DEFINER owner (postgres) | Could mask forged writes if function compromised | Trigger + ownership checks; service_role gate on expire | Code review |
| P2 | Index state machine is manual | Operator error possible | Document recovery; clone test | Execution PR |
| P2 | No live execution performed | All claims static | Clone tests required before production | Database Preflight |

---

## 5. Clone Test Plan (10+ cases) / خطة اختبارات Clone (10+)

| # | Test (الاختبار) | Setup (الإعداد) | Run (التشغيل) | Expected (المتوقع) | Proves (يثبت) |
|---|---|---|---|---|---|
| T1 | P0-01 drift detection | Create constraint `ai_memories_layer_check` with wrong def | Run Phase 1 drop guard | STOP (RAISE) | Drift guard works |
| T2 | P1-05 preflight catches confidence>0.5 | Insert legacy row confidence=0.7, source=NULL | Run Phase 0 | STOP before INSERT | Data checks pre-commit |
| T3 | P1-01 scenario 1 | User with no rows | replace_session_memories(u,'Networks','OSI') | 1 subject + 1 lesson | Basic replace |
| T4 | P1-01 scenario 2 | After T3 | replace(u,'Database','OSI') | 1 subject (Database only), 1 lesson | Subject replaced |
| T5 | P1-01 scenario 3 | After T4 | replace(u,'Database','Indexes') | 1 subject (Database), 1 lesson (Indexes only) | Lesson replaced |
| T6 | P1-01 scenario 4 | After T5 | replace(u,'','OSI') | subject unchanged, lesson updated | Empty subject preserves |
| T7 | P1-01 scenario 5 | After T6 | replace(u,'المادة الحالية','OSI') | subject unchanged, lesson updated | Placeholder subject preserves |
| T8 | P1-01 scenario 6 | Any state | replace(u,'','') | no-op, counts unchanged | Both empty no-op |
| T9 | P1-01 scenario 7 | After creating subject row | replace(u,'Networks',...) twice | 1 subject row (idempotent) | Idempotency |
| T10 | P1-02 trigger tgtype | Inspect pg_trigger | Query tgtype & tgfoid | tgtype=23, tgfoid binds | Trigger binding |
| T11 | P0-02 ACL no 'public'::regrole | Run ACL check query | Execute | No "role public does not exist" | Valid role cast |
| T12 | NEW P0 forgery rejection (authenticated) | As authenticated user | INSERT source='diagnostic_evidence' | EXCEPTION 42501 | Forgery blocked |
| T13 | NEW P0 explicit_student allowed | As authenticated user | INSERT source='explicit_student', confidence=0.9 | SUCCESS | Legitimate write allowed |
| T14 | NEW P0 service_role allowed | As service_role | INSERT source='diagnostic_evidence' | SUCCESS | Backend trusted |
| T15 | P0-04 FK verification | Inspect pg_constraint | Run Phase 3 FK block | Both FKs pass target/col/del/validated | FK fully verified |

---

## 6. Verdict / الحكم

**READY FOR STATIC REVIEW** (جاهز للمراجعة الساكنة)

- All 10 defects + NEW P0 have code fixes and verification entries in this report.
- No claim of execution, clone test, or database preflight is made.
- Not "READY FOR EXECUTION" and not "READY FOR DATABASE PREFLIGHT" — those are separate gates requiring actual clone runs.
- If any fix is found unproven during review, status becomes NOT READY.

---

*End of Revision 9 report. STOP — no execution performed. / نهاية تقرير المراجعة 9. توقف — لم تُنفَّذ أي عملية.*
