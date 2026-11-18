/**
 * 🔧 تطبيق db/50-exam-topic.sql على القاعدة الحقيقية (Supabase Postgres).
 *
 * ⚠️ **السبب**: المولّد الذكي (مصدر «موضوع عام») محتاج العمود `topic`
 *    والـRPC `create_exam_session_with_topic_reserve` — من غيرهم المسار
 *    بيرجّع 503 «موضوع عام لسه مفعّلش» (مش 500).
 *
 * 📌 **idempotent**: `IF NOT EXISTS` / `OR REPLACE` / `DROP IF EXISTS`.
 *
 * 🔒 **أمان**: `DATABASE_URL` من `.env.local` وبحد ما يتطبع أبدًا.
 *
 * التشغيل: `node scripts/apply-exam-topic-sql.cjs`
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

  const sqlPath = path.join(__dirname, "..", "db", "50-exam-topic.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ connected");

  try {
    await client.query(sql);
    console.log("✅ 50-exam-topic.sql applied OK");
  } catch (err) {
    console.error("❌ APPLY FAILED:", err.message);
    console.error("   code:", err.code);
    await client.end();
    process.exit(1);
  }

  // ── التحقق: العمود موجود + القيد + الـRPC.
  const { rows: cols } = await client.query(`
    select column_name, is_nullable, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_session_items'
      and column_name = 'topic';
  `);
  console.log(
    cols.length > 0
      ? `✅ exam_session_items.topic → ${cols[0].data_type} (nullable=${cols[0].is_nullable})`
      : "⚠️ عمود topic لسه مش موجود"
  );

  const { rows: constraint } = await client.query(`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conname = 'exam_session_items_exactly_one_source'
      and conrelid = 'public.exam_session_items'::regclass;
  `);
  console.log(
    constraint.length > 0
      ? `✅ القيد: ${constraint[0].def}`
      : "⚠️ القيد «مصدر واحد» مش موجود"
  );

  const { rows: fn } = await client.query(`
    select count(*)::int as n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_exam_session_with_topic_reserve';
  `);
  console.log(
    fn[0].n > 0 ? "✅ الـRPC create_exam_session_with_topic_reserve موجودة" : "⚠️ الـRPC مش موجودة"
  );

  await client.end();
}

main().catch((err) => {
  console.error("❌ unexpected:", err.message);
  process.exit(1);
});
