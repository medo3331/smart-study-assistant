/**
 * 🧾 ** dumping腿部 الـRPC القديم** (read-only) — عشان نعمل نسخة
 *   /cardinality` منه في `db/49`.
 *
 * ℹ️ التشغيل: `node scripts/dump-exam-rpc.cjs [اسم_الدالة]`
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const line = envText
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) {
    console.error("❌ DATABASE_URL missing from .env.local");
    process.exit(2);
  }
  const url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const name = process.argv[2] || "create_exam_session_with_reserve";
  const { rows } = await client.query(
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1
     limit 1;`,
    [name]
  );
  if (!rows[0]) {
    console.log(`⚠️ الدالة ${name} مش موجودة`);
  } else {
    console.log(rows[0].def);
  }

  await client.end();
}

main().catch((err) => {
  console.error("❌ unexpected:", err.message);
  process.exit(1);
});
