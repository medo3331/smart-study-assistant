/**
 * PHASE 0 — PRE-FLIGHT SNAPSHOT (READ-ONLY)
 *
 * ⚠️ هذا السكربت لا يكتب في قاعدة البيانات إطلاقاً:
 *   - الاتصال يفتح بـ `default_transaction_read_only=on`
 *   - المعاملة `BEGIN TRANSACTION READ ONLY`
 *   - كل استعلام يمر على حارس يرفض أي شيء غير SELECT/WITH
 *   - ينتهي بـ ROLLBACK
 *
 * التشغيل:
 *   node scripts/phase0-preflight-readonly.mjs
 *
 * المخرجات:
 *   docs/artifacts/phase0-preflight-<ISO>.json
 *   docs/artifacts/phase0-preflight-<ISO>.md
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...process.env };
const dbUrl = env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL غير موجود — لا يمكن تنفيذ P0-A.");
  process.exit(2);
}

const FORBIDDEN =
  /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do|vacuum|analyze|copy|merge|refresh|reindex|cluster|comment|security\s+label|listen|notify|load|lock)\b/i;

function assertReadOnly(sql) {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(s)) throw new Error("حارس القراءة: الاستعلام لا يبدأ بـ SELECT/WITH");
  if (FORBIDDEN.test(s)) throw new Error("حارس القراءة: كلمة ممنوعة داخل الاستعلام");
  if (s.includes(";")) throw new Error("حارس القراءة: أكثر من استعلام في نص واحد");
  return s;
}

const Q = {};
Q["q01_rules"] = `select id, amount, daily_cap, is_live from public.coin_source_rules order by id`;
Q["q02_ledger_sources"] = `select source, source_type, count(*)::int as rows, min(amount) as min_amt, max(amount) as max_amt, sum(amount)::int as total from public.coin_ledger group by source, source_type order by source, source_type`;
Q["q03_missing_rules"] = `select l.source, count(*)::int as rows, min(l.amount) as min_amt, max(l.amount) as max_amt from public.coin_ledger l left join public.coin_source_rules r on r.id = l.source where l.source_type = 'earn' and r.id is null group by l.source order by l.source`;
Q["q04_amount_mismatch"] = `select l.source, r.amount as rule_amount, l.amount, count(*)::int as rows from public.coin_ledger l join public.coin_source_rules r on r.id = l.source where l.source_type = 'earn' and l.amount <> r.amount group by 1,2,3 order by 1`;
Q["q06_duplicate_refs"] = `select user_id, source, ref_id, count(*)::int as rows from public.coin_ledger where source_type = 'earn' and ref_id is not null group by 1,2,3 having count(*) > 1`;
Q["q07_escape_history"] = `select amount, count(*)::int as rows, min(created_at) as first_at, max(created_at) as last_at from public.coin_ledger where source = 'escape_room' and source_type = 'earn' group by amount order by amount`;
Q["q08_daily_login_history"] = `select amount, count(*)::int as rows, min(created_at) as first_at, max(created_at) as last_at from public.coin_ledger where source = 'daily_login' and source_type = 'earn' group by amount order by amount`;
Q["q09_null_refs"] = `select source, count(*)::int as rows from public.coin_ledger where source_type = 'earn' and ref_id is null group by source order by source`;
Q["q10_totals"] = `select coalesce(sum(amount),0)::bigint as total_coins, count(distinct user_id)::int as users from public.coin_ledger`;
Q["q11_tables_exist"] = `select t.name, to_regclass('public.'||t.name) is not null as exists from (values ('coin_source_rules'),('coin_wallets'),('coin_ledger'),('break_riddles'),('break_riddle_sessions'),('break_game_claims'),('break_quiz_sessions'),('daily_mission_claims'),('escape_puzzles'),('escape_sessions'),('achievements_catalog'),('user_achievements'),('weekly_mission_claims'),('community_quiz_scores'),('shop_refunds'),('shop_wheel_prizes'),('shop_daily')) t(name)`;
Q["q12_functions_exist"] = `select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('award_coins','complete_study_day','claim_break_game','answer_break_riddle','solve_escape_step','claim_daily_mission','sync_achievements','claim_weekly_mission','spin_wheel','open_box','purchase_item','increment_xp','award_xp','cairo_day','break_studied_today') order by p.proname`;
Q["q13_triggers"] = `select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal and c.relname in ('coin_ledger','profiles','study_days','shop_inventory','coin_wallets') order by c.relname, t.tgname`;
Q["q14_policies"] = `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename in ('coin_ledger','coin_source_rules','coin_wallets','profiles','break_riddle_sessions','break_game_claims','daily_mission_claims','escape_sessions','user_achievements','weekly_mission_claims') order by tablename, policyname`;
Q["q15_indexes"] = `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('coin_ledger','coin_wallets','coin_source_rules') order by tablename, indexname`;
Q["q16_source_clear"] = `select count(*)::int as non_null_rows, count(distinct user_id)::int as users from public.coin_ledger where source = 'source_clear'`;
Q["q17_migration_tracking"] = `select to_regclass('supabase_migrations.schema_migrations') is not null as has_table`;
Q["q18_db_now"] = `select now() as db_now, current_database() as db, current_user as usr, version() as version`;

const DEFINITION_TARGETS = [
  "award_coins(text,text,jsonb)",
  "complete_study_day(uuid)",
  "claim_break_game(text)",
  "answer_break_riddle(text)",
  "solve_escape_step(text)",
  "claim_daily_mission(text)",
  "sync_achievements()",
  "claim_weekly_mission()",
  "spin_wheel()",
  "open_box(text)",
  "purchase_item(text)",
  "increment_xp(integer)",
  "cairo_day()",
  "break_studied_today(uuid)",
];

async function main() {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    application_name: "phase0-preflight-readonly",
    options: "-c default_transaction_read_only=on -c statement_timeout=30000",
  });

  const startedAt = new Date();
  const out = {
    phase: "P0-A",
    startedAt: startedAt.toISOString(),
    readOnly: true,
    target: null,
    queries: {},
    definitions: {},
    errors: [],
  };

  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");

    const who = await client.query("select current_database() as db, current_user as usr, version() as version, inet_server_addr()::text as host");
    out.target = who.rows[0];

    for (const [key, sql] of Object.entries(Q)) {
      try {
        const safe = assertReadOnly(sql);
        const res = await client.query(safe);
        out.queries[key] = { rowCount: res.rowCount, rows: res.rows };
      } catch (e) {
        out.errors.push({ key, message: String(e.message || e) });
        out.queries[key] = { error: String(e.message || e) };
      }
    }

    for (const sig of DEFINITION_TARGETS) {
      try {
        const res = await client.query(
          "select pg_get_functiondef(p.oid) as def from pg_proc p where p.oid = to_regprocedure($1)",
          [`public.${sig}`],
        );
        out.definitions[sig] = res.rows[0]?.def ?? null;
      } catch (e) {
        out.definitions[sig] = { error: String(e.message || e) };
      }
    }

    await client.query("ROLLBACK");
  } catch (e) {
    out.errors.push({ stage: "fatal", message: String(e.message || e) });
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
  } finally {
    await client.end();
  }

  out.finishedAt = new Date().toISOString();
  out.durationMs = Date.now() - startedAt.getTime();

  const dir = join(root, "docs", "artifacts");
  mkdirSync(dir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(dir, `phase0-preflight-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));

  // ملخص بشري — بدون أسرار
  const L = [];
  L.push(`# Phase 0 Pre-Flight Snapshot`);
  L.push(``);
  L.push(`- **Started:** ${out.startedAt}`);
  L.push(`- **Finished:** ${out.finishedAt}`);
  L.push(`- **DB:** ${out.target?.db ?? "?"} | user: ${out.target?.usr ?? "?"}`);
  L.push(`- **Read-only:** ${out.readOnly}`);
  L.push(`- **Errors:** ${out.errors.length}`);
  L.push(``);
  L.push(`## Queries`);
  for (const [k, v] of Object.entries(out.queries)) {
    L.push(``);
    L.push(`### ${k}`);
    if (v.error) { L.push(`ERROR: ${v.error}`); continue; }
    L.push("```json");
    L.push(JSON.stringify(v.rows, null, 2));
    L.push("```");
  }
  L.push(``);
  L.push(`## Function definitions captured`);
  for (const [k, v] of Object.entries(out.definitions)) {
    L.push(`- ${k}: ${v ? (typeof v === "string" ? "captured" : "error") : "NOT FOUND"}`);
  }
  const mdPath = join(dir, `phase0-preflight-${stamp}.md`);
  writeFileSync(mdPath, L.join("\n"));

  console.log(JSON.stringify({
    ok: out.errors.length === 0,
    target: out.target?.db,
    errors: out.errors,
    jsonPath: jsonPath.replace(root, "."),
    mdPath: mdPath.replace(root, "."),
    errorCount: out.errors.length,
    durationMs: out.durationMs,
  }, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
