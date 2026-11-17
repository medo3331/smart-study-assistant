/**
 * 🔎 فحص **قراءة فقط** لـRPC إنشاء الامتحان في القاعدة الحقيقية.
 *
 * بتطبع body's الـfunction وتقوله لو فيه bug الـ`array_length` (NULL
 * للمصفوفة الفاضية ⇒ `total_lectures` NULL ⇒ **500** عند الإنشاء).
 *
 * 🔒 مافيش أي كتابة — SELECT فقط.
 *
 * التشغيل: `node scripts/verify-exam-rpc.cjs`
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

  const { rows } = await client.query(`
    select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_exam_session_with_sources_reserve', 'create_exam_session_with_reserve')
    order by p.proname;
  `);

  for (const row of rows) {
    const usesCardinality = /cardinality\(v_lecture_ids\)/.test(row.def);
    const usesArrayLength = /array_length\(v_lecture_ids/.test(row.def);
    console.log(`\n=== ${row.proname} ===`);
    console.log(
      `  cardinality: ${usesCardinality ? "✅" : "❌"} · array_length: ${usesArrayLength ? "⚠️用它" : "✅ مفيش"}`
    );
    if (usesArrayLength && !usesCardinality) {
      console.log(
        "  ❌ BUG: array_length('{}',1) => NULL ⇒ total_lectures NULL ⇒ 500 عند إنشاء أي امتحان."
      );
      console.log("  🔧 الحل: apply db/49-exam-documents.sql (مصلّح بـcardinality).");
    }
  }

  // ⚠️ سلوك array_length على مصفوفة فاضية (دليل سريع).
  const { rows: probe } = await client.query(`
    select array_length('{}'::uuid[], 1) as array_length_empty,
           cardinality('{}'::uuid[]) as cardinality_empty;
  `);
  console.log("\n=== سلوك المصفوفة الفاضية في Postgres ===");
  console.log("  array_length('{}',1) =", probe[0].array_length_empty, "(NULL ⇒ المشكلة)");
  console.log("  cardinality('{}')   =", probe[0].cardinality_empty, "(0 ⇒ الصح)");

  await client.end();
}

main().catch((err) => {
  console.error("❌ unexpected:", err.message);
  process.exit(1);
});
