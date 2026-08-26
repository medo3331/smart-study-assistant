/**
 * Interactive helper: prompts for the Supabase DB password (never displayed,
 * never stored), connects through the regional session pooler, applies
 * db/worship.sql, and verifies every object. Run manually when the DATABASE_URL
 * in .env.local is not usable:
 *
 *   node scripts/apply-worship-sql-manual.cjs <region-host> <db-username>
 *
 * e.g.  node scripts/apply-worship-sql-manual.cjs aws-0-eu-central-1.pooler.supabase.com postgres.lgaqgkihhmedtdzcgpnc
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Client } = require("pg");

async function main() {
  const [, , hostArg, userArg] = process.argv;
  if (!hostArg || !userArg) {
    console.error(
      "usage: node scripts/apply-worship-sql-manual.cjs <pooler-host> <db-user (postgres.<project-ref>)>"
    );
    process.exit(2);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl.stderr.write(`DB password for ${userArg}@${hostArg}: `);
  const password = await new Promise((res) => {
    rl.once("line", (l) => res(l.trim()));
  });
  rl.close();

  const sqlPath = path.join(__dirname, "..", "db", "worship.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    host: hostArg,
    port: 5432,
    user: userArg,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("connected to", hostArg);

  try {
    await client.query(sql);
    console.log("✔ db/worship.sql applied");
  } catch (err) {
    console.error("APPLY FAILED:", err.message);
    await client.end();
    process.exit(1);
  }

  const rules = await client.query(
    "select id, amount, daily_cap from public.coin_source_rules where id like 'worship%' order by id"
  );
  console.log("--- worship coin rules ---");
  rules.rows.forEach((r) => console.log(`${r.id}  +${r.amount}/claim  cap=${r.daily_cap}/day`));

  const fns = await client.query(
    "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like '%worship%' order by 1"
  );
  console.log("--- functions ---");
  fns.rows.forEach((f) => console.log(f.proname));

  await client.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
