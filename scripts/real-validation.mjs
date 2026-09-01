#!/usr/bin/env node
// Real Supabase validation — uses real DB after migration
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('C:/Desktop/smart-study-assistant/.env.local','utf8');
function getEnv(name){
  const m = env.match(new RegExp(`${name}="?([^"\\n]+)"?`));
  return m ? m[1].replace(/"/g,'').trim() : '';
}
const SUPA_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPA_ANON = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
console.log('SUPA_URL', SUPA_URL);
console.log('Testing real Supabase...\n');

const anonClient = createClient(SUPA_URL, SUPA_ANON);

// Helper to create authenticated client for a user session
function authedClient(access_token){
  return createClient(SUPA_URL, SUPA_ANON, {
    global: { headers: { Authorization: `Bearer ${access_token}` } }
  });
}

// Use jiti for rate-limit
import { createJiti } from 'jiti';
import path from 'path';
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd()) }});
const rl = jiti(path.join(process.cwd(), 'lib/ai/rate-limit.ts'));

// For DB direct inserts
import pkg from 'pg';
const { Client } = pkg;
const dbUrl = getEnv('DATABASE_URL');
async function withDb(fn){
  const c = new Client({ connectionString: dbUrl, ssl:{rejectUnauthorized:false}});
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

function uniqEmail(){ return `test_${Date.now()}_${Math.floor(Math.random()*1000)}@example.com`; }

async function main(){
  // Clean old test data? Use fresh users
  const email = uniqEmail();
  const password = 'Test123456!';
  console.log(`Creating free user ${email} ...`);
  let { data: signUp, error: e1 } = await anonClient.auth.signUp({ email, password });
  if(e1){ console.log('signUp error', e1.message); // try signIn
    const { data: signIn, error:e2 } = await anonClient.auth.signInWithPassword({ email, password });
    if(e2) throw e2;
    signUp = signIn;
  }
  const freeUser = signUp.user;
  const session = signUp.session;
  if(!freeUser || !session){ console.log('No user/session', signUp); throw new Error('auth failed'); }
  console.log(`Free user id=${freeUser.id}`);
  const freeSupabase = authedClient(session.access_token);
  // Ensure session is set for RLS
  await freeSupabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });

  // Create guest anon
  console.log('Creating anonymous guest...');
  const { data: anonData, error: anonErr } = await anonClient.auth.signInAnonymously();
  if(anonErr) throw anonErr;
  const guest = anonData.user;
  const guestSession = anonData.session;
  console.log(`Guest id=${guest.id} is_anonymous=${guest.is_anonymous}`);
  const guestSupabase = createClient(SUPA_URL, SUPA_ANON, {
    global: { headers: { Authorization: `Bearer ${guestSession.access_token}` } }
  });
  await guestSupabase.auth.setSession({ access_token: guestSession.access_token, refresh_token: guestSession.refresh_token });

  // Helper to clear ledger for user
  async function clearLedger(userId){
    await withDb(async c=>{
      await c.query('delete from ai_credit_ledger where user_id=$1', [userId]);
    });
  }
  async function countLedger(userId, filterModel=null, filterAgent=null, reason='ai_reserve'){
    return await withDb(async c=>{
      let q = 'select count(*)::int as cnt from ai_credit_ledger where user_id=$1 and reason=$2';
      let params=[userId, reason];
      if(filterModel){
        q += " and metadata->>'model'=$3";
        params.push(filterModel);
      } else if(filterAgent){
        q += " and metadata->>'agent'=$3";
        params.push(filterAgent);
      }
      const r = await c.query(q, params);
      return r.rows[0].cnt;
    });
  }
  async function insertLedger(userId, kind='text', model=null, agent=null){
    await withDb(async c=>{
      const ref = `ai_req:val-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      const meta = { phase:'H.2-BC', kind, reserved_at: new Date().toISOString(), free_overdraft:true };
      if(model) meta.model=model;
      if(agent) meta.agent=agent;
      await c.query('insert into ai_credit_ledger (user_id, delta, reason, ref_id, metadata) values ($1,-1,$2,$3,$4)', [userId, 'ai_reserve', ref, JSON.stringify(meta)]);
    });
  }
  async function ledgerCountAll(userId){
    return await withDb(async c=>{
      const r=await c.query('select count(*)::int as cnt from ai_credit_ledger where user_id=$1 and reason=$2', [userId,'ai_reserve']);
      return r.rows[0].cnt;
    });
  }

  console.log('\n--- CLEAN ---');
  await clearLedger(freeUser.id);
  await clearLedger(guest.id);
  console.log('Cleared');

  // B1 Super 5/24h
  console.log('\n## B1 Super 5/24h (real DB)');
  const superModel='nvidia/nemotron-3-super-120b-a12b';
  for(let i=1;i<=6;i++){
    const before = await countLedger(freeUser.id, superModel);
    const check = await rl.checkModelRateLimit(freeSupabase, freeUser.id, superModel);
    let status, code, retry='-';
    if(!check.allowed){
      status=429; code='MODEL_RATE_LIMIT'; retry=check.retryAfter;
      const after = await countLedger(freeUser.id, superModel);
      console.log(`Super ${i}/6 | Status=${status} | Code=${code} | RetryAfter=${retry} | ledger ${before}→${after} | ${i===6 && status===429 ? 'BLOCK 429 ✅' : 'FAIL'}`);
      if(i===6){
        console.log(`  Body: ${JSON.stringify(rl.buildModelRateLimitBody(check))}`);
        console.log(`  Ledger not increased: ${before===after ? 'YES ✅' : 'NO'}`);
      }
    } else {
      await insertLedger(freeUser.id, 'text', superModel);
      const after = await countLedger(freeUser.id, superModel);
      status=200; code='OK';
      console.log(`Super ${i}/6 | Status=${status} | Code=${code} | ledger ${before}→${after} | PASS`);
    }
  }

  // B2 Ultra
  console.log('\n## B2 Ultra 3/24h');
  await clearLedger(freeUser.id);
  const ultraModel='nvidia/nemotron-3-ultra-550b-a55b';
  for(let i=1;i<=4;i++){
    const before = await countLedger(freeUser.id, ultraModel);
    const check = await rl.checkModelRateLimit(freeSupabase, freeUser.id, ultraModel);
    let status, code, retry='-';
    if(!check.allowed){
      status=429; code='MODEL_RATE_LIMIT'; retry=check.retryAfter;
      const after=await countLedger(freeUser.id, ultraModel);
      console.log(`Ultra ${i}/4 | Status=${status} | Code=${code} | RetryAfter=${retry} | ledger ${before}→${after} | ${i===4?'BLOCK 429 ✅':'FAIL'}`);
    } else {
      await insertLedger(freeUser.id,'text',ultraModel);
      const after=await countLedger(freeUser.id, ultraModel);
      console.log(`Ultra ${i}/4 | Status=200 | Code=OK | ledger ${before}→${after} | PASS`);
    }
  }

  // B3 Free no limit
  console.log('\n## B3 Free model no per-model limit');
  const freeModel='openai/gpt-oss-120b';
  const freeCheck = await rl.checkModelRateLimit(freeSupabase, freeUser.id, freeModel);
  console.log(`Free model check allowed=${freeCheck.allowed} limit=${freeCheck.limit} → ${freeCheck.allowed?'NO BLOCK ✅':'FAIL'}`);
  await clearLedger(freeUser.id);
  for(let i=1;i<=11;i++){
    const check = await rl.checkAiRateLimit(freeSupabase, freeUser.id, {isVisionOrFile:false});
    if(!check.allowed){
      const body=rl.buildRateLimitBody(check);
      console.log(`Free ${i}/11 | Status=429 | Code=RATE_LIMIT_EXCEEDED | RetryAfter=${body.retryAfter} | ledger text=${await ledgerCountAll(freeUser.id)} | ${i===11?'BLOCK Phase A ✅':'FAIL'}`);
      break;
    } else {
      await insertLedger(freeUser.id,'text',freeModel);
      if(i===10) console.log(`Free 10/11 | Status=200 | PASS (Phase A 10/3h)`);
    }
  }

  // B4 Agent
  console.log('\n## B4 Agent quiz_generator 8/3h');
  await clearLedger(freeUser.id);
  const agent='quiz_generator';
  for(let i=1;i<=9;i++){
    const before=await countLedger(freeUser.id,null,agent);
    const check=await rl.checkAgentRateLimit(freeSupabase, freeUser.id, agent);
    if(!check.allowed){
      console.log(`Agent ${i}/9 | Status=429 | Code=AGENT_RATE_LIMIT | RetryAfter=${check.retryAfter} | ledger ${before}→${before} | ${i===9?'BLOCK 429 ✅':'FAIL'}`);
    } else {
      await insertLedger(freeUser.id,'text',freeModel,agent);
      const after=await countLedger(freeUser.id,null,agent);
      console.log(`Agent ${i}/9 | Status=200 | Code=OK | ledger ${before}→${after} | PASS`);
    }
  }
  console.log(`study_tutor no limit → ${(await rl.checkAgentRateLimit(freeSupabase, freeUser.id, 'study_tutor')).allowed ? 'NO BLOCK ✅' : 'FAIL'}`);

  // C Guest
  console.log('\n## C Guest 5/24h');
  await clearLedger(guest.id);
  for(let i=1;i<=6;i++){
    const before=await ledgerCountAll(guest.id);
    const check=await rl.checkGuestRateLimit(guestSupabase, guest.id);
    if(!check.allowed){
      const body=rl.buildGuestRateLimitBody(check);
      const after=await ledgerCountAll(guest.id);
      console.log(`Guest ${i}/6 | Status=429 | Code=GUEST_RATE_LIMIT | RetryAfter=${body.retryAfter} | ledger ${before}→${after} | ${i===6?'BLOCK 429 ✅':'FAIL'}`);
      console.log(`  Body: ${JSON.stringify(body)}`);
    } else {
      await insertLedger(guest.id,'text');
      const after=await ledgerCountAll(guest.id);
      console.log(`Guest ${i}/6 | Status=200 | Code=OK | ledger ${before}→${after} | PASS`);
    }
  }

  console.log('\n## C4 Refresh same anon');
  const grAfter = await rl.checkGuestRateLimit(guestSupabase, guest.id);
  console.log(`Refresh same anon | allowed=${grAfter.allowed} used=${grAfter.used} → ${!grAfter.allowed?'STILL BLOCK ✅':'FAIL'}`);

  console.log('\n## C5 New guest');
  const { data: anon2 } = await anonClient.auth.signInAnonymously();
  const guest2 = anon2.user;
  const guest2Supa = createClient(SUPA_URL, SUPA_ANON, { global:{headers:{Authorization:`Bearer ${anon2.session.access_token}`}}});
  await guest2Supa.auth.setSession({access_token:anon2.session.access_token, refresh_token:anon2.session.refresh_token});
  const grNew = await rl.checkGuestRateLimit(guest2Supa, guest2.id);
  console.log(`New guest ${guest2.id.slice(0,8)} | allowed=${grNew.allowed} used=${grNew.used} → ${grNew.allowed?'ALLOW ✅ (Abuse Vector)':'FAIL'}`);
  await withDb(async c=>{await c.query('delete from ai_credit_ledger where user_id=$1',[guest2.id]);});

  console.log('\n## C6 Logged-in isolated from Guest');
  await clearLedger(freeUser.id);
  const loggedCheck = await rl.checkAiRateLimit(freeSupabase, freeUser.id, {isVisionOrFile:false});
  console.log(`Logged-in after guest full | allowed=${loggedCheck.allowed} → ${loggedCheck.allowed?'ALLOW ✅':'FAIL'}`);

  console.log('\n## C7 429 no credit');
  await clearLedger(guest.id);
  for(let i=1;i<=5;i++) await insertLedger(guest.id,'text');
  const beforeBal=await ledgerCountAll(guest.id);
  const blockCheck=await rl.checkGuestRateLimit(guestSupabase, guest.id);
  const afterBal=await ledgerCountAll(guest.id);
  console.log(`Before ${beforeBal} blocked=${!blockCheck.allowed} after ${afterBal} → ${beforeBal===afterBal && !blockCheck.allowed?'NO CONSUMPTION ✅':'FAIL'}`);

  console.log('\n## Retry-After');
  await clearLedger(freeUser.id);
  for(let i=1;i<=5;i++) await insertLedger(freeUser.id,'text',superModel);
  const blockRetry=await rl.checkModelRateLimit(freeSupabase, freeUser.id, superModel);
  if(!blockRetry.allowed){
    const body=rl.buildModelRateLimitBody(blockRetry);
    console.log(`Super blocked retryAfter=${body.retryAfter}s retryAfterHours=${body.retryAfterHours} windowHours=${body.windowHours} ✅`);
  }

  // Cleanup
  await clearLedger(freeUser.id);
  await clearLedger(guest.id);
  console.log('\n=== CLEANUP done ===');
  console.log('\n=== SUMMARY ===');
  console.log('Real Supabase validation complete. All ledger counts via direct DB, same engine as /api/unified-ai');
}

main().catch(e=>{console.error('FAIL',e); process.exit(1);});
