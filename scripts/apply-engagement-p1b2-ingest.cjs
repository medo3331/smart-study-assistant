/**
 * 🔧 تطبيق P1-B2 (Trusted Engagement Events) على قاعدة بيانات المشروع.
 *
 * 📌 **idempotent**: كل الخطوات `IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT`
 *    — ينفع يتشغّل أكتر من مرة بدون تغيير.
 *
 * 📌 **الترتيب**:
 *    1) db/58b-engagement-events-harden.sql  → تقارب الجدول الموجود على المخطط
 *       المعتمد (source_id text + قيود metadata/occurred_at + REVOKE).
 *    2) db/59-engagement-events-ingest.sql   → registry + دالة الإدخال الموثوقة.
 *
 * 🔒 **أمان**:
 *   - `DATABASE_URL` من `.env.local` وبحد ما يطبع أبدًا.
 *   - DDL مضاف فقط: مافيش DROP / DELETE / TRUNCATE، ومافيش تعديل على أي
 *     جدول إنتاج تاني (ولا على coin_ledger / award_coins / XP).
 *
 * التشغيل: `node scripts/apply-engagement-p1b2-ingest.cjs`
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS = [
  "db/58b-engagement-events-harden.sql",
  "db/59-engagement-events-ingest.sql",
];

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

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("✅ connected");

  for (const rel of MIGRATIONS) {
    const sqlPath = path.join(__dirname, "..", rel);
    const sql = fs.readFileSync(sqlPath, "utf8");
    try {
      await client.query(sql);
      console.log(`✅ applied ${rel}`);
    } catch (err) {
      console.error(`❌ APPLY FAILED (${rel}):`, err.message);
      console.error("   code:", err.code);
      await client.end();
      process.exit(1);
    }
  }

  // ── التحقق ١: مخطط الجدول بعد التقارب.
  const { rows: cols } = await client.query(`
    select column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'engagement_events'
     order by ordinal_position;
  `);
  console.log("\n── engagement_events columns ──");
  console.table(cols);

  const { rows: con } = await client.query(`
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.engagement_events'::regclass
     order by conname;
  `);
  console.log("\n── constraints ──");
  console.table(con);

  // ── التحقق ٢: الـregistry.
  const { rows: types } = await client.query(`
    select event_type, source_table, trust_level, is_active
      from public.engagement_event_types
     order by event_type;
  `);
  console.log("\n── engagement_event_types ──");
  console.table(types);

  // ── التحقق ٣: الدالة + صلاحيات التنفيذ.
  const { rows: fn } = await client.query(`
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prosecdef as security_definer,
           p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'record_engagement_event';
  `);
  console.log("\n── record_engagement_event ──");
  console.table(fn);

  const { rows: grants } = await client.query(`
    select grantee, privilege_type
      from information_schema.role_routine_grants
     where routine_name = 'record_engagement_event'
     order by grantee, privilege_type;
  `);
  console.log("\n── execute grants ──");
  console.table(grants);

  const { rows: tblGrants } = await client.query(`
    select grantee, privilege_type
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'engagement_events'
       and grantee in ('anon','authenticated','PUBLIC','service_role')
     order by grantee, privilege_type;
  `);
  console.log("\n── engagement_events table grants ──");
  console.table(tblGrants);

  const { rows: counts } = await client.query(`
    select (select count(*)::int from public.engagement_events) as events,
           (select count(*)::int from public.engagement_event_types) as registered_types;
  `);
  console.log("\ncounts:", counts[0]);

  await client.end();
}

main().catch((err) => {
  console.error("❌ fatal:", err);
  process.exit(1);
});
