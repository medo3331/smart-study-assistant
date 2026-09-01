#!/usr/bin/env node
// Phase G+H Live Validation — DB/RPC + unified-ai API
import fs from 'fs'; import pg from 'pg'; import { createClient } from '@supabase/supabase-js'
const env=fs.readFileSync('C:/Desktop/smart-study-assistant/.env.local','utf8')
const url=env.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1]
const anon=env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"/)?.[1]
const dburl=env.match(/DATABASE_URL="([^"]+)"/)?.[1]
const base='http://localhost:3001'
function tok(sb){ return sb.auth.getSession().then(r=>r.data.session?.access_token) }
async function unifiedAi(token, body){
  const r=await fetch(base+'/api/unified-ai',{method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${token}`, 'Cookie':`sb-lgaqgkihhmedtdzcgpnc-auth-token=${token}`}, body: JSON.stringify(body)})
  const j=await r.json().catch(()=>({})); return {status:r.status, json:j, headers:r.headers}
}
async function main(){
  const c=new pg.Client({connectionString:dburl, ssl:{rejectUnauthorized:false}}); await c.connect()
  const e=createClient(url, anon)
  // create fresh user for G/H
  const email=`gh_${Date.now()}@example.com`; const pass='Test123456!'
  let {data:su}=await e.auth.signUp({email,password:pass}); await c.query(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1`,[su.user.id])
  const {data:si}=await e.auth.signInWithPassword({email,password:pass}); const token=si.session.access_token, uid=si.user.id
  const sb=createClient(url, anon, {global:{headers:{Authorization:`Bearer ${token}`}}})
  await c.query(`INSERT INTO profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`,[uid])
  // fund user with coins to buy entitlement later but not needed yet
  // Check G: free model without entitlement should be accessible (guard should allow)
  console.log('=== Phase G: Model Access ===')
  // 1) free model via unified-ai (should be 200 or provider error but not 403)
  let r1=await unifiedAi(token,{prompt:'hello', model:'openai/gpt-oss-120b'})
  console.log(`G1 free model no entitlement: status=${r1.status} code=${r1.json.code||r1.json.error?.code||'OK'} ${r1.status===403?'FAIL ❌ should be allowed':'PASS ✅'}`)
  // 2) gated model without entitlement -> expect 403
  let r2=await unifiedAi(token,{prompt:'hello', model:'nvidia/nemotron-3-super-120b-a12b'})
  console.log(`G2 gated SUPER without entitlement: status=${r2.status} code=${r2.json.code} ${r2.status===403?'PASS ✅':'FAIL ❌ expected 403 '+JSON.stringify(r2.json).slice(0,120)}`)
  // check no credit consumed on 403
  let balBefore=await sb.rpc('ai_credit_balance'); console.log(`balance before gated 403: ${balBefore.data}`)
  let balAfter=await sb.rpc('ai_credit_balance'); // same call after 403, should be same
  // need to count ledger before/after gated attempt
  let cntBefore=await c.query(`SELECT count(*)::int as c FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`,[uid])
  // do another gated attempt to measure
  await unifiedAi(token,{prompt:'hello2', model:'nvidia/nemotron-3-ultra-550b-a55b'})
  let cntAfter=await c.query(`SELECT count(*)::int as c FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`,[uid])
  console.log(`G2b 403 no credit: ledger before=${cntBefore.rows[0].c} after=${cntAfter.rows[0].c} ${cntAfter.rows[0].c===cntBefore.rows[0].c?'PASS ✅ no reserve':'FAIL ❌ should not reserve'}`)
  // 3) unknown model -> 403
  let r3=await unifiedAi(token,{prompt:'hi', model:'unknown-fake-model-xyz'})
  console.log(`G3 unknown model: status=${r3.status} ${r3.status===403?'PASS ✅':'CHECK '+JSON.stringify(r3.json).slice(0,120)}`)
  // 4) purchase entitlement then gated succeeds
  // need coins to purchase study-booster (2200) — give via pg ledger directly (simulate earnings)
  await c.query(`INSERT INTO coin_ledger (user_id, source, amount, source_type, ref_id) VALUES ($1,'day_done',3000,'earn',$2)`,[uid, `fund-gh-${Date.now()}`])
  await c.query(`INSERT INTO coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,[uid])
  let pur=await sb.rpc('purchase_item',{p_item_id:'useful.study-booster'})
  console.log(`G4 purchase study-booster: ${pur.error? 'ERR '+pur.error.message.slice(0,60) : 'OK '+JSON.stringify(pur.data?.[0]).slice(0,80)}`)
  let has=await sb.rpc('has_entitlement',{p_user_id:uid, p_kind:'feature', p_value:'advanced-study'})
  console.log(`G4 has_entitlement advanced-study: ${JSON.stringify(has.data)} has_error=${has.error?.message||'none'}`)
  let r4=await unifiedAi(token,{prompt:'hello after entitlement', model:'nvidia/nemotron-3-super-120b-a12b'})
  console.log(`G4 gated SUPER after entitlement: status=${r4.status} code=${r4.json.code||'OK'} ${r4.status!==403?'PASS ✅ (not blocked)': 'FAIL ❌ still 403 '+JSON.stringify(r4.json).slice(0,120)}`)
  console.log('=== Phase H: Credit Guard + Windowed Limits ===')
  // H1: 1 credit per request (check balance delta)
  let bal0=await sb.rpc('ai_credit_balance'); console.log(`H balance before free request: ${bal0.data}`)
  let rh1=await unifiedAi(token,{prompt:'credit test 1', model:'openai/gpt-oss-120b'})
  let bal1=await sb.rpc('ai_credit_balance'); console.log(`H1 credit consumed: before=${bal0.data} after=${bal1.data} status=${rh1.status} ${bal1.data===bal0.data-1 || rh1.status===429 ? 'PASS (consumed or rate-limited)':'CHECK'}`)
  // H2: windowed text limit 10/3h — fill ledger to 10, next should be 429 no credit
  // Create second user for clean window test
  const email2=`gh2_${Date.now()}@example.com`; let {data:su2}=await e.auth.signUp({email:email2,password:pass}); await c.query(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1`,[su2.user.id])
  const {data:si2}=await e.auth.signInWithPassword({email:email2,password:pass}); const uid2=si2.user.id, tok2=si2.session.access_token
  const sb2=createClient(url, anon, {global:{headers:{Authorization:`Bearer ${tok2}`}}})
  await c.query(`INSERT INTO profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`,[uid2])
  // Insert 10 reserves directly to simulate window full (use pg to avoid API overhead)
  for(let i=0;i<10;i++){ await c.query(`INSERT INTO ai_credit_ledger (user_id, delta, reason, ref_id, metadata) VALUES ($1,-1,'ai_reserve',$2,'{"kind":"text"}')`,[uid2, `gh-win-${Date.now()}-${i}-${Math.random()}`]) }
  let bal2before=await sb2.rpc('ai_credit_balance')
  let rh2=await unifiedAi(tok2,{prompt:'window overflow', model:'openai/gpt-oss-120b'})
  let cntB=await c.query(`SELECT count(*)::int as c FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve'`,[uid2])
  console.log(`H2 text window 10/3h: 10 pre-filled, next status=${rh2.status} code=${rh2.json.code} count=${cntB.rows[0].c} ${rh2.status===429?'PASS ✅ 429':'FAIL ❌ expected 429'} ${cntB.rows[0].c===10?'PASS no credit on 429':'FAIL ledger grew'}`)
  // H3: idempotency — same ref should not double charge
  const ref=`idem-${Date.now()}`
  let id1=await c.query(`SELECT * FROM public.reserve_ai_credit($1,$2,'text')`,[uid, ref])
  let id2=await c.query(`SELECT * FROM public.reserve_ai_credit($1,$2,'text')`,[uid, ref])
  console.log(`H3 idempotent reserve same ref: 1st ${JSON.stringify(id1.rows[0])} 2nd ${JSON.stringify(id2.rows[0])} ${id2.rows[0].already_existed===true?'PASS ✅':'FAIL'}`)
  // H4: concurrent reserves with same ref -> one already_existed
  const cref=`conc-${Date.now()}-${Math.random()}`
  let email3=`gh3_${Date.now()}@example.com`; let {data:su3}=await e.auth.signUp({email:email3,password:pass}); await c.query(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1`,[su3.user.id]); const {data:si3}=await e.auth.signInWithPassword({email:email3,password:pass}); const uid3=si3.user.id
  let [ca,cb]=await Promise.all([c.query(`SELECT * FROM public.reserve_ai_credit($1,$2,'text')`,[uid3, cref]), c.query(`SELECT * FROM public.reserve_ai_credit($1,$2,'text')`,[uid3, cref])])
  console.log(`H4 concurrent same ref: A already=${ca.rows[0]?.already_existed} B already=${cb.rows[0]?.already_existed} ${(ca.rows[0].already_existed!==cb.rows[0].already_existed)?'PASS ✅ one dup':'CHECK'}`)
  await c.end()
  console.log('== GH Live done ==')
}
main().catch(e=>{console.error(e); process.exit(1)})
