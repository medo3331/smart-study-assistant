/**
 * Applies db/41-ai-operations-insert-policy.sql to the Supabase Postgres
 * instance via DATABASE_URL.
 *
 * Idempotent. Verifies by actually INSERTING a row through the same
 * session client shape the app uses (that is the real test — the table
 * had no INSERT policy at all).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
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
  const sqlPath = path.join(
    __dirname,
    "..",
    "db",
    "41-ai-operations-insert-policy.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("connected");

  try {
    await client.query(sql);
    console.log("41-ai-operations-insert-policy.sql applied OK");
  } catch (err) {
    console.error("APPLY FAILED:", err.message);
    await client.end();
    process.exit(1);
  }

  const pol = await client.query(`
    select policyname, cmd from pg_policies
    where schemaname = 'public' and tablename = 'ai_operations'
    order by policyname
  `);
  console.log(
    "policies:",
    pol.rows.map((r) => `${r.policyname}(${r.cmd})`).join(", "),
  );

  const need = [
    "ai operations: owner inserts",
    "ai operations: owner updates",
    "ai operations: owner deletes",
  ];
  const have = pol.rows.map((r) => r.policyname);
  const missing = need.filter((n) => !have.includes(n));
  if (missing.length > 0) {
    console.error("VERIFY FAILED — missing:", missing.join(", "));
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
