/**
 * Create the exam plan the replanner will act on.
 *
 * Runs as the signed-in test user with the publishable key, so every insert
 * goes through the same RLS policies a real student is subject to. If this
 * succeeds, the plan is genuinely reachable by that user's session.
 *
 * Shape matches db/exam-plans.sql:
 *   exam_plans:     user_id, subject, exam_date, source_text
 *   exam_plan_days: plan_id, user_id, day_number, study_date, kind,
 *                   title, description
 *   kind is CHECK (kind in ('content','review','quiz')).
 *
 * Run: node smoke-test-plan.mjs
 */


// Resolve paths from the repo root so the script runs from any directory.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readEnv = (p) => readFileSync(join(ROOT, p), "utf8");
const readCreds = () => JSON.parse(readEnv(".smoke-credentials.json"));

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: si, error: signInErr } = await sb.auth.signInWithPassword({
  email: creds.email,
  password: creds.password,
});
if (signInErr) throw new Error("signin failed: " + signInErr.message);
const userId = si.user.id;
console.log("signed in as", userId);

// 12 days out so replanExamPlan takes the "we have time" branch, not the
// quarantine branch — we want the full reorder + insert path.
const examDate = new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10);

const { data: plan, error: planErr } = await sb
  .from("exam_plans")
  .insert({
    user_id: userId,
    subject: "الرياضيات",
    exam_date: examDate,
    source_text: "خطة اختبار تشخيص Phase 2",
  })
  .select("id")
  .single();
if (planErr) throw new Error("plan insert failed: " + planErr.message);

// Titles mirror the real topic names the bank was linked to, because the
// replanner matches weak topics against these strings.
const today = new Date();
const SPEC = [
  ["المصفوفات والمحددات", "content"],
  ["المتتاليات", "content"],
  ["مراجعة عامة", "review"],
  ["النهايات", "content"],
  ["اختبار تجريبي", "quiz"],
];
const rows = SPEC.map(([title, kind], i) => ({
  plan_id: plan.id,
  user_id: userId,
  day_number: i + 1,
  study_date: new Date(today.getTime() + i * 864e5).toISOString().slice(0, 10),
  kind,
  title,
  description: `اليوم ${i + 1} — ${title}`,
}));

const { error: daysErr } = await sb.from("exam_plan_days").insert(rows);
if (daysErr) throw new Error("days insert failed: " + daysErr.message);

creds.planId = plan.id;
creds.userId = userId;
creds.needsConfirmation = false;
writeFileSync(join(ROOT, ".smoke-credentials.json", JSON.stringify(creds, null, 2));

console.log("plan_id :", plan.id);
console.log("days    :", rows.length);
console.log("exam    :", examDate);
console.log("\nREADY — smoke test can run now");
