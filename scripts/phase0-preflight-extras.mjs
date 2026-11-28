/**
 * PHASE 0 — PRE-FLIGHT EXTRAS (READ-ONLY)
 * استكمال P0-A: تاريخ الـ migrations، صلاحيات الدوال، كتالوج الإنجازات، وجداول الجوائز.
 * لا كتابة إطلاقاً — نفس حراس السكربت الأساسي.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = { ...loadEnv(".env.local"), ...process.env };
const dbUrl = env.DATABASE_URL;
if (!dbUrl) { console.error("DATABASE_URL missing"); process.exit(2); }

const FORBIDDEN = /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do|vacuum|analyze|copy|merge|refresh|reindex|cluster|comment|security\s+label|listen|notify|load|lock)\b/i;
function assertReadOnly(sql) {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(s)) throw new Error("guard: not select");
  if (FORBIDDEN.test(s)) throw new Error("guard: forbidden keyword");
  if (s.includes(";")) throw new Error("guard: multiple statements");
  return s;
}

const Q = {
  q19_migration_history: `select version, name from supabase_migrations.schema_migrations order by version`,
  q20_function_security: `select p.proname, p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('award_coins','complete_study_day','claim_break_game','answer_break_riddle','solve_escape_step','claim_daily_mission','sync_achievements','claim_weekly_mission','spin_wheel','open_box','purchase_item','increment_xp') order by p.proname`,
  q21_routine_privileges: `select routine_name, grantee, privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name in ('award_coins','complete_study_day','claim_break_game','answer_break_riddle','solve_escape_step','claim_daily_mission','sync_achievements','claim_weekly_mission','spin_wheel','open_box','purchase_item','increment_xp') order by routine_name, grantee`,
  q22_table_privileges: `select table_name, grantee, privilege_type from information_schema.table_privileges where table_schema='public' and table_name in ('coin_ledger','coin_source_rules','coin_wallets') order by table_name, grantee, privilege_type`,
  q23_achievements_catalog: `select id, coins, xp, kind, target, sort_order from public.achievements_catalog order by sort_order`,
  q24_wheel_prizes: `select id, coins, weight from public.shop_wheel_prizes order by id`,
  q25_refunds: `select rarity, coins from public.shop_refunds order by coins`,
  q26_break_riddles_count: `select count(*)::int as riddles from public.break_riddles`,
  q27_escape_puzzles_count: `select count(*)::int as puzzles from public.escape_puzzles`,
  q28_signup_bonus_rows: `select count(*)::int as rows, min(created_at) as first_at, max(created_at) as last_at from public.coin_ledger where source='signup_bonus' and source_type='earn'`,
  q29_streak_tier_rows: `select source, amount, count(*)::int as rows from public.coin_ledger where source in ('streak_tier_3','streak_tier_30') and source_type='earn' group by source, amount order by source`,
  q30_earn_by_day: `select (created_at at time zone 'Africa/Cairo')::date as cairo_day, count(*)::int as rows, sum(amount)::int as coins from public.coin_ledger where source_type='earn' group by 1 order by 1 desc limit 30`,
};

const EXTRA_DEFS = ["handle_signup_bonus()", "daily_missions()", "weekly_missions()", "_streak_apply(uuid)"];

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  application_name: "phase0-preflight-extras-readonly",
  options: "-c default_transaction_read_only=on -c statement_timeout=30000",
});

const startedAt = new Date();
const out = { phase: "P0-A-extras", startedAt: startedAt.toISOString(), readOnly: true, queries: {}, definitions: {}, errors: [] };

await client.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  await client.query("SET LOCAL statement_timeout='30s'");
  for (const [k, sql] of Object.entries(Q)) {
    try { const r = await client.query(assertReadOnly(sql)); out.queries[k] = r.rows; }
    catch (e) { out.errors.push({ k, m: String(e.message || e) }); out.queries[k] = { error: String(e.message || e) }; }
  }
  for (const sig of EXTRA_DEFS) {
    try {
      const r = await client.query("select pg_get_functiondef(p.oid) as def from pg_proc p where p.oid=to_regprocedure($1)", [`public.${sig}`]);
      out.definitions[sig] = r.rows[0]?.def ?? null;
    } catch (e) { out.definitions[sig] = { error: String(e.message || e) }; }
  }
  await client.query("ROLLBACK");
} catch (e) {
  out.errors.push({ stage: "fatal", m: String(e.message || e) });
  try { await client.query("ROLLBACK"); } catch {}
} finally { await client.end(); }

out.finishedAt = new Date().toISOString();
const dir = join(root, "docs", "artifacts"); mkdirSync(dir, { recursive: true });
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const p = join(dir, `phase0-preflight-extras-${stamp}.json`);
writeFileSync(p, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: out.errors.length === 0, path: p.replace(root, "."), errors: out.errors }, null, 2));
