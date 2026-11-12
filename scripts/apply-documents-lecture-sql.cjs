/**
 * Applies db/42-documents-lecture-and-thumbnail.sql to the Supabase Postgres
 * instance via DATABASE_URL.
 *
 * Idempotent. Verifies the columns + constraints + the XOR rule.
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
    "42-documents-lecture-and-thumbnail.sql",
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
    console.log("42-documents-lecture-and-thumbnail.sql applied OK");
  } catch (err) {
    console.error("APPLY FAILED:", err.message);
    await client.end();
    process.exit(1);
  }

  const cols = await client.query(`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'documents'
      and column_name in ('lecture_id', 'source_unit', 'thumbnail')
    order by column_name
  `);
  console.log("columns:");
  for (const r of cols.rows) {
    console.log(`  ${r.column_name.padEnd(14)} ${r.data_type.padEnd(10)} null=${r.is_nullable} default=${r.column_default ?? ""}`);
  }
  if (cols.rows.length !== 3) {
    console.error("VERIFY FAILED — expected 3 new columns");
    await client.end();
    process.exit(1);
  }

  const cons = await client.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.documents'::regclass and contype = 'c'
      and conname like 'documents_%'
    order by conname
  `);
  console.log("constraints:");
  for (const r of cons.rows) console.log(`  ${r.conname}: ${r.def}`);

  const idx = await client.query(`
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'documents'
      and indexname = 'documents_lecture_created_idx'
  `);
  console.log("index:", idx.rows.length ? "documents_lecture_created_idx ✓" : "❌");

  await client.end();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
