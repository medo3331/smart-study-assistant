/**
 * Applies db/worship.sql to the Supabase Postgres instance via DATABASE_URL.
 * Idempotent — every statement is safe to re-run. Prints a verification
 * summary (rules + functions) at the end.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  // Read DATABASE_URL straight from .env.local — never logged, never printed.
  const envPath = path.join(__dirname, "..", ".env.local");
  const envText = fs.readFileSync(envPath, "utf8");
  const line = envText
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) {
    console.error("DATABASE_URL missing from .env.local");
    process.exit(2);
  }
  const url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.error("DATABASE_URL is not a postgres:// URL");
    process.exit(2);
  }
  const sqlPath = path.join(__dirname, "..", "db", "worship.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("connected");

  try {
    await client.query(sql);
    console.log("worship.sql applied OK");
  } catch (err) {
    console.error("APPLY FAILED:", err.message);
    await client.end();
    process.exit(1);
  }

  // Verify
  const rules = await client.query(
    "select id, amount, daily_cap, is_live from public.coin_source_rules where id like 'worship%' order by id"
  );
  console.log("--- worship coin_source_rules ---");
  for (const r of rules.rows) {
    console.log(`${r.id} amount=${r.amount} cap=${r.daily_cap} live=${r.is_live}`);
  }

  const fns = await client.query(
    "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('award_worship_coins','worship_daily_summary','upsert_worship_progress','get_worship_settings','save_worship_settings') order by 1"
  );
  console.log("--- functions ---");
  for (const f of fns.rows) console.log(f.proname);

  const tbl = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='worship_settings'"
  );
  console.log("profiles.worship_settings exists:", tbl.rowCount === 1);

  const wtbl = await client.query(
    "select to_regclass('public.worship_progress') as t"
  );
  console.log("worship_progress table:", wtbl.rows[0].t);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
