/**
 * Smoke-test data setup — uses the PUBLISHABLE key only.
 *
 * ❗ No service_role, no admin API, no secrets. This signs up exactly the
 *    way a real student does, then logs in, so the smoke test exercises the
 *    production path rather than a privileged back door.
 *
 * Run: node smoke-test-setup.mjs
 * The password is written to a gitignored file, never printed to the chat.
 */


// Resolve paths from the repo root so the script runs from any directory.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readEnv = (p) => readFileSync(join(ROOT, p), "utf8");
const readCreds = () => JSON.parse(readEnv(".smoke-credentials.json"));

import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");

// This client has exactly the permissions a signed-out visitor has.
const sb = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now().toString(36);
const EMAIL = `diag.smoke.${stamp}@magiclly.test`;
const PASSWORD = `Sm-${randomBytes(12).toString("base64url")}!`;

// 1) Sign up through the public API — same call /register makes.
const { data: signUp, error: signUpErr } = await sb.auth.signUp({
  email: EMAIL,
  password: PASSWORD,
});
if (signUpErr) throw new Error("signup failed: " + signUpErr.message);

// Some projects require email confirmation before the session is usable.
let session = signUp.session;

if (!session) {
  const { data: signIn, error: signInErr } = await sb.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInErr) {
  // Email confirmation is required by this project. Persist what we know so
  // the confirm step can finish the job, then stop with a clear instruction
  // rather than a stack trace.
  writeFileSync(
    ".smoke-credentials.json",
    JSON.stringify({ email: EMAIL, password: PASSWORD, userId: signUp.user?.id, needsConfirmation: true }, null, 2)
  );
  console.log("ACCOUNT CREATED — email confirmation required");
  console.log("EMAIL   :", EMAIL);
  console.log("USER_ID :", signUp.user?.id ?? "(see below)");
  console.log("PASSWORD: written to .smoke-credentials.json");
  process.exit(0);
}
  session = signIn.session;
}

const userId = session.user.id;
console.log("user created + signed in");
console.log("userId:", userId);
console.log("session token acquired:", Boolean(session.access_token));

// 2) The exam plan. Shape matches db/exam-plans.sql exactly:
//      exam_plans:      user_id, subject, exam_date, source_text, is_archived
//      exam_plan_days:  plan_id, user_id, day_number, study_date, kind,
//                       title, description, is_done
//    kind is constrained to (content, review, quiz).
//    exam_date is 12 days out so replanExamPlan takes the "we have time"
//    branch rather than the quarantine branch.
//
//    Titles include real topic names on purpose: the replanner matches the
//    weak topics against these strings, so they have to line up with the
//    seven topics the bank was linked to.
const DAYS = 12;
const examDate = new Date(Date.now() + DAYS * 864e5).toISOString().slice(0, 10);

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

const today = new Date();
const dayRows = [
  ["المصفوفات والمحددات", "content"],
  ["المتتاليات", "content"],
  ["مراجعة عامة", "review"],
  ["النهايات", "content"],
  ["اختبار تجريبي", "quiz"],
].map(([title, kind], i) => ({
  plan_id: plan.id,
  user_id: userId,
  day_number: i + 1,
  study_date: new Date(today.getTime() + i * 864e5).toISOString().slice(0, 10),
  kind,
  title,
  description: `اليوم ${i + 1} — ${title}`,
  is_done: false,
}));

const { error: daysErr } = await sb.from("exam_plan_days").insert(dayRows);
if (daysErr) throw new Error("days insert failed: " + daysErr.message);
console.log("plan + days created:", plan.id, `(${dayRows.length} days)`);

// 3) Credentials to a gitignored file — never printed, never committed.
writeFileSync(
  ".smoke-credentials.json",
  JSON.stringify({ email: EMAIL, password: PASSWORD, userId, planId: plan.id }, null, 2)
);
console.log("credentials written to .smoke-credentials.json");

console.log("\n=== READY FOR SMOKE TEST ===");
console.log("EMAIL   :", EMAIL);
console.log("USER_ID :", userId);
console.log("PLAN_ID :", plan.id);
console.log("SUBJECT : 6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec");
console.log("\n(password is in .smoke-credentials.json, not printed)");
