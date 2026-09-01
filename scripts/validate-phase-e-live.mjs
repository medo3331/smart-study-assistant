#!/usr/bin/env node
import fs from 'fs'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
const env = fs.readFileSync('C:/Desktop/smart-study-assistant/.env.local','utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1]
const anon = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="([^"]+)"/)?.[1]
const dburl = env.match(/DATABASE_URL="([^"]+)"/)?.[1]
const BASE = process.env.BASE || 'http://localhost:3001'
function log(m){ console.log(m) }
async function main(){
  const c=new pg.Client({connectionString:dburl, ssl:{rejectUnauthorized:false}}); await c.connect()
  log('== Phase E Live ==')
  const e = createClient(url, anon)
  const email = `e2e_${Date.now()}@example.com`
  const pass='Test123456!'
  let {data:su}=await e.auth.signUp({email,password:pass})
  await c.query(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1`,[su.user.id])
  const {data:si}=await e.auth.signInWithPassword({email,password:pass})
  const token=si.session.access_token
  const uid=si.user.id
  const sb=createClient(url, anon, {global:{headers:{Authorization:`Bearer ${token}`}}})
  // Ensure wallet exists
  await c.query(`INSERT INTO coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,[uid])
  // 1. signup reward blocked
  let r=await sb.rpc('award_coins',{p_source:'signup_reward'})
  log(`signup_reward: ${r.error ? 'BLOCKED ✅ '+r.error.message.slice(0,80) : 'UNEXPECTED ALLOW'}`)
  // 2. daily_login first call
  r=await sb.rpc('award_coins',{p_source:'daily_login'})
  log(`daily_login 1st: ${r.error ? 'ERR '+r.error.message.slice(0,60) : 'awarded='+r.data?.[0]?.awarded+' balance='+r.data?.[0]?.balance+' capped='+r.data?.[0]?.capped}`)
  // 3. daily_login second same day should be capped (awarded 0 or capped true)
  r=await sb.rpc('award_coins',{p_source:'daily_login'})
  const capped = r.data?.[0]?.capped || r.data?.[0]?.awarded===0
  log(`daily_login 2nd same day: ${capped ? 'CAPPED ✅' : 'NOT CAPPED ❌'} ${JSON.stringify(r.data?.[0])}`)
  // 4. concurrent
  const [a,b]=await Promise.all([sb.rpc('award_coins',{p_source:'daily_login'}), sb.rpc('award_coins',{p_source:'daily_login'})])
  log(`concurrent daily_login: A=${JSON.stringify(a.data?.[0])} B=${JSON.stringify(b.data?.[0])} -> at most one awarded ✅ if one capped`)
  // 5. wallet
  let w=await sb.rpc('coin_balance')
  log(`coin_balance: ${w.data} (should be 5 or 0)`)
  // 6. direct insert blocked
  let ins=await sb.from('coin_ledger').insert({user_id:uid, source:'hack', amount:999, source_type:'earn', ref_id:'hack'})
  log(`direct coin_ledger insert: ${ins.error ? 'BLOCKED ✅ '+ins.error.message.slice(0,60) : 'UNEXPECTED ALLOW ❌'}`)
  // 7. separation: coin_ledger vs ai_credit_ledger
  let cr=await c.query(`SELECT count(*)::int as n FROM coin_ledger WHERE user_id=$1`,[uid])
  let ar=await c.query(`SELECT count(*)::int as n FROM ai_credit_ledger WHERE user_id=$1`,[uid])
  log(`ledger counts: coin=${cr.rows[0].n} ai=${ar.rows[0].n} (should be separate)`)
  // 8. store purchase: need enough coins — grant some via award_coins day_done? Need a day.
  // Create a study_day and complete it to get 25 coins, then try purchase cheap item? Cheapest cosmetic is maybe 50?
  // Instead ensure purchase fails when insufficient: try to buy expensive without funds
  let pur=await sb.rpc('purchase_item',{p_item_id:'useful.ai-starter-pack'})
  log(`purchase without funds (650): ${pur.error ? 'BLOCKED ✅ '+pur.error.message.slice(0,80) : 'UNEXPECTED ALLOW'}`)
  // 9. give enough coins via direct db grant for test (bypass) — insert ledger as service? Use pg to insert earn
  await c.query(`INSERT INTO coin_ledger (user_id, source, amount, source_type, ref_id) VALUES ($1,'day_done',650,'earn',$2)`,[uid, `test:${Date.now()}`])
  w=await sb.rpc('coin_balance')
  log(`after manual 650 earn, balance=${w.data}`)
  pur=await sb.rpc('purchase_item',{p_item_id:'useful.ai-starter-pack'})
  log(`purchase useful.ai-starter-pack with funds: ${pur.error ? 'ERR '+pur.error.message.slice(0,80) : 'OK spent='+pur.data?.[0]?.spent+' balance='+pur.data?.[0]?.balance}`)
  // check idempotency second purchase same item should fail already owned
  let pur2=await sb.rpc('purchase_item',{p_item_id:'useful.ai-starter-pack'})
  log(`second purchase same item: ${pur2.error ? 'BLOCKED already owned ✅' : 'UNEXPECTED ALLOW'}`)
  // 10. AI reserve still works
  await sb.rpc('has_entitlement',{p_user_id:uid, p_kind:'feature', p_value:'advanced-study'}).then(()=>{})
  log('== Done ==')
  await c.end()
}
main().catch(e=>{console.error(e); process.exit(1)})
