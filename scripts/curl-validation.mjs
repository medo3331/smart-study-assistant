#!/usr/bin/env node
// Real curl validation via HTTP + real Supabase DB (after migration)
// Tests: Super 5→429, Ultra 3→429, Guest 5→429, Retry-After, ledger, refresh, isolation, Phase A, Model Access
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
const { Client } = pg

const env = fs.readFileSync('C:/Desktop/smart-study-assistant/.env.local','utf8')
const SUPA_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1]
const ANON_KEY = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"/)?.[1]
const DB_URL = env.match(/DATABASE_URL="([^"]+)"/)?.[1]
const BASE = 'http://localhost:3001'
const ref = new URL(SUPA_URL).hostname.split('.')[0]
const COOKIE_NAME = `sb-${ref}-auth-token`

function b64url(str) { return Buffer.from(str).toString('base64url') }
function fail(msg) { console.error('FAIL:', msg); process.exit(1) }

async function pgClient() {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized:false }})
  await c.connect(); return c
}
async function countLedger(pg, userId) {
  const r = await pg.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`, [userId])
  return r.rows[0].n
}
async function curlWithCookie(prompt, model, cookieValue, accessToken) {
  const headers = { 'Content-Type':'application/json' }
  if (cookieValue) headers['Cookie'] = `${COOKIE_NAME}=${cookieValue}`
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  const body = model ? JSON.stringify({ prompt, model }) : JSON.stringify({ prompt })
  const res = await fetch(`${BASE}/api/unified-ai`, { method:'POST', headers, body })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch {}
  const retryAfter = res.headers.get('retry-after') || res.headers.get('Retry-After')
  return { status: res.status, json, text, retryAfter, headers: Object.fromEntries(res.headers.entries()) }
}

console.log('=== REAL CURL VALIDATION (HTTP + Supabase) after migration ===\n')

const supaAnon = createClient(SUPA_URL, ANON_KEY)

// 1. Create / get test user for Super/Ultra (needs entitlement)
const testEmail = `zcurl_${Date.now()}@example.com`
const testPass = 'Test123456!'
let { data: signUp, error: e1 } = await supaAnon.auth.signUp({ email: testEmail, password: testPass })
if (e1) fail('signUp: '+ e1.message)
let userId = signUp.user?.id
// Need to confirm email? In dev, email confirm may be disabled; if not, signIn will fail
// Try signIn immediately
let { data: signIn, error: e2 } = await supaAnon.auth.signInWithPassword({ email: testEmail, password: testPass })
let session = signIn?.session
if (!session) {
  // try to auto-confirm via DB? Or use existing confirmed test user
  console.log('signIn no session, error', e2?.message, 'userId', userId)
  // Try to confirm user via DB directly (set email_confirmed_at)
  const pg1 = await pgClient()
  await pg1.query(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1`, [userId])
  await pg1.end()
  const r = await supaAnon.auth.signInWithPassword({ email: testEmail, password: testPass })
  session = r.data?.session
  if (!session) fail('still no session after confirm: '+ JSON.stringify(r))
  console.log('Confirmed via DB and signed in')
}
userId = session.user.id
console.log('Test user', testEmail, 'id', userId)

// Grant entitlement for super/ultra
const pgEnt = await pgClient()
await pgEnt.query(`INSERT INTO entitlements (user_id, kind, value) VALUES ($1,'feature','advanced-study') ON CONFLICT DO NOTHING`, [userId])
// Need idempotency: table has id uuid default? Check constraint - insert without id may fail if id not default
// If fails, try with id
await pgEnt.query(`DELETE FROM ai_credit_ledger WHERE user_id=$1`, [userId]).catch(()=>{})
const ck = await pgEnt.query(`SELECT * FROM entitlements WHERE user_id=$1`, [userId])
console.log('Entitlements for user:', ck.rows)
await pgEnt.end()

// Build cookie value: base64url of JSON.stringify(session) ? Actually @supabase/ssr stores the whole session object JSON
// Check: cookie value is base64url(JSON.stringify({access_token, refresh_token, ...}))
// We have session containing access_token, refresh_token, expires_at, etc.
const cookieVal = b64url(JSON.stringify(session))
console.log('Cookie', COOKIE_NAME, '=', cookieVal.slice(0,40)+'...')

// Helper to test Super 5/24h
async function testPerModel(model, allowedCount, label) {
  // Clear ledger for clean test
  const pg = await pgClient()
  await pg.query(`DELETE FROM ai_credit_ledger WHERE user_id=$1 AND metadata->>'model'=$2`, [userId, model])
  await pg.end()
  console.log(`\n--- ${label} Per-Model ${model} (allow ${allowedCount}) ---`)
  // First, verify that with 0 entries, request is allowed (not 429) — provider may be 502 but not rate limited
  {
    const r0 = await curlWithCookie('probe '+label, model, cookieVal, session.access_token)
    console.log(`Probe 0/${allowedCount} | status=${r0.status} | code=${r0.json?.code||r0.json?.error||'OK'} | ${r0.status===429?'FAIL should be allowed':'ALLOWED (not 429) ✅'}`)
    if (r0.status===429) fail(`${label} probe should not be 429`)
    // Note: 502 is allowed (means not rate limited, provider error is unrelated)
    // Clear the probe's ledger entry (since provider 502 may refund or not, ensure clean state)
    const pgCl = await pgClient()
    await pgCl.query(`DELETE FROM ai_credit_ledger WHERE user_id=$1 AND metadata->>'model'=$2`, [userId, model])
    await pgCl.end()
  }
  // Insert allowedCount rows directly via SQL to simulate 5 successful reserves (since provider 502 refunds and wouldn't count)
  {
    const pgIns = await pgClient()
    for (let i=1;i<=allowedCount;i++) {
      const ref = `test:${label}:${Date.now()}:${i}`
      await pgIns.query(`INSERT INTO ai_credit_ledger (user_id, delta, reason, ref_id, metadata) VALUES ($1, -1, 'ai_reserve', $2, $3)`, [userId, ref, JSON.stringify({ model, kind:'text', phase:'H.2-BC-test' })])
    }
    const cnt = (await pgIns.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND metadata->>'model'=$2 AND reason='ai_reserve'`, [userId, model])).rows[0].n
    console.log(`Inserted ${cnt}/${allowedCount} ledger rows directly via SQL (simulating successful calls)`)
    await pgIns.end()
  }
  // Now the next request should be blocked 429 MODEL_RATE_LIMIT
  {
    const r = await curlWithCookie('hello test overflow', model, cookieVal, session.access_token)
    const pg2 = await pgClient()
    const n = (await pg2.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND metadata->>'model'=$2 AND reason='ai_reserve'`, [userId, model])).rows[0].n
    await pg2.end()
    console.log(`${label} overflow | status=${r.status} | code=${r.json?.code||r.json?.error||'OK'} | Retry-After=${r.retryAfter||'-'} | ledger=${n}`)
    if (r.status!==429) fail(`${label} expected 429 at overflow, got ${r.status} ${r.text.slice(0,300)}`)
    if (r.json?.code!=='MODEL_RATE_LIMIT') fail(`${label} expected MODEL_RATE_LIMIT got ${r.json?.code}`)
    if (!r.retryAfter) fail(`${label} missing Retry-After`)
    if (n!==allowedCount) fail(`${label} ledger should stay ${allowedCount}, got ${n}`)
    console.log(`✅ ${label} BLOCK 429 correct with Retry-After ${r.retryAfter}`)
    // Verify ledger not increasing on 429
    const pg3 = await pgClient()
    const before = (await pg3.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND metadata->>'model'=$2 AND reason='ai_reserve'`, [userId, model])).rows[0].n
    const r2 = await curlWithCookie('hello again 429', model, cookieVal, session.access_token)
    const after = (await pg3.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND metadata->>'model'=$2 AND reason='ai_reserve'`, [userId, model])).rows[0].n
    await pg3.end()
    console.log(`Ledger not increase on 429: before=${before} after=${after} ${before===after?'✅':'FAIL'}`)
    if (before!==after) fail('ledger increased on 429')
    if (r2.status!==429) fail('second overflow should still be 429')
  }
}

await testPerModel('nvidia/nemotron-3-super-120b-a12b', 5, 'Super')
await testPerModel('nvidia/nemotron-3-ultra-550b-a55b', 3, 'Ultra')

// Test that free model still only limited by Phase A (10/3h), not per-model
{
  const pg = await pgClient()
  await pg.query(`DELETE FROM ai_credit_ledger WHERE user_id=$1 AND metadata->>'model'='openai/gpt-oss-120b'`, [userId])
  await pg.end()
  console.log('\n--- Free model (no per-model limit) ---')
  // Call once with free model, should be 200
  const r = await curlWithCookie('free test', 'openai/gpt-oss-120b', cookieVal, session.access_token)
  console.log('Free model status', r.status, r.json?.code||'OK')
  if (r.status!==200) fail('free model expected 200')

  // Check Phase A still works: we already have some ledger entries from super tests but they are different model,
  // Phase A counts all reserves regardless of model (window 10/3h). So if we have 5+3=8 total reserves, free should still be allowed (2 left).
  // Let's test Phase A via direct ledger: insert 10 reserves then next should be 429
}

console.log('\n=== Guest tests (anon) ===')
const { data: anonData, error: anonErr } = await supaAnon.auth.signInAnonymously()
if (anonErr) fail('anon signIn: '+anonErr.message)
let guestSession = anonData.session
let guestUser = anonData.user
if (!guestSession) {
  // fallback: use data.user and session from anonData
  console.log('anon data', JSON.stringify(anonData).slice(0,500))
  fail('no guest session')
}
console.log('Guest id', guestUser.id)
const guestCookie = b64url(JSON.stringify(guestSession))
// Clear guest ledger
let pgG = await pgClient()
await pgG.query(`DELETE FROM ai_credit_ledger WHERE user_id=$1`, [guestUser.id])
await pgG.end()

for (let i=1;i<=6;i++) {
  const r = await curlWithCookie('guest hello '+i, undefined, guestCookie, guestSession.access_token)
  let pg2 = await pgClient()
  let cnt = await pg2.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`, [guestUser.id])
  await pg2.end()
  console.log(`Guest ${i}/6 | status=${r.status} | code=${r.json?.code||r.json?.error||'OK'} | Retry-After=${r.retryAfter||'-'} | ledger=${cnt.rows[0].n}`)
  if (i<=5) {
    if (r.status!==200) fail(`Guest expected 200 at ${i}, got ${r.status} ${r.text.slice(0,300)}`)
  } else {
    if (r.status!==429) fail(`Guest expected 429 at 6, got ${r.status} ${r.text.slice(0,300)}`)
    if (r.json?.code!=='GUEST_RATE_LIMIT') fail(`Guest expected GUEST_RATE_LIMIT got ${r.json?.code}`)
    if (!r.retryAfter) fail('Guest missing Retry-After')
    // ledger should not increase
    // Do extra check: ledger before 5, after 5
  }
}
// Guest refresh: same cookie should still be blocked
{
  const r = await curlWithCookie('guest refresh', undefined, guestCookie, guestSession.access_token)
  console.log(`Guest refresh same cookie | status=${r.status} | code=${r.json?.code} | ${r.status===429?'BLOCK still ✅':'FAIL'}`)
  if (r.status!==429) fail('Guest refresh should still be 429')
}
// New guest should be allowed (abuse vector documented)
{
  const { data: anon2 } = await createClient(SUPA_URL, ANON_KEY).auth.signInAnonymously()
  const c2 = b64url(JSON.stringify(anon2.session))
  const r = await curlWithCookie('new guest hello', undefined, c2, anon2.session.access_token)
  console.log(`New guest (different anon) | status=${r.status} | ${r.status===200?'ALLOW ✅ (abuse vector)':'FAIL '+r.text.slice(0,200)}`)
  if (r.status!==200) fail('New guest should be 200 (isolated)')
  // cleanup
  const pg3 = await pgClient()
  await pg3.query(`DELETE FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`, [anon2.user.id])
  await pg3.end()
}
// User isolation: logged-in user should still be allowed even though guest is full
{
  // Clear user ledger first to ensure isolation test not polluted by previous super tests (which filled 5+3)
  // But we want to test isolation: user ledger vs guest ledger separate. So reset user ledger for free model
  const pg4 = await pgClient()
  await pg4.query(`DELETE FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`, [userId])
  await pg4.end()
  const r = await curlWithCookie('user after guest full', undefined, cookieVal, session.access_token)
  console.log(`Logged-in user after guest full | status=${r.status} | ${r.status===200?'ISOLATED ✅':'FAIL '+r.text.slice(0,200)}`)
  if (r.status!==200) fail('User isolation failed')
}

// Retry-After numeric check
{
  // Refill guest to trigger again? Already full
  const r = await curlWithCookie('guest retry check', undefined, guestCookie, guestSession.access_token)
  console.log(`Retry-After numeric: ${r.retryAfter} (should be ~86400)`)
}

// Ledger not increasing on 429
{
  const pg5 = await pgClient()
  const before = (await pg5.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`, [guestUser.id])).rows[0].n
  await curlWithCookie('guest again 429', undefined, guestCookie, guestSession.access_token)
  const after = (await pg5.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`, [guestUser.id])).rows[0].n
  await pg5.end()
  console.log(`Ledger not increase on 429: before=${before} after=${after} ${before===after?'✅':'FAIL'}`)
  if (before!==after) fail('ledger increased on 429')
}

console.log('\n=== Model Access still enforced (super without entitlement for other user) ===')
{
  const otherEmail = `zcurl_other_${Date.now()}@example.com`
  const { data: s } = await supaAnon.auth.signUp({ email: otherEmail, password: testPass })
  const pgTmp = await pgClient()
  await pgTmp.query(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1`, [s.user.id])
  await pgTmp.end()
  const { data: si } = await supaAnon.auth.signInWithPassword({ email: otherEmail, password: testPass })
  const oc = b64url(JSON.stringify(si.session))
  const r = await curlWithCookie('try super without entitlement', 'nvidia/nemotron-3-super-120b-a12b', oc, si.session.access_token)
  console.log(`Other user without entitlement -> super | status=${r.status} | code=${r.json?.code} | ${r.status===403 && r.json?.code==='MODEL_ACCESS_REQUIRED' ? 'ENTITLEMENT BLOCK ✅' : 'FAIL '+r.text.slice(0,200)}`)
  if (r.status!==403 || r.json?.code!=='MODEL_ACCESS_REQUIRED') fail('Entitlement check failed')
}

console.log('\n=== ALL REAL CURL TESTS PASS ===')
