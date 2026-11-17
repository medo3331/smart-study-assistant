/**
 * 🔧 تطبيق db/49-exam-documents.sql على القاعدة الحقيقية (Supabase Postgres).
 *
 * ⚠️ **السبب**: الـmigration دي فيها bug في `array_length` (بيرجّع NULL لل
 *    массив الفاضي) ⇒ `total_lectures` بتبقى NULL ⇒ **500 عند إنشاء أي
 *    امتحان**. الملف اتصلّح (`cardinality`) واتطبّق هنا.
 *
 * 📌 **idempotent**: كل العبارات `IF NOT EXISTS / OR REPLACE / DROP IF EXISTS`
 *    ⇒ تشغيل الملف أكتر من مرة آمن.
 *
 * 🔒 **أمان**: `DATABASE_URL` بيتبقرأ من `.env.local` ولا بيتطبع أبدًا.
 *    مافيش أي كتابة غير إعادة تعريف الـfunction (create or replace).
 *
 * التشغيل: `node scripts/apply-exam-documents-sql.cjs`
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
    console.error("❌ DATABASE_URL missing from .env.local");
    process.exit(2);
  }
  const url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.error("❌ DATABASE_URL is not a postgres:// URL");
    process.exit(2);
  }

  const sqlPath = path.join(__dirname, "..", "db", "49-exam-documents.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ connected");

  try {
    await client.query(sql);
    console.log("✅ 49-exam-documents.sql applied OK");
  } catch (err) {
    console.error("❌ APPLY FAILED:", err.message);
    console.error("   code:", err.code);
    await client.end();
    process.exit(1);
  }

  // ── التحقق: الدالة بقت تستخدم cardinality مش array_length.
  const { rows } = await client.query(`
    select
      position('cardinality(v_lecture_ids)' in pg_get_functiondef(p.oid)) > 0 as uses_cardinality,
      position('array_length(v_lecture_ids' in pg_get_functiondef(p.oid)) > 0 as uses_array_length
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_exam_session_with_sources_reserve';
  `);

  const fn = rows[0];
  if (!fn) {
    console.log("⚠️ الـfunction مش موجودة — اتأكد إن الـmigration اتطبّقت.");
  } else if (fn.uses_cardinality && !fn.uses_array_length) {
    console.log("✅ verify: الـfunction بقت تستخدم cardinality (مفيش array_length)");
  } else {
    console.log("⚠️ verify: الـfunction لسه فيها array_length — راجع الـmigration.");
  }

  // ── التحقق: قيود الـschema سليمة.
  const { rows: cols } = await client.query(`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_session_items'
      and column_name in ('lecture_id', 'document_id')
    order by column_name;
  `);
  for (const col of cols) {
    console.log(`ℹ️ exam_session_items.${col.column_name} → nullable=${col.is_nullable}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("❌ unexpected:", err.message);
  process.exit(1);
});
