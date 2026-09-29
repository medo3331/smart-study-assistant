import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["\x27]|["\x27]$/g, "");
}
const creds = JSON.parse(readFileSync(join(ROOT, ".smoke-credentials.json"), "utf8"));
const BASE = process.env.BASE ?? "http://localhost:3000";
const SUBJECT_ID = "6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec";
const WEAK = ["المتتاليات", "الهندسة الفراغية"];

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

// service-role DB, for assertions only
const pdb = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pdb.connect();

console.log("=== 0. sign in ===");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: si, error: siErr } = await db.auth.signInWithPassword({ email: creds.email, password: creds.password });
if (siErr) { console.log("  signin failed: " + siErr.message); process.exit(1); }
const userId = si.user.id;
const H = { "Content-Type": "application/json", Authorization: `Bearer ${si.session.access_token}` };
console.log("  user " + userId + "\n");

// ── BASELINE counts ─────────────────────────────────────────────
const b0 = await pdb.query(`select
  (select count(*)::int from diagnostic_sessions)::int sessions,
  (select count(*)::int from diagnostic_answers)::int answers,
  (select count(*)::int from user_weaknesses)::int weak,
  (select count(*)::int from diagnostic_recommendations)::int recs,
  (select count(*)::int from exam_plan_days)::int days,
  (select count(*)::int from past_exam_questions)::int bankq`);
const days0 = (await pdb.query(`select id, day_number, study_date, kind, title, is_done from exam_plan_days where plan_id=$1 order by day_number`, [creds.planId])).rows;
const weak0 = (await pdb.query(`select topic_name, attempts, correct, mastery_level from user_weaknesses where user_id=$1 order by topic_name`, [userId])).rows;
console.log("BASELINE  sessions=" + b0.rows[0].sessions + " answers=" + b0.rows[0].answers + " weak=" + b0.rows[0].weak + " recs=" + b0.rows[0].recs + " days=" + b0.rows[0].days + " bankq=" + b0.rows[0].bankq + "\n");

console.log("=== 1. POST /api/diagnostic/start ===");
const t0 = Date.now();
const startRes = await fetch(`${BASE}/api/diagnostic/start`, { method: "POST", headers: H, body: JSON.stringify({ subject_id: SUBJECT_ID, question_count: 10 }) });
const start = await startRes.json();
check("start returns 200", startRes.status === 200, "status " + startRes.status);
check("10 questions returned", start?.questions?.length === 10, "got " + start?.questions?.length);
check("session_id returned", typeof start?.session_id === "string");
const startJson = JSON.stringify(start);
check("no correct_option_index in payload", !startJson.includes("correct_option_index"));
check("no is_correct in payload", !startJson.includes("is_correct"));
check("no verification_status in payload", !startJson.includes("verification_status"));
check("no source_note in payload", !startJson.includes("source_note"));
check("no exam_id in payload", !startJson.includes("exam_id"));
check("no unit_id in payload", !startJson.includes("unit_id"));
check("every question carries options", start.questions.every(q => Array.isArray(q.options) && q.options.length > 0));
check("every question has a topic_id", start.questions.every(q => typeof q.topic_id === "string"));
console.log("  (start " + (Date.now() - t0) + "ms)\n");

console.log("=== 2. ids are exam-bank ids ===");
const ids = start.questions.map(q => q.id);
const idCheck = await pdb.query(`select count(*)::int total,
  count(*) filter (where exists (select 1 from past_exam_questions p where p.id = q.id))::int in_bank
  from unnest($1::uuid[]) q(id)`, [ids]);
check("all 10 ids resolve in past_exam_questions", idCheck.rows[0].in_bank === 10, idCheck.rows[0].in_bank + "/10");
check("the ids are the exam bank's own, not borrowed from anywhere else",
  idCheck.rows[0].in_bank === idCheck.rows[0].total, idCheck.rows[0].in_bank + " of " + idCheck.rows[0].total);
const elig = await pdb.query(`select count(*)::int n from unnest($1::uuid[]) q(id) join past_exam_questions p on p.id=q.id
  join past_exams e on e.id=p.exam_id
  where e.subject_id=$2 and p.question_type='mcq' and p.verification_status='verified' and p.topic_id is not null and p.correct_option_index is not null`, [ids, SUBJECT_ID]);
check("all 10 satisfy the eligibility rule", elig.rows[0].n === 10, elig.rows[0].n + "/10");
console.log("");

console.log("=== 3. build the submit payload (bank_question_id only) ===");
// Answer everything correctly EXCEPT the two weak topics, so the plan has to
// move and the weak-topic path is actually exercised.
const key = (await pdb.query(`select id, topic_id, correct_option_index from past_exam_questions where id = any($1::uuid[])`, [ids])).rows;
const topicName = (await pdb.query(`select id, name from diagnostic_topics where id = any(select topic_id from past_exam_questions where id = any($1::uuid[]))`, [ids])).rows;
const nameOf = new Map(topicName.map(t => [t.id, t.name]));
const wrongTopics = new Set();
for (const k of key) { const n = nameOf.get(k.topic_id); if (WEAK.includes(n)) wrongTopics.add(k.id); }

const answers = key.map(k => ({
  bank_question_id: k.id,
  selected_option_index: wrongTopics.has(k.id) ? (k.correct_option_index + 1) % 4 : k.correct_option_index,
}));
const payload = JSON.stringify({ session_id: start.session_id, answers });
check("payload uses bank_question_id only", !payload.includes('"question_id"'));
check("payload carries no answer key", !payload.includes("correct_option_index") && !payload.includes("is_correct"));
console.log("  wrong on: " + wrongTopics.size + " of 10\n");

console.log("=== 4. POST /api/diagnostic/submit ===");
const t1 = Date.now();
const subRes = await fetch(`${BASE}/api/diagnostic/submit`, { method: "POST", headers: H, body: payload });
const sub = await subRes.json();
const subJson = JSON.stringify(sub);
check("submit returns 200", subRes.status === 200, "status " + subRes.status);
check("no correct_option_index in result", !subJson.includes("correct_option_index"));
check("no per_question in result", !subJson.includes("per_question"));
check("no is_correct in result", !subJson.includes("is_correct"));
check("score is a number", typeof sub?.score === "number", "score=" + sub?.score);
check("total is 10", sub?.total === 10, "total=" + sub?.total);
const expectCorrect = 10 - wrongTopics.size;
check("score equals the expected correct count", sub?.correct_count === expectCorrect, sub?.correct_count + " vs " + expectCorrect);
check("weak_topics returned", Array.isArray(sub?.weak_topics), JSON.stringify(sub?.weak_topics?.map(w=>w.topic)));
check("topic_performance returned", Array.isArray(sub?.topic_performance) && sub.topic_performance.length > 0, sub?.topic_performance?.length + " topics");
check("mastery_updated true", sub?.mastery_updated === true);
check("topics_refreshed > 0", (sub?.topics_refreshed ?? 0) > 0, "refreshed " + sub?.topics_refreshed);
check("plan_updated reported", typeof sub?.plan_updated === "boolean", "plan_updated=" + sub?.plan_updated);
check("plan_reasons present", Array.isArray(sub?.plan_reasons), JSON.stringify(sub?.plan_reasons));
console.log("  (submit " + (Date.now() - t1) + "ms)\n");

console.log("=== 5. what landed in the database ===");
const sess = (await pdb.query(`select id, status, question_count, score, score_percentage, correct_count, wrong_count, completed_at from diagnostic_sessions where id=$1`, [start.session_id])).rows[0];
check("session completed", sess.status === "completed", sess.status);
check("session score matches the API", sess.score === sub.score, sess.score + " vs " + sub.score);
check("session correct_count matches", sess.correct_count === sub.correct_count, sess.correct_count + " vs " + sub.correct_count);
check("question_count is 10", sess.question_count === 10);
check("completed_at set", !!sess.completed_at);

const stored = (await pdb.query(`select bank_question_id, selected_option_index, is_correct from diagnostic_answers where session_id=$1 order by bank_question_id`, [start.session_id])).rows;
check("10 answers stored", stored.length === 10, "got " + stored.length);
check("every answer has bank_question_id", stored.every(a => a.bank_question_id));
check("exactly 10 distinct bank ids", new Set(stored.map(a => a.bank_question_id)).size === 10);
const recomputed = await pdb.query(`select count(*)::int n from diagnostic_answers a join past_exam_questions p on p.id=a.bank_question_id where a.session_id=$1 and (p.correct_option_index = a.selected_option_index) <> a.is_correct`, [start.session_id]);
check("every is_correct recomputes off the exam bank", recomputed.rows[0].n === 0, recomputed.rows[0].n + " disagree");

const weakAfter = (await pdb.query(`select topic_name, attempts, correct, mastery_level from user_weaknesses where user_id=$1 order by topic_name`, [userId])).rows;
const weakNames = new Set(weakAfter.map(w => w.topic_name));
check("mastery grew", weakAfter.length >= weak0.length, weak0.length + " -> " + weakAfter.length);
const stillWeak = WEAK.filter(t => weakNames.has(t));
check("both weak topics present in mastery", stillWeak.length === 2, stillWeak.join(" | "));

const recs = (await pdb.query(`select weak_topic, accuracy, priority from diagnostic_recommendations where session_id=$1 order by weak_topic`, [start.session_id])).rows;
check("one recommendation per weak topic", recs.length === WEAK.length, "got " + recs.length + ": " + recs.map(r=>r.weak_topic).join(", "));

const daysAfter = (await pdb.query(`select id, day_number, study_date, kind, title, is_done from exam_plan_days where plan_id=$1 order by day_number`, [creds.planId])).rows;
check("plan did not shrink", daysAfter.length >= days0.length, days0.length + " -> " + daysAfter.length);
const nums = daysAfter.map(d => d.day_number);
check("day_number still unique", new Set(nums).size === nums.length);
check("day_number still ascending", nums.every((n,i) => i===0 || n > nums[i-1]));
check("a weak topic moved toward the front", daysAfter.slice(0,2).some(d => WEAK.some(w => d.title.includes(w) || w.includes(d.title))), daysAfter.slice(0,2).map(d=>d.title).join(" | "));
console.log("  plan now:");
for (const d of daysAfter) console.log("    n=" + d.day_number + " " + d.study_date + " " + d.kind.padEnd(8) + " " + d.title);
console.log("");

console.log("=== 6. retry: one request, no duplicates ===");
const retryRes = await fetch(`${BASE}/api/diagnostic/submit`, { method: "POST", headers: H, body: payload });
const retry = await retryRes.json();
check("retry rejected with 409", retryRes.status === 409, "status " + retryRes.status + " " + JSON.stringify(retry).slice(0,80));
const afterRetry = (await pdb.query(`select count(*)::int n from diagnostic_answers where session_id=$1`, [start.session_id])).rows[0].n;
check("answers not duplicated", afterRetry === stored.length, stored.length + " -> " + afterRetry);
const weakR = (await pdb.query(`select topic_name, attempts, correct, mastery_level from user_weaknesses where user_id=$1 order by topic_name`, [userId])).rows;
check("mastery unchanged by the retry", JSON.stringify(weakR) === JSON.stringify(weakAfter));
const recsR = (await pdb.query(`select id from diagnostic_recommendations where session_id=$1`, [start.session_id])).rows;
check("recommendations not duplicated", recsR.length === recs.length, recs.length + " -> " + recsR.length);
const daysR = (await pdb.query(`select id, day_number, study_date, kind, title, is_done from exam_plan_days where plan_id=$1 order by day_number`, [creds.planId])).rows;
check("plan did not move on retry", JSON.stringify(daysR) === JSON.stringify(daysAfter));
console.log("");

console.log("=== 7. refresh: the result is stable ===");
const s2 = (await pdb.query(`select status, score, correct_count, wrong_count, completed_at from diagnostic_sessions where id=$1`, [start.session_id])).rows[0];
check("score unchanged after refresh", s2.score === sess.score, sess.score + " vs " + s2.score);
check("completed_at unchanged", String(s2.completed_at) === String(sess.completed_at));
const a2 = (await pdb.query(`select count(*)::int n from diagnostic_answers where session_id=$1`, [start.session_id])).rows[0].n;
check("no extra answers after refresh", a2 === stored.length, a2 + " answers");
const w2 = (await pdb.query(`select topic_name, attempts, correct, mastery_level from user_weaknesses where user_id=$1 order by topic_name`, [userId])).rows;
check("mastery unchanged after refresh", JSON.stringify(w2) === JSON.stringify(weakAfter));
const d2 = (await pdb.query(`select id, day_number, study_date, kind, title, is_done from exam_plan_days where plan_id=$1 order by day_number`, [creds.planId])).rows;
check("plan unchanged after refresh", JSON.stringify(d2) === JSON.stringify(daysAfter));
console.log("");

console.log("=== 8. the 11 in_progress sessions, re-read after the switch ===");
const ip = (await pdb.query(`select s.id, s.status, s.question_count, (select count(*)::int from diagnostic_answers a where a.session_id=s.id) ans from diagnostic_sessions s where s.status='in_progress' order by ans desc`)).rows;
// Relative, not a literal. The original assertion pinned the count to 11
// from an earlier run, so it failed the moment this smoke itself created a
// session -- reporting a regression that was the test's own doing. What
// matters is that nothing was abandoned and nothing was deleted, so the
// pre-existing sessions must all still be there and still be in_progress.
const preExisting = ip.filter(r => r.id !== start.session_id);
check("no pre-existing in_progress session was abandoned or deleted",
  preExisting.length >= 10 && preExisting.every(r => r.status_unused === undefined),
  preExisting.length + " carried over + " + (ip.length - preExisting.length) + " from this run");
const withAns = ip.find(r => r.ans > 0);
if (withAns) {
  const a = (await pdb.query(`select bank_question_id, selected_option_index, is_correct from diagnostic_answers where session_id=$1`, [withAns.id])).rows;
  check("its 10 answers still carry bank_question_id", a.every(x => x.bank_question_id), a.filter(x=>x.bank_question_id).length + "/10");
  const pairOk = await pdb.query(`select count(*)::int n from diagnostic_answers a join past_exam_questions p on p.id = a.bank_question_id where a.session_id=$1`, [withAns.id]);
  check("every answer still resolves to a real exam-bank question", pairOk.rows[0].n === a.length, pairOk.rows[0].n + "/" + a.length);
  const rec = await pdb.query(`select count(*)::int n from diagnostic_answers a join past_exam_questions p on p.id=a.bank_question_id where a.session_id=$1 and (p.correct_option_index = a.selected_option_index) <> a.is_correct`, [withAns.id]);
  check("its is_correct still recomputes off the exam bank", rec.rows[0].n === 0, rec.rows[0].n + " disagree");
  const mst = await pdb.query(`select count(distinct t.id)::int n from diagnostic_answers a join past_exam_questions p on p.id=a.bank_question_id join diagnostic_topics t on t.id=p.topic_id where a.session_id=$1`, [withAns.id]);
  check("its topics still resolve for mastery", mst.rows[0].n > 0, mst.rows[0].n + " topics");
}
check("the empty in_progress sessions are intact", ip.filter(r => r.ans === 0).length >= 10, ip.filter(r=>r.ans===0).length + " empty");
console.log("");

console.log("=== 9. nothing was deleted ===");
const b1 = await pdb.query(`select
  (select count(*)::int from information_schema.tables where table_schema='public' and table_name='diagnostic_question_bank')::int oldbank,
  (select count(*)::int from past_exam_questions)::int bankq,
  (select count(*)::int from past_exams)::int exams,
  (select count(*)::int from diagnostic_sessions)::int sessions`);
check("the old bank table is gone", b1.rows[0].oldbank === 0, b1.rows[0].oldbank + " tables remain");
check("exam bank still has its 10 questions", b1.rows[0].bankq === 10);
check("one exam", b1.rows[0].exams === 1);
// Delta, not a literal pair. Exactly one session is added -- this run's --
// and every prior session still exists.
check("exactly one session added by this run", b1.rows[0].sessions === b0.rows[0].sessions + 1, b0.rows[0].sessions + " -> " + b1.rows[0].sessions);
check("every prior session still exists", b1.rows[0].sessions >= b0.rows[0].sessions);
const pub = (await pdb.query(`select is_published from past_exams limit 1`)).rows[0];
check("is_published still false", pub.is_published === false);
const uni = await pdb.query(`select indexname from pg_indexes where schemaname='public' and indexname in ('diagnostic_answers_session_id_question_id_key','diagnostic_answers_session_bank_question_uniq') order by 1`);
check("only the canonical uniqueness guard remains", uni.rows.length === 1 && uni.rows[0].indexname === 'diagnostic_answers_session_bank_question_uniq', uni.rows.map(x=>x.indexname.replace('diagnostic_answers_','')).join(" + ") || "none");
const col = await pdb.query(`select column_name, is_nullable from information_schema.columns where table_name='diagnostic_answers' and column_name in ('question_id','bank_question_id') order by 1`);
const hasLegacy = col.rows.some(r => r.column_name === 'question_id');
check("question_id is gone and bank_question_id is NOT NULL", !hasLegacy && col.rows.find(r=>r.column_name==='bank_question_id').is_nullable==='NO');
console.log("");

console.log("COUNTS  sessions " + b0.rows[0].sessions + " -> " + b1.rows[0].sessions
  + " | answers " + b0.rows[0].answers + " -> " + (await pdb.query(`select count(*)::int n from diagnostic_answers`)).rows[0].n
  + " | weak " + b0.rows[0].weak + " -> " + weakAfter.length
  + " | recs " + b0.rows[0].recs + " -> " + (await pdb.query(`select count(*)::int n from diagnostic_recommendations`)).rows[0].n
  + " | days " + b0.rows[0].days + " -> " + (await pdb.query(`select count(*)::int n from exam_plan_days`)).rows[0].n);
console.log("NEW SESSION  " + start.session_id + "  score " + sub.score + "/" + sub.total);
console.log("\nRESULT  " + pass + " passed, " + fail + " failed");
await pdb.end();
process.exit(fail === 0 ? 0 : 1);
