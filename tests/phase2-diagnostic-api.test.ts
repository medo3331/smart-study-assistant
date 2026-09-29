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

// Phase 4.4-D moved the scoring and mastery functions into their own file,
// because phase2-diagnostic-security.sql had already been applied to
// production. The same guarantees are asserted against the file that is
// actually live rather than the one the tests were written next to.
const examBankSql = readFileSync(
  join(root, "db", "phase4-diagnostic-rpc-exam-bank.sql"),
  "utf8"
);
const examBankCode = examBankSql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// Phase 4.4-F: the public exam bank is a separate read from the diagnostic,
// served by its own route.
const examBankApiSrc = readFileSync(
  join(root, "app", "api", "exam-bank", "questions", "route.ts"),
  "utf8"
);
const viewerSrc = readFileSync(join(root, "components", "ExamBankViewer.tsx"), "utf8");
const examBankApiCode = codeOnly(examBankApiSrc);
const viewerCode = codeOnly(viewerSrc);

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
    // Phase 4.4-E: the exam bank has no unit_id or source_reference, and the
    // answer key is no longer read here at all — scoring is entirely in the
    // database now, so there is nothing to fetch it for.
    expect(startSrc).toContain(
      '"id, topic_id, question_text, question_type, options_json, difficulty"'
    );
  });

  it("the start route never reads the answer key into a row", () => {
    // Stricter than the old assertion, in the direction that matters. The key
    // is used by submit_diagnostic_answers in SQL, so this route has no
    // reason to select it into a row object at all.
    //
    // It does name the column in a .not("is", null) filter — that is an
    // eligibility test on whether a key exists, not a read of its value. So
    // the assertion targets the projected column list specifically, by
    // matching the .select("...") literal rather than the whole query chain,
    // which would include the filters and give a false positive.
    const projected = startCode.match(/\.select\("([^"]*)"\)/g) ?? [];
    const examBankSelect = projected.find((s) => s.includes("question_text"));
    expect(examBankSelect).toBeDefined();
    expect(examBankSelect).not.toContain("correct_option_index");
    expect(examBankSelect).not.toContain("source_note");
    expect(examBankSelect).not.toContain("verification_status");
    expect(examBankSelect).not.toContain("exam_id");
  });

  it("the start route reads the exam bank, not diagnostic_question_bank", () => {
    expect(startCode).toContain("past_exam_questions");
    // The name may appear in prose, but never as a table the route queries.
    expect(startCode).not.toMatch(/from\(\s*"diagnostic_question_bank"\s*\)/);
    expect(startCode).not.toMatch(/from\(\s*'diagnostic_question_bank'\s*\)/);
  });

  it("the start route states the eligibility rule explicitly", () => {
    // "Verified" means verified for the diagnostic, decided here rather than
    // inherited from a read policy written for /exams.
    expect(startCode).toContain("verification_status");
    expect(startCode).toContain("verified");
    expect(startCode).toContain('"mcq"');
    expect(startCode).toContain("topic_id");
  });

  it("the start route resolves the subject through the exam", () => {
    // past_exam_questions has no subject_id by design. Subject is reachable
    // only by walking question -> exam -> subject, and the RPC validates the
    // same path on submit.
    expect(startCode).toContain("past_exams");
    expect(startCode).toContain("exam_id");
  });

  it("the start route still authenticates before using the admin client", () => {
    // Bypassing RLS on the read is deliberate. Bypassing the session check
    // would not be, so the order is asserted rather than assumed.
    const auth = startCode.indexOf("requireUser");
    const admin = startCode.indexOf("createServiceClient");
    expect(auth).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(admin);
  });

  it("the session row is written through the user-scoped client, not the admin one", () => {
    // The admin client reads questions. The session write must go through the
    // caller's own client so RLS applies and the session is owned by the
    // authenticated user. This is the check that stops "we already have an
    // admin client here" from quietly becoming a service-role write on the
    // one row that decides who owns a diagnostic.
    const at = startCode.indexOf('.from("diagnostic_sessions")');
    expect(at).toBeGreaterThan(-1);
    const stmt = startCode.slice(
      startCode.lastIndexOf("const { data: session", at),
      startCode.indexOf(".single()", at)
    );
    expect(stmt.length).toBeGreaterThan(0);
    expect(stmt).toContain("supabase");
    expect(stmt).toContain(".insert(");
    expect(stmt).not.toContain("admin");
  });

  it("a subject with no verified questions gets a 404, not a 500", () => {
    // A known state, not a fault. Every subject except mathematics is in
    // this state today, and the student should be told that plainly rather
    // than shown a generic error.
    expect(startCode).toContain("404");
    expect(startCode).toContain("مفيش أسئلة");
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
    // exam_plan_days is written through apply_exam_plan_replan() now, so the
    // route's own direct writes are the session row only.
    expect(submitCode).toContain('.from("diagnostic_sessions")');

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


describe("REGRESSION: a synthetic plan day never reaches the uuid column", () => {
  // The planner is pure, so a day it invents carries a placeholder id like
  // "synthetic-review-<topic>". exam_plan_days.id is uuid, and the first
  // attempt sent that string and the whole batch failed with 22P02.

  it("the planner still marks invented days with a non-uuid placeholder", () => {
    expect(replannerCode).toContain("synthetic-review-");
  });

  it("the route sends null for an invented day, not the placeholder", () => {
    expect(submitCode).toMatch(/id:\s*isReal\s*\?\s*d\.id\s*:\s*null/);
  });

  it("the placeholder string is never sent to the database", () => {
    const block = submitCode.slice(
      submitCode.indexOf("p_days:"),
      submitCode.indexOf("apply_exam_plan_replan")
    );
    expect(block).not.toContain("synthetic-review-");
  });

  it("the database generates the uuid, not the route", () => {
    // gen_random_uuid() in SQL rather than crypto.randomUUID() in TS: the
    // function is SECURITY DEFINER, so the id is minted where the row is
    // written and the client never influences it.
    const fn = recsSql.slice(recsSql.indexOf("create or replace function public.apply_exam_plan_replan"));
    expect(fn).toContain("gen_random_uuid()");
  });
});

describe("REGRESSION: a reorder cannot collide with itself", () => {
  // Found while building the Phase 3 UI. replanExamPlan RENUMBERS days, and
  // UNIQUE(plan_id, day_number) is checked per row as each write lands. A
  // PostgREST upsert moving day 2 onto day 1 therefore failed with:
  //     23505 duplicate key value violates unique constraint
  //         "exam_plan_days_plan_id_day_number_key"
  // The live smoke test passed only because its plan happened to need an
  // insert, not a renumber — every real reorder has been failing.
  //
  // The fix is a SECURITY DEFINER function that parks the existing rows on
  // negative slots first, so nothing can collide while the write lands.

  it("the route calls apply_exam_plan_replan, not a table upsert", () => {
    expect(submitCode).toMatch(/rpc\(\s*"apply_exam_plan_replan"/);
    expect(submitCode).not.toMatch(
      /\.from\(["']exam_plan_days["']\)[\s\S]{0,80}?\.(?:insert|upsert|update)\s*\(/
    );
  });

  it("invented days send a null id so the database assigns the uuid", () => {
    // The planner's "synthetic-review-<topic>" placeholder is not a uuid and
    // must never reach the column.
    expect(submitCode).toMatch(/id:\s*isReal\s*\?\s*d\.id\s*:\s*null/);
    expect(submitCode).not.toMatch(/id:\s*isReal\s*\?\s*d\.id\s*:\s*d\.id/);
  });

  it("the function parks rows on negative slots before writing", () => {
    // Phase 1 of the two-phase renumber: negatives cannot clash with the
    // positive numbers the planner assigns.
    const fn = recsSql.slice(recsSql.indexOf("create or replace function public.apply_exam_plan_replan"));
    expect(fn).toContain("set day_number = -parked.n");
  });

  it("the function generates a uuid instead of relying on the column default", () => {
    // id is NOT NULL and the default only applies when the column is OMITTED,
    // not when it is explicitly NULL. nullif(...)::uuid alone therefore raised
    // 23502 on every new day.
    const fn = recsSql.slice(recsSql.indexOf("create or replace function public.apply_exam_plan_replan"));
    expect(fn).toMatch(/coalesce\(\s*nullif\(v_item\s*->>\s*'id',\s*''\)\s*::uuid,\s*gen_random_uuid\(\)\s*\)/);
  });

  it("rows the planner dropped are removed, not left parked", () => {
    const fn = recsSql.slice(recsSql.indexOf("create or replace function public.apply_exam_plan_replan"));
    expect(fn).toContain("day_number < 0");
  });

  it("the function verifies ownership from the plan row", () => {
    const fn = recsSql.slice(recsSql.indexOf("create or replace function public.apply_exam_plan_replan"));
    expect(fn).toContain("auth.uid()");
    expect(fn).not.toMatch(/p_user_id/);
  });

  it("the function is SECURITY DEFINER and granted to authenticated only", () => {
    const fn = recsSql.slice(recsSql.indexOf("create or replace function public.apply_exam_plan_replan"));
    expect(fn).toContain("security definer");
    expect(recsSql).toContain(
      "revoke all on function public.apply_exam_plan_replan(uuid, jsonb) from public"
    );
    expect(recsSql).toContain(
      "grant execute on function public.apply_exam_plan_replan(uuid, jsonb) to authenticated"
    );
  });
});

describe("PHASE 4.4-D/E: the exam bank is the diagnostic source of truth", () => {
  it("the submit RPC reads the answer key from past_exam_questions", () => {
    const fn = between(examBankCode, "create or replace function public.submit_diagnostic_answers", "create or replace function public.refresh_topic_mastery");
    expect(fn).toContain("from public.past_exam_questions q");
    expect(fn).toContain("public.past_exams e");
  });

  it("no function body still reads diagnostic_question_bank", () => {
    // Checked against the whole file, not a function, because a single
    // surviving reference anywhere is what Phase 4.5 would trip on.
    expect(examBankCode).not.toMatch(/from\s+public\.diagnostic_question_bank/);
    expect(examBankCode).not.toMatch(/join\s+public\.diagnostic_question_bank/);
  });

  it("the mastery function derives topics from the exam bank", () => {
    const fn = between(examBankCode, "create or replace function public.refresh_topic_mastery", "commit;");
    expect(fn).toContain("join public.past_exam_questions q on q.id = a.bank_question_id");
  });

  it("the submit RPC takes bank_question_id, with no fallback to question_id", () => {
    const fn = between(examBankCode, "create or replace function public.submit_diagnostic_answers", "create or replace function public.refresh_topic_mastery");
    expect(fn).toContain("bank_question_id");
    // A dual-key contract would leave the legacy path reachable forever.
    expect(fn).not.toMatch(/v_item\s*->>\s*'question_id'/);
  });

  it("the submit RPC validates the question against the session subject", () => {
    // A question id from one subject submitted inside another subject's
    // session is the hole this closes.
    const fn = between(examBankCode, "create or replace function public.submit_diagnostic_answers", "create or replace function public.refresh_topic_mastery");
    expect(fn).toContain("e.subject_id = v_subject");
    expect(fn).toContain("q.verification_status = 'verified'");
    expect(fn).toContain("q.topic_id is not null");
  });

  it("the submit RPC is still the only thing that decides is_correct", () => {
    const fn = between(examBankCode, "create or replace function public.submit_diagnostic_answers", "create or replace function public.refresh_topic_mastery");
    expect(fn).toContain("q.correct_option_index = v_sel");
    // ...and it never returns the key.
    const ret = fn.slice(fn.indexOf("return jsonb_build_object"));
    expect(ret).not.toContain("correct_option_index");
    expect(ret).toContain("correct_count");
  });

  it("both functions stay SECURITY DEFINER with a pinned search_path", () => {
    // They are the only writers now that the client INSERT grant is gone, so
    // a revoked-privilege regression would break every submit.
    expect(examBankCode).toContain("security definer");
    expect(examBankCode).toContain("set search_path to 'public', 'pg_temp'");
  });

  it("bank_question_id is NOT NULL and question_id is nullable", () => {
    // The asymmetry is the point: no future answer can be written without a
    // canonical exam-bank question, while a question authored directly in the
    // exam bank has no legacy id to store.
    expect(examBankCode).toContain("alter column bank_question_id set not null");
    expect(examBankCode).toContain("alter column question_id drop not null");
  });

  it("the legacy uniqueness guard is retained during the transition", () => {
    // Both indexes defend the same invariant from two sides while the 295
    // historical rows carry both ids. Removing the legacy one here would
    // close a door 4.4-G still needs open.
    expect(examBankSql).toContain("retained until 4.4-G");
    expect(examBankCode).toContain("on conflict (session_id, bank_question_id)");
  });

  it("the migration aborts rather than enforcing NOT NULL on incomplete data", () => {
    expect(examBankCode).toContain("PHASE44D_ABORT");
    expect(examBankCode).toContain("still lack a bank_question_id");
  });
});

describe("PHASE 4.4-F: the public exam bank serves no answer key", () => {
  it("the API never projects the answer key", () => {
    // Stronger than asserting the key is absent from the response: it is
    // never fetched. Selecting it and filtering it out would still put it in
    // the network response, which is the leak this phase closes.
    const projected = examBankApiCode.match(/\.select\("([^"]*)"\)/g) ?? [];
    expect(projected.length).toBeGreaterThan(0);
    for (const sel of projected) {
      expect(sel).not.toContain("correct_option_index");
      expect(sel).not.toContain("source_question_id");
      expect(sel).not.toContain("source_note");
    }
  });

  it("the payload is built field by field, not by spreading a row", () => {
    // The old viewer did {...q} on a row that included the key, so every
    // future column would land in component state automatically.
    expect(examBankApiCode).not.toMatch(/\.\.\.q\b/);
    expect(viewerCode).not.toMatch(/\.\.\.q\b/);
  });

  it("the viewer does not mention the answer key at all", () => {
    // Network, state and DOM in one assertion. The name may appear in the
    // header comment explaining what was fixed, so the executable code is
    // checked rather than the file: if the field is not named in code it
    // cannot be rendered, and the API does not return it, so it cannot be in
    // state either.
    expect(viewerCode).not.toContain("correct_option_index");
  });

  it("the API requires a published exam", () => {
    // The public exam bank must respect is_published. The diagnostic is a
    // different read with different permissions; giving the viewer
    // service-role access would have removed the very check that matters
    // here.
    expect(examBankApiCode).toContain("is_published");
    expect(examBankApiCode).toContain("404");
  });

  it("the API reads through the caller's client, not the service role", () => {
    // If this ever imports createServiceClient, an unpublished exam becomes
    // reachable and the test should fail loudly rather than the leak shipping.
    expect(examBankApiSrc).not.toContain("supabase/admin");
    expect(examBankApiSrc).not.toContain("createServiceClient");
  });

  it("the viewer no longer hard-codes a subject", () => {
    // It defaulted to a Mathematics uuid, so every exam page showed Math
    // questions regardless of which exam was open.
    expect(viewerSrc).not.toContain("6d91c3bb");
    expect(viewerSrc).not.toContain("diagnostic_question_bank");
  });

  it("the viewer takes an examId and reads it from the API", () => {
    expect(viewerSrc).toContain("examId");
    expect(viewerSrc).toContain("/api/exam-bank/questions");
    // No direct table access from the browser any more.
    expect(viewerCode).not.toMatch(/\.from\(\s*"past_exam_questions"/);
  });

  it("the viewer renders the exam's own title, not a literal", () => {
    expect(viewerSrc).toContain("exam.title");
    expect(viewerSrc).not.toContain("2023");
  });

  it("the API validates examId before it reaches the database", () => {
    // A junk value should be a 400, not a 22P02 from Postgres.
    expect(examBankApiCode).toContain("examId");
    expect(examBankApiCode).toContain("400");
    expect(examBankApiCode).toMatch(/\[0-9a-f\]\{8\}/);
  });

  it("neither the API nor the viewer reads diagnostic_question_bank", () => {
    expect(examBankApiCode).not.toContain("diagnostic_question_bank");
    expect(viewerCode).not.toContain("diagnostic_question_bank");
  });
});
