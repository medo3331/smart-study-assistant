/**
 * Confirm the smoke-test account, then sign in.
 *
 * Why a direct DB connection instead of service_role:
 *   • the project's own live-validation scripts (scripts/validate-*-live.mjs)
 *     already do exactly this to create test accounts;
 *   • DATABASE_URL is a postgres connection string, not an API key, so it
 *     cannot be replayed from a browser;
 *   • it keeps service_role out of .env.local and out of the frontend, which
 *     is where that key has no business being.
 *
 * Only one row is touched: email_confirmed_at for this one test user.
 *
 * Run: node smoke-test-confirm.mjs
 */


// Resolve paths from the repo root so the script runs from any directory.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readEnv = (p) => readFileSync(join(ROOT, p), "utf8");
const readCreds = () => JSON.parse(readEnv(".smoke-credentials.json"));

import pg from "pg";
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
if (!creds.needsConfirmation) {
  console.log("nothing to confirm — run smoke-test-setup.mjs first");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rows } = await client.query(
  "update auth.users set email_confirmed_at = now() where id = $1 returning id, email_confirmed_at",
  [creds.userId]
);
await client.end();
console.log("confirmed:", rows.length === 1);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await sb.auth.signInWithPassword({
  email: creds.email,
  password: creds.password,
});
if (error) throw new Error("signin failed: " + error.message);

console.log("signed in");
console.log("USER_ID :", data.user.id);
console.log("token   :", Boolean(data.session.access_token));
