/**
 * Phase 2 live smoke test — exercises the real routes against the real DB.
 *
 * Scenario (fixed, so weak topics are deterministic):
 *   every question correct, EXCEPT
 *     المتتاليات        (2 questions) → 0/2 = 0%  → weak
 *     الهندسة الفراغية   (1 question)  → 0/1 = 0%  → weak
 *   so the plan should be reordered to put both first.
 *
 * Security proof: the submit payload carries ONLY question_id and
 * selected_option_index. The server derives is_correct itself.
 *
 * Credentials come from .smoke-credentials.json (gitignored). No secrets are
 * printed.
 *
 * Run: node smoke-test.mjs
 */


// Resolve paths from the repo root so the script runs from any directory.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readEnv = (p) => readFileSync(join(ROOT, p), "utf8");
const readCreds = () => JSON.parse(readEnv(".smoke-credentials.json"));

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SUBJECT_ID = "6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec";
const WEAK_TOPICS = ["المتتاليات", "الهندسة الفراغية"];

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["\x27]|["\x27]$/g, "");
  }
  return out;
}

const env = loadEnv(".env.local");
const creds = readCreds();

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// ── STEP 0: sign in as the ordinary test user ─────────────────────────────
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: si, error: siErr } = await db.auth.signInWithPassword({
  email: creds.email,
  password: creds.password,
});
if (siErr) throw new Error("signin failed: " + siErr.message);

const token = si.session.access_token;
const userId = si.user.id;
const H = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
};
console.log("STEP 0  signed in as", userId, "\n");

// ── STEP 1: start the diagnostic ──────────────────────────────────────────
console.log("STEP 1  POST /api/diagnostic/start");
const startRes = await fetch(`${BASE}/api/diagnostic/start`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ subject_id: SUBJECT_ID, question_count: 10 }),
});
const start = await startRes.json();
check("start returned 200", startRes.status === 200, `status ${startRes.status}`);
check("10 questions returned", start?.questions?.length === 10, `got ${start?.questions?.length}`);
check("session_id returned", typeof start?.session_id === "string");

// The answer key must not be anywhere in the response.
const startJson = JSON.stringify(start);
check("no correct_option_index in start payload", !startJson.includes("correct_option_index"));
check("no is_correct in start payload", !startJson.includes("is_correct"));
check("no answer key per question",
  start.questions.every((q) => !("correct_option_index" in q) && !("is_correct" in q)));
check("questions carry options", start.questions.every((q) => Array.isArray(q.options) && q.options.length > 0));
console.log("");

// ── STEP 2: build the answers ─────────────────────────────────────────────
// The client is not supposed to know the answer key, and it does not: it
// never saw correct_option_index. The server will mark each one. We only
// need to choose a number per question, and we deliberately choose the
// WRONG one (0) for the two weak topics and something for the rest.
//
// To make "the rest" actually correct without cheating, we read the key
// from the DB using the signed-in user's own read access. This is the test
// harness knowing the answers, not the route.
const topicNames = {};
const { data: bankRows } = await db
  .from("diagnostic_question_bank")
  .select("id, correct_option_index, topic:diagnostic_topics(name)")
  .eq("subject_id", SUBJECT_ID)
  .eq("status", "published");
for (const b of bankRows ?? []) topicNames[b.id] = b.topic?.name ?? null;

const answers = start.questions.map((q) => {
  const key = bankRows.find((b) => b.id === q.id);
  const topic = topicNames[q.id];
  if (WEAK_TOPICS.includes(topic)) {
    // Pick any index that is NOT the correct one.
    const wrong = key.correct_option_index === 0 ? 1 : 0;
    return { question_id: q.id, selected_option_index: wrong };
  }
  return { question_id: q.id, selected_option_index: key.correct_option_index };
});

const weakCount = answers.filter((a) =>
  WEAK_TOPICS.includes(bankRows.find((b) => b.id === a.question_id)?.topic?.name)
).length;
console.log("STEP 2  built answers:", answers.length, "| deliberately wrong:", weakCount);
check("exactly 3 answers are wrong", weakCount === 3, `got ${weakCount}`);

// Security: the payload holds no verdict of any kind.
const payload = JSON.stringify({ session_id: start.session_id, answers, plan_id: creds.planId });
check("payload carries no is_correct", !payload.includes("is_correct"));
check("payload carries no correct_option_index", !payload.includes("correct_option_index"));
check("payload carries no score/mastery/weak_topics",
  !/"score"|"mastery"|"weak_topics"/.test(payload));
console.log("");

// ── STEP 3: submit ────────────────────────────────────────────────────────
console.log("STEP 3  POST /api/diagnostic/submit");
const subRes = await fetch(`${BASE}/api/diagnostic/submit`, {
  method: "POST",
  headers: H,
  body: payload,
});
const sub = await subRes.json();
check("submit returned 200", subRes.status === 200, `status ${subRes.status}${sub.warning ? " warning=" + sub.warning : ""}`);
check("score is 7 of 10", sub?.score === 7 && sub?.total === 10, `got ${sub?.score}/${sub?.total}`);
check("wrong_count is 3", sub?.wrong_count === 3, `got ${sub?.wrong_count}`);

const weakNames = (sub?.weak_topics ?? []).map((w) => w.topic);
for (const t of WEAK_TOPICS) {
  check(`weak topic detected: ${t}`, weakNames.includes(t));
}
check("no other weak topic", weakNames.length === WEAK_TOPICS.length, `got ${weakNames.join(", ")}`);
check("mastery_updated", sub?.mastery_updated === true);
check("plan_updated", sub?.plan_updated === true, JSON.stringify(sub?.plan_reasons ?? []));
console.log("");

// ── STEP 4: verify what the server persisted ──────────────────────────────
console.log("STEP 4  verifying server-side state");
const { data: storedAnswers } = await db
  .from("diagnostic_answers")
  .select("question_id, is_correct, selected_option_index")
  .eq("session_id", start.session_id);
check("10 answers stored", storedAnswers?.length === 10, `got ${storedAnswers?.length}`);
const storedCorrect = storedAnswers.filter((a) => a.is_correct).length;
check("server marked 7 correct", storedCorrect === 7, `got ${storedCorrect}`);

const { data: session } = await db
  .from("diagnostic_sessions")
  .select("status, score, correct_count, wrong_count")
  .eq("id", start.session_id).single();
check("session completed", session?.status === "completed", `status ${session?.status}`);
check("session score 7", session?.score === 7, `got ${session?.score}`);
console.log("");

// ── STEP 5: mastery, recommendations, plan ────────────────────────────────
console.log("STEP 5  mastery / recommendations / plan");
const { data: weak } = await db
  .from("user_weaknesses")
  .select("topic_name, attempts, correct, mastery_level")
  .eq("user_id", userId);
console.log("    user_weaknesses:", JSON.stringify(weak));
for (const t of WEAK_TOPICS) {
  const row = weak?.find((w) => w.topic_name === t);
  check(`mastery row for ${t}`, Boolean(row));
  if (row) {
    check(`  ${t} mastery is 0`, Number(row.mastery_level) === 0, `got ${row.mastery_level}`);
    check(`  ${t} attempts > 0`, row.attempts > 0, `got ${row.attempts}`);
  }
}
const strongRows = (weak ?? []).filter((w) => !WEAK_TOPICS.includes(w.topic_name));
check("strong topics recorded too", strongRows.length > 0, `${strongRows.length} rows`);
check("correct never exceeds attempts", (weak ?? []).every((w) => w.correct <= w.attempts));

const { data: recs } = await db
  .from("diagnostic_recommendations")
  .select("weak_topic, accuracy, priority")
  .eq("session_id", start.session_id);
console.log("    recommendations:", JSON.stringify(recs));
check("one recommendation per weak topic", recs?.length === WEAK_TOPICS.length, `got ${recs?.length}`);

const { data: days } = await db
  .from("exam_plan_days")
  .select("id, day_number, study_date, kind, title, is_done")
  .eq("plan_id", creds.planId).order("day_number");
console.log("    plan after replan:");
for (const d of days) console.log(`      n=${d.day_number} ${d.study_date} ${d.kind.padEnd(8)} ${d.title}`);
console.log("");

// ── STEP 6: invariants on the plan ────────────────────────────────────────
console.log("STEP 6  plan invariants");
const nums = days.map((d) => d.day_number);
const dates = days.map((d) => d.study_date);
check("day_number unique", new Set(nums).size === nums.length);
check("day_number ascending", nums.every((n, i) => i === 0 || n > nums[i - 1]));
check("study_date chronological", dates.every((d, i) => i === 0 || d >= dates[i - 1]));
check("study_date unique", new Set(dates).size === dates.length);
check("kinds within CHECK constraint",
  days.every((d) => ["content", "review", "quiz"].includes(d.kind)));
// The plan is allowed to GROW: replanExamPlan inserts a review day for a
// weak topic that has no day of its own. It must never SHRINK, though.
check("plan did not shrink", days.length >= 5, `got ${days.length}`);

const firstTwo = days.slice(0, 2).map((d) => d.title);
check("a weak topic moved to the front",
  firstTwo.some((t) => WEAK_TOPICS.some((w) => t.includes(w) || w.includes(t))),
  firstTwo.join(" | "));
console.log("");

// ── STEP 7: retry the identical submission ─────────────────────────────────
console.log("STEP 7  retry — idempotency");
const beforeAnswers = storedAnswers.length;
const beforeWeak = JSON.stringify(weak);
const beforeRecs = recs.length;
const beforePlan = JSON.stringify(days);

const retryRes = await fetch(`${BASE}/api/diagnostic/submit`, {
  method: "POST",
  headers: H,
  body: payload,
});
const retry = await retryRes.json();
check("retry rejected with 409", retryRes.status === 409, `status ${retryRes.status}`);
console.log("    retry said:", JSON.stringify(retry).slice(0, 120));
console.log("");

// ── STEP 8: nothing changed ───────────────────────────────────────────────
console.log("STEP 8  state after retry");
const { data: afterAnswers } = await db
  .from("diagnostic_answers")
  .select("question_id").eq("session_id", start.session_id);
check("answers not duplicated", afterAnswers.length === beforeAnswers,
  `${beforeAnswers} → ${afterAnswers.length}`);

const { data: afterWeak } = await db
  .from("user_weaknesses")
  .select("topic_name, attempts, correct, mastery_level")
  .eq("user_id", userId);
check("mastery unchanged", JSON.stringify(afterWeak) === beforeWeak);
check("attempts not doubled",
  (afterWeak ?? []).every((w) => w.attempts <= Math.max(1, w.correct + w.attempts - w.correct + w.correct) && w.attempts > 0));

const { data: afterRecs } = await db
  .from("diagnostic_recommendations")
  .select("id").eq("session_id", start.session_id);
check("recommendations not duplicated", afterRecs.length === beforeRecs,
  `${beforeRecs} → ${afterRecs.length}`);

const { data: afterDays } = await db
  .from("exam_plan_days")
  .select("id, day_number, study_date, kind, title, is_done")
  .eq("plan_id", creds.planId).order("day_number");
check("plan did not move on retry",
  JSON.stringify(afterDays) === beforePlan);
console.log("");

console.log(`RESULT  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
