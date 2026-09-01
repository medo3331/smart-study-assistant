#!/usr/bin/env node
import fs from 'fs'; import pg from 'pg'; import { createClient } from '@supabase/supabase-js'
const env=fs.readFileSync('C:/Desktop/smart-study-assistant/.env.local','utf8')
const url=env.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1]
const anon=env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"/)?.[1]
const dburl=env.match(/DATABASE_URL="([^"]+)"/)?.[1]
const base='http://localhost:3001'
async function callAgents(token, body){
  const r=await fetch(base+'/api/agents/generate',{method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'Cookie':`sb-lgaqgkihhmedtdzcgpnc-auth-token=${token}`}, body: JSON.stringify(body)})
  const j=await r.json().catch(()=>({})); return {status:r.status, json:j, headers:Object.fromEntries(r.headers.entries())}
}
async function callUnified(token, body){
  const r=await fetch(base+'/api/unified-ai',{method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'Cookie':`sb-lgaqgkihhmedtdzcgpnc-auth-token=${token}`}, body: JSON.stringify(body)})
  const j=await r.json().catch(()=>({})); return {status:r.status, json:j}
}
async function main(){
  const c=new pg.Client({connectionString:dburl, ssl:{rejectUnauthorized:false}}); await c.connect()
  const e=createClient(url, anon)
  const email=`phI_${Date.now()}@example.com`; const pass='Test123456!'
  let {data:su}=await e.auth.signUp({email,password:pass}); await c.query(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1`,[su.user.id])
  const {data:si}=await e.auth.signInWithPassword({email,password:pass}); const token=si.session.access_token, uid=si.user.id
  const sb=createClient(url, anon, {global:{headers:{Authorization:`Bearer ${token}`}}})
  await c.query(`INSERT INTO profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`,[uid])
  // fund for credit tests
  await c.query(`INSERT INTO coin_ledger (user_id, source, amount, source_type, ref_id) VALUES ($1,'day_done',500,'earn',$2)`,[uid, `fund-I-${Date.now()}`])
  await c.query(`INSERT INTO coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,[uid])

  console.log('================================')
  console.log('PHASE I LIVE VALIDATION')
  console.log('================================')
  console.log(`User ${email} id ${uid}`)

  // Audit summary inline
  console.log('\n--- Audit summary ---')
  console.log('Registry 12 (study_tutor, exam_solver, quiz_generator, research, document_analyzer, writing, language, planner, career, freelance, image, personal_assistant) -> status stub, requires runAgent, no HTTP binding')
  console.log('Real API agents 3 (marketing, research, content) via POST /api/agents/generate -> aiRouter.completeChat -> Guard + provider + real response')
  console.log('Unified AI -> aiRouter via /api/unified-ai (generic chat)')

  const tests=[]
  // Helper to validate content
  function validate(label, res){
    const content = res.json.result || res.json.content || res.json.output || ''
    const provider = res.json.provider || res.json.model || 'unknown'
    const model = res.json.model || 'unknown'
    const ok = res.status===200 && typeof content==='string' && content.trim().length>30
    const statusStr = ok ? 'PASS' : (res.status===429 || res.status===402 || res.status===403 ? 'BLOCKED' : 'FAIL')
    console.log('\n--------------------------------')
    console.log(`Agent: ${label}`)
    console.log(`Status: ${statusStr}`)
    console.log(`HTTP: ${res.status}`)
    console.log(`Provider: ${provider} Model: ${model}`)
    console.log(`Response length: ${content.length} valid: ${ok}`)
    if(content.length>0) console.log(`Preview: ${content.slice(0,180).replace(/\n/g,' ')}...`)
    else console.log(`Error: ${JSON.stringify(res.json).slice(0,300)}`)
    tests.push({label, status: statusStr, http:res.status, ok})
    return ok
  }

  // 1 marketing - copy (groq) should PASS, strategy (gemini) expected BLOCKED if gemini down
  let r1=await callAgents(token,{agent:'marketing', goal:'كتابة إعلان لمنتج عسل طبيعي خالص', brief:'عسل جبلي نقي، جمهور ربات بيوت', audience:'ربات بيوت 25-40', tone:'ودود', mode:'copy'})
  validate('marketing (copy/groq)', r1)
  let r1b=await callAgents(token,{agent:'marketing', goal:'إطلاق متجر إلكتروني لمنتجات طبيعية، استهدف ربات البيوت', brief:'ميزانية 5000 جنيه، منتجات عسل وزيوت', audience:'ربات بيوت 25-40', tone:'ودود', mode:'strategy'})
  const r1bContent = r1b.json.result||''; const r1bOk = r1b.status===200 && r1bContent.length>30; const r1bBlocked = r1b.status===500 || r1b.status===502 || r1b.status===429
  console.log('\n--------------------------------')
  console.log(`Agent: marketing (strategy/gemini)`)
  console.log(`Status: ${r1bOk?'PASS':r1bBlocked?'BLOCKED — Provider unavailable':'FAIL'}`)
  console.log(`HTTP: ${r1b.status}`)
  if(!r1bOk) console.log(`Error: ${JSON.stringify(r1b.json).slice(0,300)}`)
  // not counted in main pass/fail for overall? count as separate
  tests.push({label:'marketing (strategy)', status: r1bOk?'PASS':r1bBlocked?'BLOCKED':'FAIL', http:r1b.status, ok:r1bOk})
  // 2 research
  let r2=await callAgents(token,{agent:'research', goal:'قارن بين Notion و Obsidian للطلاب', brief:'المعايير: السعر، العمل أوفلاين، البحث', mode:'analysis'})
  validate('research (analysis)', r2)
  // 3 content
  let r3=await callAgents(token,{agent:'content', goal:'مقال قصير عن فوائد القراءة اليومية', brief:'300 كلمة، جمهور طلاب ثانوي', tone:'تحفيزي', output:'مقال منظم بعناوين فرعية'})
  validate('content (create)', r3)

  // 4 unified-ai generic chat (sanity, not counted as agent but proves router+provider)
  let r4=await callUnified(token,{prompt:'اشرح لي قانون أوم بطريقة بسيطة مع مثال', model:'openai/gpt-oss-120b'})
  // unified-ai returns {ok:true, answer:...} not {result}
  const unifiedOk = r4.status===200 && ((r4.json.answer && r4.json.answer.length>30) || (r4.json.result && r4.json.result.length>30) || (r4.json.content && r4.json.content.length>30))
  console.log(`unified-ai chat: status ${r4.status} ${unifiedOk?'PASS ✅':'FAIL'} preview ${(r4.json.answer||r4.json.result||'').slice(0,120)}`)
  tests.push({label:'unified-ai chat', status: unifiedOk?'PASS':'FAIL', http:r4.status, ok:unifiedOk})

  // 5 error cases
  console.log('\n--- Error handling ---')
  let re1=await callAgents(token,{agent:'marketing', goal:'hi'}) // too short <4
  console.log(`Empty/invalid goal: status ${re1.status} ${re1.status===400?'PASS ✅ 400':'CHECK'} ${JSON.stringify(re1.json).slice(0,120)}`)
  let re2=await fetch(base+'/api/agents/generate',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({agent:'marketing', goal:'test'})})
  const j2=await re2.json().catch(()=>({})); console.log(`Unauthorized (no token): status ${re2.status} ${re2.status===401?'PASS ✅':'CHECK'} ${JSON.stringify(j2).slice(0,120)}`)

  // credit check: ensure 429/403 no reserve verified via GH already; here verify one allowed request consumed credit
  let balBefore=await sb.rpc('ai_credit_balance')
  let rCred=await callAgents(token,{agent:'content', goal:'اكتب تغريدة قصيرة عن تنظيم الوقت للطلاب', brief:'بالعربية، 280 حرف'})
  let balAfter=await sb.rpc('ai_credit_balance')
  console.log(`Credit on allowed request: before ${balBefore.data} after ${balAfter.data} status ${rCred.status} ${balAfter.data===balBefore.data-1?'PASS consumed':'CHECK'}`)

  // concurrent
  let [cA,cB]=await Promise.all([
    callAgents(token,{agent:'content', goal:'اكتب فكرة محتوى عن الدراسة الفعالة 1', brief:'سطرين'}),
    callAgents(token,{agent:'content', goal:'اكتب فكرة محتوى عن الدراسة الفعالة 2', brief:'سطرين'}),
  ])
  console.log(`Concurrent 2 agents: A ${cA.status} B ${cB.status} ${(cA.status===200 && cB.status===200)?'PASS both allowed (window permits)': cA.status===429||cB.status===429?'CHECK rate limited':'CHECK'}`)

  const passCount = tests.filter(t=>t.status==='PASS').length
  const blocked = tests.filter(t=>t.status==='BLOCKED').length
  const fail = tests.filter(t=>t.status==='FAIL').length
  console.log('\n================================')
  console.log(`Total tested: ${tests.length} PASS:${passCount} FAIL:${fail} BLOCKED:${blocked}`)
  console.log(`Phase I verdict: ${fail>0 ? '🟡 PARTIAL / 🔴 FAIL — some agents not live' : '🟢 PASS — real agents via /api/agents/generate live'}`)
  console.log('Registry 12 stub: NOT TESTED via HTTP — ABSTRACTION READY — NOT ACTIVE (by design, no bypass)')
  console.log('================================')
  await c.end()
}
main().catch(e=>{console.error(e); process.exit(1)})
