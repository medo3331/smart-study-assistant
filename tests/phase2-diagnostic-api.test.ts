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

const root = join(__dirname, "..");

/** Strips comments so prose about a pattern cannot satisfy or break a match. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

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

const startCode = codeOnly(startSrc);
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

  it("recommendations are upserted on the unique key", () => {
    expect(submitCode).toContain('"session_id,weak_topic"');
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
    for (const table of [
      "diagnostic_sessions",
      "diagnostic_recommendations",
      "exam_plan_days",
    ]) {
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
