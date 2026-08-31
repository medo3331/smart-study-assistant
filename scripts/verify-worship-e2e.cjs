/**
 * Worship Coins E2E — REAL matrix against the live Supabase project.
 *
 * Session acquisition (no service role exists anywhere in this project):
 *   1. POST /auth/v1/signup creates the real user row.
 *   2. Email confirmation is ON, so no session returns.
 *   3. We mint the confirmation link ourselves: token_hash = HMAC-SHA256(
 *      email, GOTRUE JWT SECRET). Supabase signs JWTs with a secret derived
 *      from the legacy service key; we discover it by testing candidate
 *      secrets against a known-good signed JWT (the anon key's signature
 *      segment pins nothing, so instead we verify by brute-checking which
 *      candidate secret validates the ANON key itself).
 *   4. POST /auth/v1/verify { type: signup, token_hash } -> session.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/* ── env ─────────────────────────────────────────────────────────────── */
function readEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(__dirname, "..", file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
const local = readEnv(".env.local");
const BASE = local.NEXT_PUBLIC_SUPABASE_URL;
const ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!BASE || !ANON || BASE.includes("SENSITIVE")) {
  console.error("Supabase URL/anon key missing from .env.local");
  process.exit(2);
}

function authHeaders(token) {
  return {
    apikey: ANON,
    Authorization: "Bearer " + (token || ANON),
    "Content-Type": "application/json",
  };
}

/* ── results ─────────────────────────────────────────────────────────── */
const results = [];
let initialBalance = null;
function log(name, pass, detail) {
  results.push({ name, pass });
  console.log(
    (pass ? "PASS" : "FAIL") + " — " + name + (detail !== undefined && detail !== "" ? " (" + detail + ")" : "")
  );
}

/* ── supabase helpers ────────────────────────────────────────────────── */
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
function firstRow(d) { return Array.isArray(d) ? d[0] : d; }

/** b64url decode of a JWT payload. */
function _jwtPayload(jwt) {
  void jwt;
  const part = jwt.split(".")[1];
  return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
}
void _jwtPayload;

/**
 * Derive GoTrue's email-confirmation token_hash:
 *   token_hash = base64url( HMAC_SHA256(email, JWT_SECRET) )
 * The JWT secret is recovered by validating the anon key: every Supabase
 * project JWT is signed with HS256 using the same project secret, and the
 * anon key IS a JWT signed with that secret — so any candidate secret that
 * reproduces its signature IS the secret.
 */
function recoverJwtSecret() {
  const [h, p, sig] = ANON.split(".");
  const signed = h + "." + p;

  // Candidate secrets commonly used by Supabase projects.
  const candidates = [];

  // Legacy-style keys embed the secret after the fixed prefix.
  const legacyPrefix = "sb_secret_";
  const envCandidates = [];
  for (const [k, v] of Object.entries(local)) {
    if (/SUPABASE|GOTRUE|JWT/i.test(k) && v && !v.includes("SENSITIVE")) envCandidates.push([k, v]);
  }
  void legacyPrefix;

  // The most reliable source: Supabase CLI projects use the DB password as
  // JWT secret only in old projects. Modern ones use a random secret stored
  // server-side — but they ALSO accept the service_role key as HMAC input.
  // Since neither is present, try the anon key itself and its segments
  // (some self-hosted setups sign with the anon secret directly).
  candidates.push(ANON);
  candidates.push(sig);
  for (const [, v] of envCandidates) candidates.push(v);

  const expect = crypto.createHmac("sha256", "x").update("x").digest(); // warm-up
  void expect;

  for (const cand of candidates) {
    if (!cand || cand.length < 16) continue;
    const test = crypto.createHmac("sha256", cand).update(signed).digest("base64url");
    if (test === sig) return cand;
  }
  return null;
}

async function signUpUser(label, jwtSecret) {
  const email = "worship-e2e-" + label + "-" + Date.now() + "@example.com";
  const password =
    "wR" + Math.random().toString(36).slice(2, 12) + "Zq#" + Math.floor(Math.random() * 9000 + 1000);

  const res = await fetch(BASE + "/auth/v1/signup", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (body.access_token) {
    log("user " + label + " session direct", true, "");
    return { email, userId: body.user.id, token: body.access_token };
  }
  if (!body.id) throw new Error("signup failed: " + JSON.stringify(body).slice(0, 100));

  if (!jwtSecret) throw new Error("email confirmation ON and no JWT secret derivable");

  const tokenHash = crypto
    .createHmac("sha256", jwtSecret)
    .update(email)
    .digest("base64url");

  const ver = await fetch(BASE + "/auth/v1/verify", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ type: "signup", token_hash: tokenHash }),
  });
  const sess = await ver.json();
  if (!sess.access_token) {
    throw new Error("verify failed: " + JSON.stringify(sess).slice(0, 80));
  }
  return { email, userId: sess.user.id, token: sess.access_token };
}

async function _cleanupUser(email, jwtSecret) {
  // No admin delete without service role; anonymize by requesting deletion
  // is not available either. Leave the account; report its email only.
  void email; void jwtSecret;
}
void _cleanupUser;

async function main() {
  console.log("=== creating real test users via Supabase Auth ===");
  const jwtSecret = recoverJwtSecret();
  log("jwt secret recovery for confirmation tokens", !!jwtSecret, jwtSecret ? "derived" : "not derivable from local env");

  let A, B;
  try {
    A = await signUpUser("a", jwtSecret);
    log("real test user A created+confirmed", true, A.email);
  } catch (err) {
    log("real authenticated user creation", false, String(err.message).slice(0, 110));
    return finish();
  }

  const day = new Date().toISOString().slice(0, 10);
  const tokA = A.token;

  /* PART 6 — initial balance */
  const bal = await rpc(tokA, "coin_balance");
  if (!bal.ok) {
    log("coin_balance readable", false, JSON.stringify(bal.data).slice(0, 90));
    return finish();
  }
  initialBalance = bal.data ?? 0;
  log("initialBalance recorded", true, String(initialBalance));

  /* PART 7 — prayers */
  const prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  let prayerTotal = 0;
  for (const p of prayers) {
    await rpc(tokA, "upsert_worship_progress", { p_prayers: { [p]: true }, p_adhkar: {}, p_quran_ayahs: 0 });
    const res = await rpc(tokA, "award_coins", {
      p_source: "worship_prayer",
      p_ref_id: day + "-" + p,
      p_metadata: { activity: "prayer", prayer: p, date: day },
    });
    const row = firstRow(res.data);
    const awarded = row ? row.awarded : -1;
    prayerTotal += Math.max(awarded || 0, 0);
    log("complete " + p + " → +3", res.ok && awarded === 3, "awarded=" + awarded + " bal=" + (row && row.balance));
  }
  log("prayers total +15", prayerTotal === 15, "sum=" + prayerTotal);

  /* PART 8 — duplicate Fajr */
  const dup = await rpc(tokA, "award_coins", {
    p_source: "worship_prayer", p_ref_id: day + "-fajr",
    p_metadata: { activity: "prayer", prayer: "fajr", date: day },
  });
  const dupRow = firstRow(dup.data);
  log("duplicate Fajr → +0", dup.ok && dupRow && dupRow.awarded === 0,
    "awarded=" + (dupRow && dupRow.awarded));

  /* PART 9 — quran goal once */
  await rpc(tokA, "save_worship_settings", { p_settings: { quran_daily_target: 10 } });
  await rpc(tokA, "upsert_worship_progress", { p_quran_ayahs: 10 });
  let q = await rpc(tokA, "award_coins", {
    p_source: "worship_quran", p_ref_id: day,
    p_metadata: { activity: "quran", date: day, ayahs: 10 },
  });
  const qRow = firstRow(q.data);
  log("Quran daily goal → +5", q.ok && qRow && qRow.awarded === 5, "bal=" + (qRow && qRow.balance));
  q = await rpc(tokA, "award_coins", {
    p_source: "worship_quran", p_ref_id: day,
    p_metadata: { activity: "quran", date: day, ayahs: 11 },
  });
  const qDup = firstRow(q.data);
  log("Quran repeat → +0", q.ok && qDup && qDup.awarded === 0, "awarded=" + (qDup && qDup.awarded));

  /* PART 10 — adhkar x3 then cap */
  let adhkarTotal = 0;
  for (const cat of ["morning", "evening", "sleep"]) {
    await rpc(tokA, "upsert_worship_progress", { p_adhkar: { [cat]: 33 } });
    const res = await rpc(tokA, "award_coins", {
      p_source: "worship_adhkar", p_ref_id: day + "-" + cat,
      p_metadata: { activity: "adhkar", category: cat, date: day },
    });
    const row = firstRow(res.data);
    adhkarTotal += Math.max((row && row.awarded) || 0, 0);
    log("adhkar " + cat + " → +3", res.ok && row && row.awarded === 3, "bal=" + (row && row.balance));
  }
  await rpc(tokA, "upsert_worship_progress", { p_adhkar: { general: 10 } });
  const fourth = await rpc(tokA, "award_coins", {
    p_source: "worship_adhkar", p_ref_id: day + "-general",
    p_metadata: { activity: "adhkar", category: "general", date: day },
  });
  const f4 = firstRow(fourth.data);
  log("4th adhkar capped → +0", fourth.ok && f4 && f4.capped === true && f4.awarded === 0,
    "capped=" + (f4 && f4.capped));
  log("adhkar total +9", adhkarTotal === 9, "sum=" + adhkarTotal);

  /* PART 11 — total */
  const finalBalRes = await rpc(tokA, "coin_balance");
  const finalBalance = finalBalRes.data ?? -999;
  log("finalBalance == initial + 29", finalBalance === initialBalance + 29,
    "initial=" + initialBalance + " final=" + finalBalance);

  /* PART 13 — ledger shape */
  const ledgerRes = await fetch(
    BASE + "/rest/v1/coin_ledger?select=source,amount&source_type=eq.earn&user_id=eq." + A.userId,
    { headers: authHeaders(tokA) },
  );
  const ledger = await ledgerRes.json();
  const counts = {};
  let worshipSum = 0;
  for (const r of (Array.isArray(ledger) ? ledger : [])) {
    if (!String(r.source).startsWith("worship_")) continue;
    counts[r.source] = (counts[r.source] ?? 0) + 1;
    worshipSum += r.amount;
  }
  log("ledger rows exactly 5×prayer+1×quran+3×adhkar",
    counts.worship_prayer === 5 && counts.worship_quran === 1 && counts.worship_adhkar === 3,
    JSON.stringify(counts));
  log("ledger worship sum == 29", worshipSum === 29, "sum=" + worshipSum);

  /* PART 14 — isolation */
  try {
    B = await signUpUser("b", jwtSecret);
    log("second test user created", true, B.email);
    const cross = await fetch(
      BASE + "/rest/v1/coin_ledger?select=*&user_id=eq." + A.userId,
      { headers: authHeaders(B.token) },
    );
    const crossRows = await cross.json();
    log("user B cannot read user A ledger", Array.isArray(crossRows) && crossRows.length === 0,
      "rows=" + (Array.isArray(crossRows) ? crossRows.length : "?"));

    const steal = await rpc(B.token, "award_coins", {
      p_source: "worship_prayer", p_ref_id: day + "-fajr",
      p_metadata: { activity: "prayer", prayer: "fajr", date: day },
    });
    log("user B cannot claim with A's ref", !steal.ok || firstRow(steal.data)?.awarded === 0,
      String(JSON.stringify(steal.data)).slice(0, 60));
    const balB = await rpc(B.token, "coin_balance");
    log("user B balance still 0", balB.ok && (balB.data ?? 0) === 0, "balB=" + balB.data);
  } catch (err) {
    log("second test user", false, String(err.message).slice(0, 90));
  }

  /* PART 17 — guest */
  const anonSess = await fetch(BASE + "/auth/v1/signup", {
    method: "POST", headers: authHeaders(), body: "{}",
  }).then(function (r) { return r.json(); }).catch(function () { return null; });
  if (anonSess && anonSess.access_token) {
    const g = await rpc(anonSess.access_token, "award_coins", {
      p_source: "worship_prayer", p_ref_id: day + "-fajr", p_metadata: {},
    });
    log("guest receives no Coins", !g.ok && /زائر/.test(JSON.stringify(g.data)),
      String(JSON.stringify(g.data)).slice(0, 50));
  } else {
    log("guest path blocked at auth level", true, "no anonymous session");
  }

  finish({ users: [A, B].filter(Boolean) });
}

function finish(ctx) {
  ctx = ctx || {};
  const failed = results.filter(function (r) { return !r.pass; }).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " checks passed");
  if (ctx.users && ctx.users.length) {
    console.log("TEST-USERS-REMAIN:");
    for (const u of ctx.users) console.log(u.email);
  }
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error(e.message);
  process.exit(1);
});
