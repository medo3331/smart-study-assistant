/**
 * 🔧 تطبيق P1-B2.2 (Smart Notes Feature Discovery) على قاعدة بيانات المشروع.
 *
 * 📌 idempotent: `IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT`.
 *
 * 🔒 DDL مضاف فقط: جدول catalog + جدول حالة الاكتشاف + 3 دوال + seed.
 *    مافيش DROP / DELETE / TRUNCATE، ومافيش لمس لـcoin_ledger / award_coins /
 *    profiles.xp / notifications.
 *
 * التشغيل: `node scripts/apply-engagement-p1b2-discovery.cjs`
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS = [
  "db/59-engagement-events-ingest.sql",   // يحدّث سجل أنواع الأحداث (feature_adopted…)
  "db/60-engagement-feature-discovery.sql",
];

async function main() {
  const envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const line = envText.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) {
    console.error("❌ DATABASE_URL missing from .env.local");
    process.exit(2);
  }
  const url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ connected");

  for (const rel of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
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

  const { rows: catalog } = await client.query(`
    select key, availability, is_discoverable, adoption_min_days, priority, is_active
      from public.feature_catalog order by priority, key;
  `);
  console.log("\n── feature_catalog ──");
  console.table(catalog);

  const { rows: fns } = await client.query(`
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prosecdef as security_definer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('record_feature_introduction',
                         'refresh_feature_discovery_state',
                         'get_feature_discovery_state')
     order by p.proname;
  `);
  console.log("\n── discovery functions ──");
  console.table(fns);

  const { rows: grants } = await client.query(`
    select routine_name, grantee, privilege_type
      from information_schema.role_routine_grants
     where routine_name in ('record_feature_introduction',
                            'refresh_feature_discovery_state',
                            'get_feature_discovery_state')
     order by routine_name, grantee;
  `);
  console.log("\n── execute grants ──");
  console.table(grants);

  const { rows: policies } = await client.query(`
    select tablename, policyname, cmd, roles
      from pg_policies
     where schemaname = 'public'
       and tablename in ('feature_catalog', 'user_feature_discovery')
     order by tablename, policyname;
  `);
  console.log("\n── policies ──");
  console.table(policies);

  const { rows: counts } = await client.query(`
    select (select count(*)::int from public.feature_catalog) as catalog,
           (select count(*)::int from public.user_feature_discovery) as discovery_rows;
  `);
  console.log("\ncounts:", counts[0]);

  await client.end();
}

main().catch((err) => {
  console.error("❌ fatal:", err);
  process.exit(1);
});
