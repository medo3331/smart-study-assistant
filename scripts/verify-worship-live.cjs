/**
 * Worship Coins E2E — REAL matrix, final architecture.
 *
 * Session strategy for this project (verified live):
 *   • Email confirmation is ON and project SMTP is the built-in sandbox →
 *     real inboxes never receive mail; signup returns user row but no session.
 *   • Anonymous sign-ins are ENABLED (`external.anonymous_users: true`) and
 *     produce a REAL `authenticated`-role JWT session.
 *   • The economy deliberately blocks anonymous users from earning
 *     (`is_anonymous` gate) — that is the documented guest policy.
 *
 * Therefore the strongest executable E2E without DB credentials:
 *   1. Prove the guest gate blocks rewards (PART 17) — executed.
 *   2. Execute the full authenticated matrix against a LOCAL emulation of
 *      the exact production SQL from db/worship.sql? NO — that would not be
 *      the real database.
 *
 * This script therefore runs the REAL-database checks that are possible
 * (guest protection, RPC presence, rules table state) and reports the rest
 * as NOT-EXECUTABLE with the precise blocker.
 */
const _crypto = require("crypto");
void _crypto;
const fs = require("fs");
const path = require("path");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function authHeaders(token) {
  return {
    apikey: ANON,
    Authorization: "Bearer " + (token || ANON),
    "Content-Type": "application/json",
  };
}

async function rpc(token, fn, body) {
  body = body || {};
  const res = await fetch(BASE + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch (_e) { void _e; data = null; }
  return { status: res.status, ok: res.ok, data };
}

(async () => {
  const results = [];
  const log = (name, pass, detail) => {
    results.push({ name, pass });
    console.log((pass ? "PASS" : "FAIL") + " — " + name + (detail ? " (" + detail + ")" : ""));
  };

  // Real anonymous session (authenticated role).
  const s = await fetch(BASE + "/auth/v1/signup", { method: "POST", headers: authHeaders(), body: "{}" })
    .then((r) => r.json());
  if (!s.access_token) {
    log("obtain session", false, JSON.stringify(s).slice(0, 90));
    process.exit(1);
  }
  const T = s.access_token;

  /* PART 17 — GUEST PROTECTION (real database, real session) */
  const g1 = await rpc(T, "award_coins", {
    p_source: "worship_prayer", p_ref_id: "2026-08-26-fajr",
    p_metadata: { activity: "prayer", prayer: "fajr", date: "2026-08-26" },
  });
  log(
    "GUEST: award_coins(worship_prayer) rejected",
    !g1.ok && /زائر/.test(JSON.stringify(g1.data)),
    String(JSON.stringify(g1.data)).slice(0, 70),
  );

  const g2 = await rpc(T, "coin_balance");
  log("GUEST: coin_balance stays 0", g2.ok && (g2.data ?? -1) === 0, "balance=" + g2.data);

  /* PART 13/19 — RPC presence checks against the LIVE schema cache */
  const probe = await rpc(T, "upsert_worship_progress", {});
  log(
    "MIGRATION STATE: upsert_worship_progress present",
    false,
    probe.status === 404 ? "NOT APPLIED (PGRST202)" : "unexpected: " + probe.status,
  );
  const ap = await fetch(BASE + "/rest/v1/rpc/award_coins", {
    method: "POST", headers: authHeaders(T),
    body: JSON.stringify({ p_source: "worship_prayer", p_ref_id: "2026-08-26-fajr", p_metadata: {} }),
  });
  const apBody = String(await ap.text());
  const worshipBranchLive = /لازم تكون داخل بحسابك|الزائر/.test(apBody) && !/مش معروف|شغّال من غير تحقق/.test(apBody);
  log(
    "MIGRATION STATE: award_coins has worship_prayer branch",
    worshipBranchLive,
    apBody.slice(0, 80),
  );

  /* Ledger isolation sanity for the guest identity */
  const ledger = await fetch(BASE + "/rest/v1/coin_ledger?select=*&limit=5", {
    headers: authHeaders(T),
  }).then((r) => r.json());
  log("RLS: guest sees zero ledger rows", Array.isArray(ledger) && ledger.length === 0,
    "rows=" + (Array.isArray(ledger) ? ledger.length : "?"));

  const failed = results.filter((r) => !r.pass).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " executable checks passed");
  console.log("BLOCKED-CHECKS: full authenticated reward matrix needs either (a) migration applied + email confirmation OFF, or (b) DATABASE_URL/service key.");
})().catch((_e) => {
  void _e;
  console.error(_e.message);
  process.exit(1);
});
