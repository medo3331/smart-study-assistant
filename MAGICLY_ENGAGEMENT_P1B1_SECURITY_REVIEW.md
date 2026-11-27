# MAGICICLY ENGAGEMENT — P1-B1.1 SQL Security Review

**Mode:** STRICT READ-ONLY SECURITY & DESIGN REVIEW  
**Branch (as reviewed):** `feat/engagement-p1b1-schema`  
**Reviewed artifact:** `db/58-engagement-events.sql` (committed locally on that branch per instructions)  
**Date:** 2026-11-20 (review time)  
**Scope:** Security, integrity, and architectural review of the P1-B1 schema-only migration only. No changes made.

---

## 1) Executive verdict

**Verdict: PASS WITH CONDITIONS**

The migration is a reasonable **additive, schema-only** foundation for an append-only engagement event ledger: RLS is enabled with no client policies, table privileges are revoked from `anon`/`authenticated`, `verified_by`/shape checks are present, and BEFORE UPDATE/DELETE row triggers raise to block normal mutation paths. However, there are **important gaps** that must be addressed before treating this as a strong trust boundary for P1-B2 ingestion: (a) **TRUNCATE is not prevented** and no explicit privilege lockdown is shown beyond table REVOKEs, (b) **`verified_by` is client-influenceable unless writes are restricted to trusted execution paths** (the column is a plain `text NOT NULL` with CHECK; nothing in this SQL forces server-only assignment), (c) **`source_id` is NOT NULL + UNIQUE makes idempotency brittle for sources without stable UUIDs** and can block legitimate distinct events if misused, (d) **metadata is only constrained to be a JSON object with no size/sensitivity controls**, and (e) **append-only is “best effort” against non-owner roles via triggers** but **not absolute against table owners/superusers/privilege misuse** (and trigger/function ownership model is not specified in-file). These are design/operational conditions, not proof that the file was applied or that production was touched (it was not, per instructions).

---

## 2) Findings (by severity)

### P0

- **P0-1 — `verified_by` is not enforceable as a trust guarantee by the schema alone (caller-influence risk if any insert path allows client-supplied rows).**  
  `verified_by text NOT NULL` with CHECK `IN ('service_role','definer','trigger')` (`db/58-engagement-events.sql`, lines ~41–55, ~61) validates values but does **not** prevent an actor who can `INSERT` into `engagement_events` from choosing any allowed literal (including `'definer'` or `'trigger'`) unless insertion is restricted to trusted code that sets it. The comment states intent (“How the event was recorded…”), but there is no DEFAULT tied to a server context, no trigger forcing it, and no policy/privilege model shown that guarantees only trusted paths insert.  
  **Risk:** unverified or incorrectly attributed events could be stored and later treated as verified.

- **P0-2 — Append-only is incomplete: `TRUNCATE` is not prevented and no explicit protection is defined in this migration.**  
  Triggers are `BEFORE UPDATE`/`BEFORE DELETE` row triggers only (`db/58-engagement-events.sql`, ~104–118). `TRUNCATE` does **not** fire row-level DELETE triggers in normal PostgreSQL behavior; it requires different handling (`TRUNCATE` trigger) if used. This migration adds none. Also there is no `REVOKE TRUNCATE` / privilege tightening shown beyond `REVOKE ALL ON TABLE ... FROM anon, authenticated` (~83–90). A role that retains `TRUNCATE` (or table owner/superuser) could remove all rows.  
  **Risk:** bypass of “append-only ledger” semantics and potential audit trail destruction.

### P1

- **P1-1 — `source_id uuid NOT NULL` + UNIQUE `(user_id,event_type,source_table,source_id)` creates idempotency and modeling risks for non-UUID sources.**  
  Columns/constraints: `source_id uuid NOT NULL` and UNIQUE including it (`~39–40, ~53–55, ~61`). Many real sources may have string IDs, composite keys, or events not tied to a single row UUID. Forcing UUID can lead to (a) fabricated sentinel UUIDs that collapse distinct events, or (b) inability to represent legitimate events, or (c) hacks that harm idempotency.  
  **Risk:** duplicate suppression broken or schema misused; unclear event identity.

- **P1-2 — No control over metadata size or sensitive content (PII/secrets/large payloads).**  
  `metadata jsonb NOT NULL DEFAULT '{}'::jsonb` with only `jsonb_typeof(metadata)='object'` (`~47–52, ~56–57`). No `jsonb_column_size`/length cap, no application contract enforced in DB, no guidance enforced beyond comments.  
  **Risk:** accidental storage of lecture text, AI outputs, tokens, emails, phone numbers, or unbounded payloads impacting cost/perf and compliance.

- **P1-3 — Trigger/function ownership and bypass posture not specified in-file (table owner/superuser and `ALTER TABLE ... DISABLE TRIGGER` paths).**  
  Function `public._engagement_events_no_mutate()` is `SECURITY DEFINER` with `SET search_path = pg_catalog` and revokes from PUBLIC/anon/authenticated (`~93–103`). The migration does **not** state `OWNER TO ...`, so ownership is the role executing the migration (UNVERIFIED in repo context). A **table owner** can typically disable triggers or drop them unless restricted by policy outside this file; **superusers** are generally not subject to RLS and have broad power. This is normal Postgres reality but must be acknowledged as a limitation of “append-only” enforcement.  
  **Risk:** mutating/deleting rows if privileges/ownership are misconfigured or by privileged operators.

- **P1-4 — No `REVOKE`/grants shown for sequences (minimal relevance) and no explicit statement about future insert mechanisms grants.**  
  PK uses `gen_random_uuid()` (no sequence). No `CREATE SEQUENCE` shown. Still, the migration does not address sequence privileges generally; more importantly it does **not** create or restrict any `INSERT`-capable function/role path—future trusted ingestion must be designed carefully (noted in comments but not enforced). UNVERIFIED whether any default grants exist beyond table-level REVOKEs in this migration’s effect in the target environment.

### P2

- **P2-1 — `occurred_at` defaults to `now()` (server clock) with no CHECK on range/future skew policy.**  
  `occurred_at timestamptz NOT NULL DEFAULT now()` (`~43–45`). Allows clients/services to omit it (gets now) or to set arbitrary past/future timestamps if they have INSERT rights later—no constraint like `occurred_at <= now() + interval ...` or lower bound.  
  **Risk:** timeline pollution, hard-to-audit ordering if callers control timestamps.

- **P2-2 — `created_at` defaults to `now()` but is independent of `occurred_at`; no `created_at >= occurred_at`-style guidance enforced.**  
  Both defaultable/settable in principle by an inserter with write access later; no constraint linking them (`~45, ~57`).  
  **Risk:** confusing provenance (ingestion time vs event time) if misused.

- **P2-3 — `event_type`/`source_table` allowlists are length+trim-only, not semantic allowlists.**  
  CHECKs enforce non-empty after trim and `<= 120` chars (`~46–52`). No enumeration of approved event types/sources in DB.  
  **Risk:** typo/abuse/sprawl until a trusted ingestion layer enforces a strict allowlist (must be outside this SQL).

- **P2-4 — `source_table text` is free-form; no FK or validation to known tables.**  
  Can store arbitrary identifiers; combined with `source_id uuid`, weak referential integrity.  
  **Risk:** orphaned/meaningless provenance; harder forensic analysis.

- **P2-5 — `ON DELETE CASCADE` from `auth.users(id)` will hard-delete engagement events when a user is deleted.**  
  `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` (`~38`). This may be undesirable for compliance/audit/analytics retention depending on product policy.  
  **Risk:** loss of engagement history on account deletion unless intentional and documented.

- **P2-6 — Comment mentions “service_role retains privileges by default in Supabase” but migration does not codify role strategy.**  
  Comment only (`~89–90`). Environment-specific; not enforced in SQL.  
  **Risk:** operational surprise if project settings differ (UNVERIFIED per environment).

### P3

- **P3-1 — `IF NOT EXISTS` / defensive drops make re-runs idempotent but can hide drift in long-lived environments.**  
  `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS ... CREATE TRIGGER ...` (`~37, ~93, ~105–118`).  
  **Risk:** partial/manual changes may persist unnoticed; less of a security issue than an ops concern.

- **P3-2 — No index on `(user_id, event_type, occurred_at DESC)` if common queries filter by type; only two indexes defined.**  
  Current indexes: user+occurred, event_type+occurred (`~67–80`). May be sufficient now but could tempt future workarounds; not a security flaw.

---

## 3) SQL-specific evidence (file paths + line numbers)

- File: `db/58-engagement-events.sql`
- Header / intent (schema-only, no rewards/Xp wiring): lines 1–35.
- Table + columns + defaults: lines 37–57 (`CREATE TABLE IF NOT EXISTS public.engagement_events ...`).
- Constraints:
  - `verified_by` CHECK allowlist: 41–45.
  - `event_type` non-empty + length <=120: 46–49.
  - `source_table` non-empty + length <=120: 50–53.
  - `metadata` object-only: 54–57.
  - UNIQUE `(user_id,event_type,source_table,source_id)`: 58–61.
- Comments: 63–71.
- Indexes: 74–80 (`idx_engagement_events_user_occurred`, `idx_engagement_events_event_type_occurred`).
- RLS enable + no policies: 83–84.
- Privilege revokes (table): 86–90 (`REVOKE ALL ON TABLE ... FROM anon, authenticated`).
- Mutate-block function (SECURITY DEFINER, `search_path = pg_catalog`, revokes): 93–103.
- Triggers (BEFORE UPDATE/DELETE only): 105–118.
- Transaction wrapper: `BEGIN;` line 35, `COMMIT;` line 120.

**Not present in this file (evidence of absence):** any `TRUNCATE` trigger, any `REVOKE TRUNCATE`, any `REVOKE INSERT/UPDATE/DELETE` statements shown beyond table REVOKEs to anon/authenticated (and no explicit grants), any `ALTER TABLE ... DISABLE TRIGGER` guards, any policy objects, any function to insert events, any check on `occurred_at`/`created_at` skew, any size limit on `metadata`, any enumeration table/check for `event_type` beyond format, any handling of `source_id` nullability alternatives.

---

## 4) Security threat model (for this artifact)

**Assets:** integrity and auditability of engagement event history; prevention of forged “verified” events influencing future missions/rewards/discovery; confidentiality of any sensitive data mistakenly placed in `metadata`.

**In-scope actors (from this SQL):**
- **`anon` / `authenticated` (Supabase client roles):** intended to have **no direct table privileges** (revoked). No RLS policies exist, so even if privileges were granted later incorrectly, there is no permissive policy—but current file revokes table privileges (defense in depth is partial).
- **`service_role` (Supabase):** retains table privileges by default per comment (environment-dependent). Can perform DML unless further restricted outside this file. Triggers defined as row BEFORE triggers in PL/pgSQL will still fire in normal operation (role does not bypass triggers); however, **privileged operations** and **ownership** matter (see below).
- **Database/table owner or superuser:** can disable/drop triggers, modify table, run `TRUNCATE`, or bypass RLS depending on role—**outside the guarantees of this migration**.
- **Future trusted ingestion code (SECURITY DEFINER / server functions):** not present; threat is misdesign (over-broad `search_path`, caller-controlled `verified_by`, missing allowlists) leading to forged or malformed events.

**Out of scope:** application bugs, network/authn at API layer, Supabase project-level role configuration not expressed here, operational key handling.

**Key threats this migration attempts to address:** accidental client writes via PostgREST/RLS gaps (mitigated by RLS on + no policies + revokes), casual `UPDATE`/`DELETE` by roles that still have some path? (mitigated only if they lack privileges; triggers add another layer but are not privilege enforcement), duplicate event rows for the same identity tuple (partially mitigated by UNIQUE).

**Key threats not addressed:** `TRUNCATE`, privileged mutation, forged `verified_by` by any inserter allowed later, oversized/sensitive `metadata`, weak event identity when `source_id` must be UUID, timestamp manipulation by inserters, cascade deletion of history on user deletion policy.

---

## 5) Idempotency analysis

- **Database-level dedupe:** `UNIQUE (user_id, event_type, source_table, source_id)` (`db/58-engagement-events.sql` ~58–61) provides a natural idempotency key **iff** callers consistently supply the same `(user_id,event_type,source_table,source_id)`. This is appropriate for “one event per source row/id per type per user” patterns.
- **Nullable values:** all four columns in that UNIQUE are `NOT NULL` here, so PostgreSQL treats them as participating in uniqueness normally (no multi-NULL bypass issues from NULLs in this design). **No NULL-related bypass** is present by schema—but the design forces non-null semantics.
- **`source_id` must be UUID:** if upstream sources use non-UUID IDs, teams may hash or fabricate UUIDs; collisions or instability would break idempotency. Alternatively they might reuse a wrong UUID—also bad. This is a **design risk** (P1-1).
- **Replay behavior:** re-inserting the same tuple will violate UNIQUE (error) unless handled with `ON CONFLICT DO NOTHING` in trusted code. The migration does not implement ingestion logic; idempotency enforcement should be **both**: (a) DB UNIQUE as the backstop, and (b) **trusted ingestion function** that catches/conflicts intentionally and logs/metrics appropriately. Relying on ad hoc client inserts is unsafe.
- **Event identity gaps:** events not tied to a durable `source_table`/`source_id` UUID cannot be represented cleanly here without violating intent. Consider a separate pattern (e.g. a dedicated source id namespace) only via a reviewed design—not implemented here.
- **Conclusion:** DB provides a useful uniqueness backstop for the chosen model, but idempotency is **incomplete** without strict ingestion rules and may be **misapplied** because of UUID+NOT NULL constraints.

---

## 6) Append-only limitations

**What the migration does:**
- `ENABLE ROW LEVEL SECURITY` with **no policies** (~83–84): denies access to roles subject to RLS when no policy allows (combined with revokes, reduces attack surface).
- `REVOKE ALL ON TABLE public.engagement_events FROM anon, authenticated` (~86–90): prevents those roles from table DML/SELECT via grants (assuming no other grants granted elsewhere—UNVERIFIED outside this file).
- `BEFORE UPDATE OR DELETE FOR EACH ROW` triggers call `public._engagement_events_no_mutate()` which `RAISE EXCEPTION` (`~93–118`). Function is `SECURITY DEFINER`, `SET search_path = pg_catalog`, revokes from PUBLIC/anon/authenticated (`~98–103`).

**What it does NOT do / limitations:**
- **No `TRUNCATE` prevention:** `TRUNCATE` does not fire these row triggers. Any role with `TRUNCATE` privilege (or ownership/superuser) can truncate the table. **Not prevented.**
- **Role bypass of triggers:** PostgreSQL row triggers fire for normal DML by roles that have privileges; they are **not** bypassed because the role is `service_role` in the application sense except through privilege/operation type differences—row triggers still execute. True bypass is typically via `ALTER TABLE ... DISABLE TRIGGER` (requires ownership/appropriate privileges) or superuser actions in some admin contexts. The migration does not restrict disabling triggers.
- **Table owner / superuser:** can alter table, drop triggers, truncate, disable RLS in some cases? No—RLS enable is set; owners have special powers in practice depending on setup, but generally **owners can bypass RLS** in PostgreSQL unless forced in certain configurations? Standard behavior: table owner bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set. This migration does **not** set `FORCE ROW LEVEL SECURITY`. **UNVERIFIED** in-effect guarantee against owner bypass for SELECT/other operations, but the main mutation block shown is triggers + revokes. Still, owner can often circumvent application-layer protections.
- **`SECURITY DEFINER` function owner:** if the function is owned by a highly privileged role, that is separate from table owner; the trigger uses this function. The migration does not set `OWNER TO`, so owner is the executing role at migration time (UNVERIFIED). Misownership could be risky, but revokes limit who can call the function directly.
- **No protection against direct file/system access or DBA actions:** out of scope but real.

**Summary:** “Append-only” is enforced for **ordinary DML by roles lacking dangerous privileges** via triggers plus revokes, but it is **not absolute**. Treat as **application/operational guardrail**, not a cryptographic or DBA-proof guarantee.

---

## 7) Permissions / RLS assessment

**RLS:**
- `ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;` (`~84`). No `FORCE ROW LEVEL SECURITY` set. No policies created. Result: for roles subject to RLS with no policies, typical behavior is **deny all** for SELECT/INSERT/UPDATE/DELETE via policies—combined with no INSERT/UPDATE/DELETE policies this is restrictive. However, **table owners bypass RLS** by default in PostgreSQL unless forced; this migration does not force. **UNVERIFIED** whether the intended operational owner is the table owner in Supabase’s model.

**Table grants (from this file):**
- `REVOKE ALL ON TABLE public.engagement_events FROM anon;`
- `REVOKE ALL ON TABLE public.engagement_events FROM authenticated;` (`~86–90`). No `GRANT` statements shown. No explicit `REVOKE ALL FROM public` shown (only function revokes mention PUBLIC). Table privileges for other roles (including `service_role`, table owner) are **not modified** here except implicitly in effect? **UNVERIFIED** full grant state without querying the DB; the comment claims “service_role retains privileges by default in Supabase”.

**Function privileges:**
- `REVOKE ALL ON FUNCTION public._engagement_events_no_mutate() FROM PUBLIC, anon, authenticated;` (`~101–103`). Appropriate so clients cannot call the guard directly in a useful way.

**Sequences:** None created; `gen_random_uuid()` used. No sequence grants addressed. **UNVERIFIED** if any legacy sequence grants matter (none apparent).

**Future insertion paths (must be explicitly reviewed):**
- Preferred: a **SECURITY DEFINER** function owned by a minimally privileged role (or carefully chosen owner), with `SET search_path = pg_catalog, public` only as needed and **fixed**, that validates `user_id` (from `auth.uid()` or derived server-side context, never blindly trusted from arbitrary caller input without proof), enforces a **strict event_type allowlist**, validates `source_table`/`source_id` semantics, sets `verified_by` to a server-controlled value (e.g. `'definer'`), caps/validates `metadata`, and performs idempotent insert (`ON CONFLICT DO NOTHING`) returning a result. Direct inserts by `service_role` from application code are operationally easier but shift trust to app code and key management; if used, document and restrict key usage.
- **Do not** grant INSERT to `anon`/`authenticated`. Do not allow clients to set `verified_by`.
- Consider `REVOKE TRUNCATE`/tighten privileges on the table for roles that should never truncate (policy/ops decision outside this SQL).

**Implicit privilege assumptions to avoid:** assuming `service_role` absence of RLS bypass issues in all contexts (it bypasses RLS), assuming triggers are tamper-proof, assuming Supabase default grants remain unchanged.

---

## 8) Metadata safety recommendations (minimal metadata contract)

**Current state:** `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`, CHECK `jsonb_typeof(metadata)='object'` only. No size limit, no key allowlist, no redaction guidance enforced.

**Recommended minimal contract (enforce in trusted ingestion layer; optionally mirror in DB later):**
- **Type/shape:** JSON object only (already enforced). Disallow arrays/scalars at root.
- **Size limit:** cap serialized size (e.g. **<= 4 KB** or **<= 8 KB**) before insert; reject or truncate with audit. Postgres TOAST handles large JSONB but cost and leakage risks remain.
- **Key policy:** allowlist top-level keys per `event_type` (or a small global allowlist) to prevent arbitrary dumping. Example global forbidden keys: anything resembling tokens/secrets (`token`, `password`, `secret`, `authorization`, `cookie`), and raw content fields unless explicitly required.
- **Prohibited content (must not be stored):** raw lecture bodies/transcripts beyond non-sensitive derived IDs, full AI chat content unless a separate audited store is designed, access/refresh tokens, passwords, full payment details, government IDs, or other high-sensitivity PII unless there is a legal/compliance basis and encryption strategy. Prefer storing **references** (`source_id`, counts, booleans, enum codes) over free text.
- **PII minimization:** if user-generated text is unavoidable, document retention, access, and consider hashing/redaction; prefer IDs and coarse categories.
- **Validation:** reject unknown keys for known event types; validate value types (string/number/bool/null/object/array) per key with tight bounds (e.g. string max length 256).
- **Observability:** log validation failures (without logging the payload) in the ingestion path.

**DB-level ideas (optional future, not in this migration):** a CHECK using `octet_length(metadata::text)` as an upper bound, or a trigger validating key sets—only if performance and flexibility are acceptable. Do **not** rely on DB alone for semantic safety.

---

## 9) Required corrections before P1-B2

1. **Decide and enforce `verified_by` authority (P0-1):** remove any path that lets untrusted callers set `verified_by`; use a trusted ingestion function that sets it server-side (e.g. always `'definer'` for that function) and consider whether to drop direct insert ability entirely. Do **not** accept `verified_by` from clients.
2. **Address append-only gaps (P0-2, P1-3):** add explicit protection strategy: at minimum document that `TRUNCATE` is forbidden operationally and add `REVOKE TRUNCATE` on `engagement_events` from roles that should not truncate (where applicable). Consider a `BEFORE TRUNCATE` trigger in PostgreSQL 11+ behavior? **UNVERIFIED** exact behavior across versions in this repo’s target—research required; if unsupported, rely on privilege revocation + ops controls. Set `FORCE ROW LEVEL SECURITY` if the table owner model requires it and is compatible with operations. Document and enforce function/table ownership (set `OWNER TO` to a dedicated low-privilege role owned/manged carefully).
3. **Fix event identity model (P1-1):** either (a) change `source_id` to `text` (or `uuid` nullable with a separate non-null `source_key text`) plus a well-defined uniqueness rule, or (b) formally require UUID sources and document the contract. Current UNIQUE with `source_id uuid NOT NULL` is fragile for real-world IDs.
4. **Add metadata guardrails in ingestion (P1-2):** implement size caps and key/type allowlists in the trusted insert function before this table is written in production paths.
5. **Constrain timestamps (P2-1/P2-2):** consider CHECKs such as `occurred_at <= now() + interval '5 minutes'` (tunable) and/or `created_at >= occurred_at - interval '1 day'` only if semantics allow—design carefully to avoid rejecting clock skew; at minimum document expectations.
6. **Define `event_type` / `source_table` allowlists in trusted code (P2-3/P2-4):** do not rely on free text long-term; add a server-side enum/allowlist registry.
7. **Clarify retention vs `ON DELETE CASCADE` (P2-5):** confirm product/legal requirement; if events must be retained after user deletion, change FK behavior (e.g. `ON DELETE SET NULL` with a separate anonymization strategy) — **requires explicit design approval**.
8. **Migration hygiene (P3-1):** for production-grade migrations consider being explicit rather than overusing `IF NOT EXISTS` in ways that mask drift, but this is secondary to security.

---

## 10) Optional future improvements

- Add a `BEFORE TRUNCATE` trigger (if targeting PG versions that support it usefully) or enforce via permissions and monitoring.
- Add partial indexes for hot query patterns once access patterns are known (e.g. by `event_type` + time windows).
- Introduce a companion table for `event_type` catalog with descriptions/versions if governance is needed.
- Consider row-level immutability proofs via audit log table (separate) if higher assurance is required.
- Add automated tests (migration + policy/privilege smoke tests) in CI using a disposable DB.

---

## 11) Clear checklist for approving P1-B1

Approve **P1-B1 (`db/58-engagement-events.sql`) as schema-only foundation** only if **all** are true:

- [ ] **Scope unchanged:** no rewards/XP/missions/notifications/ads/application behavior added; migration remains additive.
- [ ] **Reviewed SQL matches intent:** RLS enabled, no policies, `REVOKE ALL` on table from `anon`/`authenticated` present as written.
- [ ] **Append-only acknowledged as partial:** team accepts limits (TRUNCATE, owner/superuser, trigger disable) and has an ops/privilege plan.
- [ ] **`verified_by` plan documented:** before any insert path exists, design guarantees server-only assignment (no client control).
- [ ] **Idempotency model accepted:** UNIQUE key semantics and `source_id` UUID requirement are accepted **or** a follow-up migration is planned to fix identity (P1-1) before broad use.
- [ ] **Metadata contract defined:** minimal allowlist/size/sensitivity rules exist for ingestion (even if not enforced in DB yet) before storing real events.
- [ ] **No production apply:** confirmation that this migration was **not** applied to production and will not be without separate approval.
- [ ] **Ownership/privilege plan (UNVERIFIED until set):** function/table owners and role grants documented for the target environment (Supabase/project) before P1-B2.

If any of the above are false, mark P1-B1 as **not approved** for progression beyond documentation/review until conditions are met.

---

## Appendix: Notes on “cannot verify from SQL/repo evidence”

The following could **not** be fully verified from `db/58-engagement-events.sql` alone and require environment inspection (read-only) if/when needed: actual database role grants in the deployed DB, whether `service_role` behavior matches comments in that project, table/function ownership after migration execution, presence of other policies/grants added elsewhere, PostgreSQL version-specific behavior of `BEFORE TRUNCATE` support, and whether `FORCE ROW LEVEL SECURITY` is enabled in practice. These are marked **UNVERIFIED** in context above where relevant.
