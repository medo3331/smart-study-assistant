/* ============================================================================
   Phase 2 — API Security & Contract Tests
   ---------------------------------------------------------------------------
   These are STATIC tests: they assert on the route sources and on the SQL
   migration, because the guarantees that matter here ("the answer key never
   reaches the client", "is_correct is not client-writable") are structural,
   not behavioural. A behavioural test would need a live Supabase; a
   structural one catches the regression at commit time.

   Every test names the specific hole it closes.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreDiagnosticSession, normaliseTopicName, UNTAGGED_TOPIC } from "@/lib/diagnostic-mastery";

const root = join(__dirname, "..");

/** Strips comments so prose about a pattern cannot satisfy or break a match. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const masteryCode = codeOnly(readFileSync(join(root, "lib", "diagnostic-mastery.ts"), "utf8"));
const startSrc = readFileSync(
  join(root, "app", "api", "diagnostic", "start", "route.ts"),
  "utf8"
);
const submitSrc = readFileSync(
  join(root, "app", "api", "diagnostic", "submit", "route.ts"),
  "utf8"
);
const migrationSql = readFileSync(
  join(root, "db", "phase2-diagnostic-security.sql"),
  "utf8"
);
// The recommendations follow-up was split into its own file because the
// main migration had already been applied to production when the live smoke
// test found the problem. Testing the right file matters: asserting against a
// combined string would pass even if the split file were never written.
const recsSql = readFileSync(
  join(root, "db", "phase2-diagnostic-recommendations-rls.sql"),
  "utf8"
);

const startCode = codeOnly(startSrc);
const replannerCode = codeOnly(readFileSync(join(root, "lib", "exam-plan-replanner.ts"), "utf8"));
const submitCode = codeOnly(submitSrc);

/** Returns the source between two markers, or "" when either is missing. */
function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) return "";
  return src.slice(a, b);
}

describe("SECURITY: the answer key never leaves the server", () => {
  it("the start route never puts correct_option_index in its success payload", () => {
    // The SELECT may read it (the scorer needs it); the RETURN must not.
    expect(startSrc).toContain("correct_option_index");

    // The success payload is the LAST return in the file.
    const lastReturn = startCode.lastIndexOf("return NextResponse.json");
    expect(lastReturn).toBeGreaterThan(-1);

    const payload = startCode.slice(lastReturn);
    expect(payload).toContain("questions:");
    expect(payload).not.toContain("correct_option_index");
  });

  it("the start route does not use select(*) on the bank", () => {
    // A select("*") would ship the answer key by accident the moment a
    // column is added. The field list must stay explicit.
    expect(startCode).not.toMatch(/select\(\s*"\*"\s*\)/);
    expect(startSrc).toContain(
      '"id, unit_id, topic_id, question_text, question_type, options_json, difficulty, source_reference, correct_option_index"'
    );
  });

  it("the submit response excludes per_question (which carries the key)", () => {
    expect(submitSrc).toContain("per_question");
    const builder = between(
      submitCode,
      "function buildResult",
      "export async function POST"
    );
    expect(builder).not.toBe("");
    expect(builder).not.toContain("per_question");
  });

  it("the submit route filters the client payload down to two fields", () => {
    // parseAnswers must build a NEW object with only the two fields, never
    // spread the client's object through.
    const parser = between(
      submitCode,
      "function parseAnswers",
      "interface AnswerRow"
    );
    expect(parser).not.toBe("");
    expect(parser).toContain("question_id");
    expect(parser).toContain("selected_option_index");
    expect(parser).not.toMatch(/\.\.\.rec\b/);
    expect(parser).not.toContain("is_correct");
  });

  it("the submit route re-derives correctness instead of trusting is_correct", () => {
    // It reads the stored rows but strips is_correct before scoring.
    expect(submitCode).toContain("stored.map((a) => ({");
    expect(submitCode).not.toContain("is_correct: a.is_correct");
  });
});

describe("SECURITY: is_correct is server-only in the database", () => {
  it("revokes direct INSERT on diagnostic_answers from the client role", () => {
    expect(migrationSql).toContain(
      "revoke insert on public.diagnostic_answers from authenticated"
    );
  });

  it("drops the permissive user-insert policy", () => {
    expect(migrationSql).toContain(
      'drop policy if exists "diag_answers: user insert"'
    );
  });

  it("computes is_correct from the bank inside the RPC", () => {
    expect(migrationSql).toContain("q.correct_option_index = v_sel");
  });

  it("the RPC is SECURITY DEFINER with a pinned search_path", () => {
    // Without a pinned search_path a hijacked schema can shadow the tables.
    expect(migrationSql).toContain("security definer");
    expect(migrationSql).toContain("set search_path = public, pg_temp");
  });

  it("the RPC takes ownership from the session row, not from a parameter", () => {
    // user_id / subject_id must come from the DB row so they cannot be spoofed.
    const fn = between(migrationSql, "submit_diagnostic_answers", "refresh_topic_mastery");
    expect(fn).not.toBe("");
    expect(fn).toContain("auth.uid()");
    expect(fn).not.toMatch(/p_user_id|p_subject_id/);
  });

  it("grants execute only to authenticated, not to public", () => {
    expect(migrationSql).toContain(
      "revoke all on function public.submit_diagnostic_answers(uuid, jsonb) from public"
    );
    expect(migrationSql).toContain(
      "grant execute on function public.submit_diagnostic_answers(uuid, jsonb) to authenticated"
    );
  });
});

describe("FAILURE SAFETY: what is atomic and what is retry-safe", () => {
  it("the submit RPC is retry-safe via ON CONFLICT DO NOTHING", () => {
    expect(migrationSql).toContain(
      "on conflict (session_id, question_id) do nothing"
    );
  });

  it("the mastery refresh rebuilds rather than increments", () => {
    // Incrementing would compound on every retry. Rebuilding converges.
    const fn = migrationSql.slice(migrationSql.indexOf("refresh_topic_mastery"));
    expect(fn).toContain("set attempts      = agg.total");
    expect(fn).not.toMatch(/set\s+attempts\s*=\s*u\.attempts\s*\+/);
  });

  it("recommendations are written through the idempotent RPC", () => {
    // Not a PostgREST upsert: that would have required granting
    // authenticated UPDATE on the table. The RPC carries
    // ON CONFLICT (session_id, weak_topic) DO NOTHING instead.
    expect(submitCode).toMatch(/rpc\(\s*"write_diagnostic_recommendations"/);
  });

  it("the planner update reports partial success honestly", () => {
    // A 202 means "the score is safe, something downstream was not".
    expect(submitCode).toContain("plan_updated: false");
    expect(submitCode).toContain("{ status: 202 }");
  });

  it("the session is marked completed only after the answers are stored", () => {
    const order = submitCode.indexOf("submit_diagnostic_answers");
    const complete = submitCode.indexOf('"completed"');
    expect(order).toBeGreaterThan(-1);
    expect(complete).toBeGreaterThan(order);
  });
});

describe("CONTRACT: evidence-weighted persistence", () => {
  it("adds attempts and correct to user_weaknesses", () => {
    expect(migrationSql).toContain("add column if not exists attempts integer");
    expect(migrationSql).toContain("add column if not exists correct  integer");
  });

  it("enforces correct <= attempts at the database level", () => {
    // Not just in the application — a bad write must be impossible.
    expect(migrationSql).toContain("check (correct >= 0 and correct <= attempts)");
  });

  it("keeps mastery_level a real ratio", () => {
    expect(migrationSql).toContain(
      "check (mastery_level >= 0 and mastery_level <= 1)"
    );
  });

  it("gives the cache a unique conflict target before the upsert needs one", () => {
    expect(migrationSql).toContain(
      "create unique index if not exists user_weaknesses_unique_scope"
    );
  });

  it("rebuilds the cache from diagnostic_answers, not from the cache itself", () => {
    // diagnostic_answers is the audit trail; user_weaknesses is derived.
    const fn = migrationSql.slice(migrationSql.indexOf("refresh_topic_mastery"));
    expect(fn).toContain("from public.diagnostic_answers a");
  });

  it("documents a rollback for every step", () => {
    expect(migrationSql).toContain("ROLLBACK");
    expect(migrationSql).toContain(
      "grant insert, update, delete on public.diagnostic_answers to authenticated"
    );
    expect(migrationSql).toContain("drop column if exists attempts");
  });
});

describe("PREVIEW: the destructive step is inspectable first", () => {
  it("the preview block is marked as deleting nothing", () => {
    expect(migrationSql).toContain("STEP 1.5");
    expect(migrationSql).toContain("RUN THIS FIRST. IT DELETES NOTHING");
  });

  it("the preview precedes the DELETE in file order", () => {
    // If the preview ever moves below the delete it stops being a preview.
    const preview = migrationSql.indexOf("STEP 1.5");
    const del = migrationSql.indexOf("delete from public.user_weaknesses");
    expect(preview).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(-1);
    expect(preview).toBeLessThan(del);
  });

  it("the preview reports the group count and the deletion count", () => {
    expect(migrationSql).toContain("duplicate_groups");
    expect(migrationSql).toContain("rows_that_would_be_deleted");
  });

  it("the preview names the user and topic that are duplicated", () => {
    expect(migrationSql).toContain("rows_in_group");
    expect(migrationSql).toContain("survivor_id_to_keep");
  });

  it("the preview shows current AND post-merge values side by side", () => {
    expect(migrationSql).toContain("attempts_now");
    expect(migrationSql).toContain("attempts_after_merge");
    expect(migrationSql).toContain("mastery_after_merge");
  });

  it("only one delete exists in the whole migration", () => {
    const matches = migrationSql.match(/^\s*delete from /gim) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe("PERMISSIONS: the grant split is deliberate", () => {
  it("authenticated loses INSERT on diagnostic_answers", () => {
    expect(migrationSql).toContain(
      "revoke insert on public.diagnostic_answers from authenticated"
    );
  });

  it("service_role keeps INSERT, explicitly and narrowly", () => {
    expect(migrationSql).toContain(
      "grant insert on public.diagnostic_answers to service_role"
    );
  });

  it("authenticated is never re-granted INSERT anywhere", () => {
    // The rollback block is the one place it reappears, and only as
    // documentation of how to UNDO this. It must not be a live statement.
    const rollbackStart = migrationSql.indexOf("-- ROLLBACK");
    const beforeRollback = migrationSql.slice(0, rollbackStart);
    expect(beforeRollback).not.toMatch(
      /^\s*grant insert on public\.diagnostic_answers to authenticated;?$/im
    );
  });

  it("the RPCs are granted to authenticated, not to public", () => {
    expect(migrationSql).toContain("from public;");
    expect(migrationSql).toContain("to authenticated;");
  });

  it("verification can actually prove the grant split", () => {
    expect(migrationSql).toContain("role_table_grants");
    expect(migrationSql).toContain("EXPECTED: service_role only");
    // And the negative control: authenticated must fail.
    expect(migrationSql).toContain("permission denied");
  });
});

describe("CONTRACT: the API never writes answers directly", () => {
  it("no route inserts into diagnostic_answers", () => {
    // The whole security model rests on this: the only path to the table
    // is the RPC. A stray .insert("diagnostic_answers") anywhere in the
    // routes would silently reintroduce the hole the revoke closes.
    expect(submitCode).not.toContain('from("diagnostic_answers")\n    .insert');
    expect(submitCode).not.toMatch(/\.from\(["']diagnostic_answers["']\)[\s\S]{0,80}?\.insert\(/);
    expect(startCode).not.toMatch(/\.from\(["']diagnostic_answers["']\)[\s\S]{0,80}?\.insert\(/);
  });

  it("the API reads diagnostic_answers but never writes it", () => {
    expect(submitCode).toContain("diagnostic_answers");

    // The only writes allowed are into diagnostic_sessions (the aggregate
    // score), diagnostic_recommendations (the audit rows) and
    // exam_plan_days (the plan). None of them is diagnostic_answers.
    for (const table of ["diagnostic_sessions", "exam_plan_days"]) {
      expect(submitCode).toContain(`.from("${table}")`);
    }

    // And there must be at least one write, or this test proves nothing.
    const writes = submitCode.match(/\.(?:insert|upsert|update)\s*\(/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
  });
  it("the API writes the session and the recommendations, and calls both RPCs", () => {
    expect(submitCode).toMatch(/rpc\(\s*"submit_diagnostic_answers"/);
    expect(submitCode).toMatch(/rpc\(\s*"refresh_topic_mastery"/);
  });

  it("no route ships the raw bank rows to the client", () => {
    // Both routes map the bank into an explicit shape instead of spreading
    // the row, so a future column cannot leak by default.
    expect(startCode).not.toMatch(/\.\.\.\s*q\b/);
    expect(startCode).not.toMatch(/questions:\s*bank\b/);
  });
});

describe("SECURITY: the audit trail is read-only for the client", () => {
  // 1.2D shipped four permissive policies. Revoking INSERT alone still left
  // the client able to rewrite a server-computed is_correct, or delete the
  // row outright — which defeats ON CONFLICT DO NOTHING and with it the
  // retry-safety of the whole loop.

  it("authenticated loses INSERT, UPDATE and DELETE on diagnostic_answers", () => {
    expect(migrationSql).toContain(
      "revoke insert on public.diagnostic_answers from authenticated"
    );
    expect(migrationSql).toContain(
      "revoke update, delete on public.diagnostic_answers from authenticated"
    );
  });

  it("all three permissive policies are dropped", () => {
    expect(migrationSql).toContain(
      'drop policy if exists "diag_answers: user insert"'
    );
    expect(migrationSql).toContain(
      'drop policy if exists "diag_answers: user update"'
    );
    expect(migrationSql).toContain(
      'drop policy if exists "diag_answers: user delete"'
    );
  });

  it("service_role keeps UPDATE and DELETE for admin repair only", () => {
    expect(migrationSql).toContain(
      "grant update, delete on public.diagnostic_answers to service_role"
    );
  });

  it("authenticated never regains UPDATE or DELETE before the rollback block", () => {
    // The rollback block documents how to undo this; nothing above it may
    // actually grant it.
    const rollbackStart = migrationSql.indexOf("-- ROLLBACK");
    expect(rollbackStart).toBeGreaterThan(-1);
    const live = migrationSql.slice(0, rollbackStart);
    expect(live).not.toMatch(
      /^\s*grant\s+(update|delete|insert,?\s*update).*to authenticated;?$/im
    );
  });

  it("the read policy is deliberately left in place", () => {
    // The student must still be able to read their own answers.
    expect(migrationSql).toContain("The read policy");
    expect(migrationSql).toContain("diag_answers: user reads");
    expect(migrationSql).not.toContain(
      'drop policy if exists "diag_answers: user reads"'
    );
  });

  it("verification proves the whole split, not just INSERT", () => {
    expect(migrationSql).toContain("role_table_grants");
    expect(migrationSql).toContain("privilege_type = 'INSERT'");
    expect(migrationSql).toContain("EXPECTED: service_role only");
  });

  it("no route mutates diagnostic_answers directly", () => {
    // Belt and braces: even if the grants were reopened by mistake, the API
    // has no code path that writes the table.
    expect(submitCode).not.toMatch(
      /\.from\(["']diagnostic_answers["']\)[\s\S]{0,80}?\.(?:insert|upsert|update|delete)\s*\(/
    );
    expect(startCode).not.toMatch(
      /\.from\(["']diagnostic_answers["']\)[\s\S]{0,80}?\.(?:insert|upsert|update|delete)\s*\(/
    );
  });

  it("the only writer is the SECURITY DEFINER RPC", () => {
    expect(submitCode).toMatch(/rpc\(\s*"submit_diagnostic_answers"/);
    expect(submitCode).not.toMatch(/"diagnostic_answers"\)\s*\.\s*insert/);
  });
});

describe("REGRESSION: weak topics must be names, not UUIDs", () => {
  // Caught by the Phase 2 live smoke test. The scorer was fed topic_id and
  // used it as the topic label, so weak_topics came back as GUIDs and the
  // replan string-matched against them — silently doing nothing.

  it("the submit route joins the topic name explicitly", () => {
    expect(submitCode).toContain("topic_name:diagnostic_topics(name)");
  });

  it("the scorer prefers the name over the id", () => {
    // q.topic_name ?? q.topic_id — the name must come first, or a
    // populated topic_id will always win and we regress to GUIDs.
    expect(masteryCode).toMatch(/normaliseTopicName\(q\.topic_name\)\s*\?\?\s*q\.topic_id\s*\?\?\s*UNTAGGED_TOPIC/);
  });

  it("a populated name beats a populated id", () => {
    const r = scoreDiagnosticSession(
      [{ question_id: "q1", selected_option_index: 1 }],
      [
        {
          id: "q1",
          subject_id: "s",
          unit_id: null,
          topic_id: "29714054-c603-413c-9631-5b3d661b3bd7",
          topic_name: "الهندسة الفراغية",
          question_type: "mcq",
          correct_option_index: 1,
        },
      ]
    );
    expect(r.topic_performance[0].topic).toBe("الهندسة الفراغية");
    expect(r.topic_performance[0].topic).not.toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("a null name falls back to the id, then to UNTAGGED_TOPIC", () => {
    const withId = scoreDiagnosticSession(
      [{ question_id: "q1", selected_option_index: 1 }],
      [
        {
          id: "q1", subject_id: "s", unit_id: null,
          topic_id: "abc-123", topic_name: null,
          question_type: "mcq", correct_option_index: 1,
        },
      ]
    );
    expect(withId.topic_performance[0].topic).toBe("abc-123");

    const untagged = scoreDiagnosticSession(
      [{ question_id: "q1", selected_option_index: 1 }],
      [
        {
          id: "q1", subject_id: "s", unit_id: null,
          topic_id: null, topic_name: null,
          question_type: "mcq", correct_option_index: 1,
        },
      ]
    );
    expect(untagged.topic_performance[0].topic).toBe(UNTAGGED_TOPIC);
  });

  it("no topic label is ever a bare UUID", () => {
    const r = scoreDiagnosticSession(
      [
        { question_id: "q1", selected_option_index: 1 },
        { question_id: "q2", selected_option_index: 1 },
      ],
      [
        { id: "q1", subject_id: "s", unit_id: null, topic_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          topic_name: "النهايات", question_type: "mcq", correct_option_index: 1 },
        { id: "q2", subject_id: "s", unit_id: null, topic_id: "ffffffff-1111-2222-3333-444444444444",
          topic_name: "المتتاليات", question_type: "mcq", correct_option_index: 1 },
      ]
    );
    for (const t of r.topic_performance) {
      expect(t.topic).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });
});

describe("REGRESSION: the topic relation arrives as an object", () => {
  // The first live run also died on `a.topic.localeCompare is not a
  // function`: PostgREST returns diagnostic_topics(name) as { name: "..." }
  // because the FK is declared, so the alias is an embedded resource.

  it("normaliseTopicName unwraps the nested object", () => {
    expect(normaliseTopicName({ name: "التكامل" })).toBe("التكامل");
  });

  it("normaliseTopicName passes a plain string through", () => {
    expect(normaliseTopicName("النهايات")).toBe("النهايات");
  });

  it("normaliseTopicName returns null for anything unusable", () => {
    expect(normaliseTopicName(null)).toBeNull();
    expect(normaliseTopicName(undefined)).toBeNull();
    expect(normaliseTopicName({})).toBeNull();
    expect(normaliseTopicName({ name: null })).toBeNull();
    expect(normaliseTopicName("   ")).toBeNull();
  });

  it("a nested-object relation produces a usable string label", () => {
    const r = scoreDiagnosticSession(
      [{ question_id: "q1", selected_option_index: 1 }],
      [
        {
          id: "q1",
          subject_id: "s",
          unit_id: null,
          topic_id: "f3a31dca-c488-44ec-abd6-a10e0a0a4f27",
          topic_name: { name: "التكامل" },
          question_type: "mcq",
          correct_option_index: 1,
        },
      ]
    );
    expect(typeof r.topic_performance[0].topic).toBe("string");
    expect(r.topic_performance[0].topic).toBe("التكامل");
  });

  it("aggregation survives a mixed batch of shapes", () => {
    // Real payloads are not uniform; the sort must not throw.
    const r = scoreDiagnosticSession(
      [
        { question_id: "a", selected_option_index: 1 },
        { question_id: "b", selected_option_index: 0 },
        { question_id: "c", selected_option_index: 1 },
      ],
      [
        { id: "a", subject_id: "s", unit_id: null, topic_id: "t1",
          topic_name: { name: "النهايات" }, question_type: "mcq", correct_option_index: 1 },
        { id: "b", subject_id: "s", unit_id: null, topic_id: "t2",
          topic_name: "المتتاليات", question_type: "mcq", correct_option_index: 1 },
        { id: "c", subject_id: "s", unit_id: null, topic_id: null,
          topic_name: null, question_type: "mcq", correct_option_index: 1 },
      ]
    );
    expect(r.topic_performance).toHaveLength(3);
    const topics = r.topic_performance.map((t) => t.topic);
    expect(topics).toContain("النهايات");
    expect(topics).toContain("المتتاليات");
    expect(topics).toContain(UNTAGGED_TOPIC);
    expect(topics.every((t) => typeof t === "string")).toBe(true);
  });
});


describe("SECURITY: recommendations are server-authored", () => {
  // Found by the live smoke test. "diag_recs: user insert" was granted to
  // role PUBLIC, which includes anon: anyone who knew a session_id could
  // author a recommendation. A recommendation is an OUTPUT of scoring, so
  // the client gets read access and nothing more.

  it("the public INSERT policy is dropped", () => {
    expect(recsSql).toContain(
      'drop policy if exists "diag_recs: user insert"'
    );
  });

  it("INSERT/UPDATE/DELETE are revoked from public, anon and authenticated", () => {
    expect(recsSql).toContain(
      "revoke insert, update, delete on public.diagnostic_recommendations from public, anon, authenticated"
    );
  });

  it("authenticated is NOT granted UPDATE back for upsert convenience", () => {
    // The tempting shortcut was "just give authenticated UPDATE so the
    // PostgREST upsert works". That reopens the audit trail. The write moved
    // into a SECURITY DEFINER function instead.
    const rollbackStart = recsSql.indexOf("-- ROLLBACK");
    const live = recsSql.slice(0, rollbackStart);
    expect(live).not.toMatch(
      /^\s*grant\s+(insert|update|delete)[^;]*diagnostic_recommendations[^;]*to\s+(authenticated|anon|public)\s*;/im
    );
  });

  it("the read policy is owner-scoped and kept", () => {
    expect(recsSql).toContain('create policy "diag_recs: user reads"');
    expect(recsSql).toContain("where user_id = auth.uid()");
  });

  it("the only writer is a SECURITY DEFINER RPC", () => {
    expect(recsSql).toContain(
      "create or replace function public.write_diagnostic_recommendations"
    );
    expect(recsSql).toContain("security definer");
    expect(recsSql).toContain("set search_path = public, pg_temp");
  });

  it("the writer is idempotent and validates ownership", () => {
    // Slice from the CREATE, not from the first mention in the header prose.
    const fn = recsSql.slice(
      recsSql.indexOf("create or replace function public.write_diagnostic_recommendations")
    );
    expect(fn).toContain("on conflict (session_id, weak_topic) do nothing");
    expect(fn).toContain("auth.uid()");
    expect(fn).not.toMatch(/p_user_id/);
  });

  it("the writer is granted to authenticated only, not public", () => {
    expect(recsSql).toContain(
      "revoke all on function public.write_diagnostic_recommendations(uuid, jsonb) from public"
    );
    expect(recsSql).toContain(
      "grant execute on function public.write_diagnostic_recommendations(uuid, jsonb) to authenticated"
    );
  });

  it("the route calls the RPC instead of writing the table", () => {
    expect(submitCode).toContain('rpc("write_diagnostic_recommendations"');
    expect(submitCode).not.toMatch(
      /\.from\(["']diagnostic_recommendations["']\)[\s\S]{0,60}?\.(?:insert|upsert|update|delete)\s*\(/
    );
  });

  it("the route writes the columns the live table actually has", () => {
    // The 1.2E migration file declares content_refs jsonb; production has
    // source_content_type / _id / _title. PostgREST answered PGRST204 on
    // the first live run. The live schema wins.
    expect(submitCode).toContain("source_content_type");
    expect(submitCode).not.toContain("content_refs");
  });
});


describe("REGRESSION: a synthetic plan day needs a real uuid", () => {
  // Second live failure: the planner is pure, so a day it invents for a weak
  // topic has a placeholder id like "synthetic-review-<topic>".
  // exam_plan_days.id is uuid, and PostgREST rejected the whole batch with
  // 22P02 -- which meant the replan silently did nothing.

  it("the planner marks invented days with a non-uuid placeholder", () => {
    expect(replannerCode).toContain("synthetic-review-");
  });

  it("the route swaps placeholders for a generated uuid", () => {
    expect(submitCode).toMatch(/crypto\.randomUUID\(\)/);
    expect(submitCode).toContain("existingIds");
  });

  it("the route only replaces ids it did not read from the database", () => {
    // Rows that came back from the plan query keep their real id, otherwise
    // the upsert would insert duplicates instead of updating.
    expect(submitCode).toMatch(/isReal\s*\?\s*d\.id\s*:\s*crypto\.randomUUID\(\)/);
  });

  it("no placeholder reaches the database", () => {
    // The mapping is the only place ids are chosen, so guarding it is enough.
    const block = submitCode.slice(
      submitCode.indexOf("const toInsert"),
      submitCode.indexOf("onConflict")
    );
    expect(block).toContain("crypto.randomUUID()");
    expect(block).not.toContain("synthetic-review-");
  });
});
