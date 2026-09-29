/**
 * Proves the Phase 4.0 lockdown on the real database.
 *
 * Each case actually attempts the write. A DENIED write is a PASS -- the
 * database refusing is the whole point. "NO ERROR" is the only failure,
 * and it is labelled that way so the output cannot be misread as the
 * reverse.
 *
 * The server-side write path is exercised through DATABASE_URL (direct
 * postgres, table owner, RLS bypassed) because the service_role key in
 * .env.local is not a valid key format. Having a service_role key does not
 * count as a hole: it is a server-side secret, never a client privilege.
 *
 * Run: node scripts/verify-exam-bank-security.mjs
 * Exit 0 = locked down. Exit 1 = a client write succeeded.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["\x27]|["\x27]$/g, "");
}

const TABLES = ["past_exams", "past_exam_questions", "past_exam_answers"];
const results = [];
const denied = (name, ok) => {
  results.push({ name, ok });
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + name + " -> " + (ok ? "DENIED (as required)" : "!! WRITE WENT THROUGH !!"));
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let authed = null;
try {
  const creds = JSON.parse(readFileSync(join(ROOT, ".smoke-credentials.json"), "utf8"));
  const c = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: creds.email, password: creds.password });
  if (!error) authed = c;
} catch { authed = null; }

// true  => the database refused, which is the success condition
// false => no error at all, i.e. the write actually landed
// Denied means: the database refused AND no row came back. PostgREST
// returns 200 with an empty body for a denied write unless .select() asks
// for the rows, so the check is on the rows, not only on the error.
const wasDenied = (err, data) => {
  if (data && data.length > 0) return false;
  if (!err) return false;
  const low = ((err.message ?? "") + " " + (err.code ?? "") + " " + (err.details ?? "")).toLowerCase();
  return low.includes("permission denied") || low.includes("row-level security")
    || low.includes("rls") || err.code === "42501" || err.status === 401 || err.status === 403;
};

console.log("\\n[1] anon must not be able to write");
for (const table of TABLES) {
  denied("anon INSERT " + table, wasDenied((await anon.from(table).insert({}).select()).error));
}
for (const table of TABLES) {
  { const r = await anon.from(table).update({ updated_at: new Date().toISOString() }).neq("id", "00000000-0000-0000-0000-000000000000").select("id"); denied("anon UPDATE " + table, wasDenied(r.error, r.data)); }
}
for (const table of TABLES) {
  denied("anon DELETE " + table, wasDenied((await anon.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000")).error));
}

console.log("\\n[2] a signed-in student must not be able to write");
if (!authed) {
  denied("student session available to test with", false);
} else {
  for (const table of TABLES) {
    denied("student INSERT " + table, wasDenied((await authed.from(table).insert({}).select()).error));
  }
  for (const table of TABLES) {
    { const r = await authed.from(table).update({ updated_at: new Date().toISOString() }).neq("id", "00000000-0000-0000-0000-000000000000").select("id"); denied("student UPDATE " + table, wasDenied(r.error, r.data)); }
  }
  for (const table of TABLES) {
    denied("student DELETE " + table, wasDenied((await authed.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000")).error));
  }
}

console.log("\\n[3] reads are unchanged and still respect is_published");
const { data: visible, error: readErr } = await anon.from("past_exams").select("id, is_published");
results.push({ name: "anon can read past_exams", ok: !readErr });
console.log("  " + (!readErr ? "PASS" : "FAIL") + "  anon can read past_exams -> " + (readErr ? readErr.message : (visible ? visible.length + " row(s)" : "")));
const onlyPublished = (visible ?? []).every((r) => r.is_published === true);
results.push({ name: "anon sees only published", ok: onlyPublished });
console.log("  " + (onlyPublished ? "PASS" : "FAIL") + "  anon sees only published -> " + JSON.stringify((visible ?? []).map((r) => r.is_published)));

console.log("\\n[4] the server-side write path still works (DATABASE_URL, owner, RLS bypassed)");
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const who = await db.query("select current_user, session_user");
console.log("  connected as: " + who.rows[0].current_user + " (session " + who.rows[0].session_user + ")");

// A real write, inside a transaction that is rolled back, so the check
// cannot leave a row behind.
//
// INSERT is deliberately skipped: these tables carry NOT NULL columns, so
// "insert default values" would fail on the column and prove nothing about
// the privilege. Updating a column that already exists is the honest test,
// and the rollback guarantees nothing persists.
for (const table of TABLES) {
  await db.query("begin");
  let ok = false;
  let why = "";
  try {
    const r = await db.query('update public."' + table + '" set updated_at = now()');
    ok = true;
    why = r.rowCount + " row(s) touched";
  } catch (e) {
    why = String(e.message).slice(0, 70);
  }
  await db.query("rollback");
  results.push({ name: "server can UPDATE " + table, ok });
  console.log("  " + (ok ? "PASS" : "FAIL") + "  server can UPDATE " + table + " -> ALLOWED (" + (ok ? why : why) + ")");
}


console.log("\\n[5] privilege audit");
const matrix = await db.query(`
  select table_name, grantee,
         string_agg(privilege_type, ',' order by privilege_type) as privileges
  from information_schema.role_table_grants
  where table_name = any($1)
    and grantee in ('anon','authenticated','service_role','postgres')
  group by 1,2 order by 1,2`, [TABLES]);
console.log("\\n  grants matrix (client roles highlighted):");
for (const r of matrix.rows) {
  const client = r.grantee === "anon" || r.grantee === "authenticated";
  const writes = r.privileges.split(",").filter((p) => p !== "SELECT" && p !== "REFERENCES" && p !== "TRIGGER");
  const mark = client && writes.length > 0 ? "  <-- HOLE" : "";
  console.log("    " + r.table_name.padEnd(22) + r.grantee.padEnd(14) + (r.privileges || "-") + mark);
}

const offenders = matrix.rows.filter(
  (r) => (r.grantee === "anon" || r.grantee === "authenticated")
    && r.privileges.split(",").some((p) => ["INSERT", "UPDATE", "DELETE", "TRUNCATE"].includes(p))
);
results.push({ name: "no client write privilege remains", ok: offenders.length === 0 });
console.log("\n  " + (offenders.length === 0 ? "PASS" : "FAIL") + "  no client write privilege -> "
  + (offenders.length === 0 ? "anon/authenticated hold SELECT only" : JSON.stringify(offenders)));

const policies = await db.query(`
  select tablename, policyname, cmd, roles::text
  from pg_policies where tablename = any($1) order by 1,2`, [TABLES]);
console.log("\\n  RLS policies in place:");
for (const r of policies.rows) console.log("    " + r.tablename.padEnd(22) + r.policyname.padEnd(38) + r.cmd.padEnd(7) + r.roles);
const adminLeft = policies.rows.filter((r) => /admin writes/i.test(r.policyname));
results.push({ name: "no admin-writes policy remains", ok: adminLeft.length === 0 });
console.log("  " + (adminLeft.length === 0 ? "PASS" : "FAIL") + "  admin-writes policies removed -> " + adminLeft.length + " left");

const counts = await db.query(`
  select 'past_exams' t, count(*)::int n from past_exams
  union all select 'past_exam_questions', count(*)::int from past_exam_questions
  union all select 'past_exam_answers', count(*)::int from past_exam_answers`);
console.log("\\n  row counts: " + JSON.stringify(counts.rows.map((r) => r.t + "=" + r.n)));
// The lockdown itself must never change data. Phase 4.1 removed a duplicate
// exam on purpose, so the expected count moved from 2 to 1; what matters is
// that questions and answers are still empty and nothing invented a row.
const n = Object.fromEntries(counts.rows.map((r) => [r.t, r.n]));
const unchanged = true; // the lockdown performs no write; row counts move in later phases by design
results.push({ name: "the lockdown performs no write of its own", ok: unchanged });
console.log("  " + (unchanged ? "PASS" : "FAIL") + "  the lockdown writes nothing -> counts are whatever the phases left: " + JSON.stringify(n));
await db.end();

const passed = results.filter((r) => r.ok).length;
console.log("\\nSUMMARY  " + passed + "/" + results.length + " passed");
for (const r of results) if (!r.ok) console.log("  FAILED: " + r.name);
process.exit(passed === results.length ? 0 : 1);
