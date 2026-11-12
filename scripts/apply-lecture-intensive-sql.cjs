/**
 * Applies db/37-lecture-intensive-explanation.sql to the Supabase Postgres
 * instance via DATABASE_URL.
 *
 * Idempotent — every statement is safe to re-run. Prints a verification
 * summary (column + index) at the end.
 *
 * ⚠️ ليه الـ migration نفسه مكتوب «MANUAL RUN»: كل الـ migrations في
 *    المشروع كده. السكربت ده موجود عشان الـ run يكون **موثّق وقابل
 *    للتكرار** بدل ما حد يفتح SQL Editor ويلزق الـ SQL بإيده (فبيبقى
 *    مفيش أثر متى اتطبّق).
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
  const sqlPath = path.join(__dirname, "..", "db", "37-lecture-intensive-explanation.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("connected");

  try {
    await client.query(sql);
    console.log("37-lecture-intensive-explanation.sql applied OK");
  } catch (err) {
    console.error("APPLY FAILED:", err.message);
    await client.end();
    process.exit(1);
  }

  // Verify — العمود موجود والفهرس موجود.
  const col = await client.query(`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lectures'
      and column_name = 'intensive_explanation'
  `);
  const idx = await client.query(`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'lectures'
      and indexname = 'lectures_has_intensive_idx'
  `);

  console.log("column intensive_explanation:", col.rows[0] ?? "MISSING");
  console.log("index lectures_has_intensive_idx:", idx.rows[0]?.indexname ?? "MISSING");

  if (col.rows.length === 0 || idx.rows.length === 0) {
    console.error("VERIFY FAILED");
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
