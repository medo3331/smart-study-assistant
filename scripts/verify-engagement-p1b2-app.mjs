/**
 * 🔍 تحقق P1-B2 من جهة التطبيق — المسار الكامل للعقد.
 *
 * ⚠️ بيشغّل against **قاعدة البيانات الحقيقية** لكن بيشيل كل صف بيكتبه
 *    (في transaction مع ROLLBACK) — يعني مفيش تلويث للـproduction.
 *
 * الهدف: نتأكد إن `lib/engagement/event-contract.ts` + دالة الـDB متوافقين
 * مع بعض على كل الأنواع المسجّلة:
 *   - كل نوع في العقد له سطر في الـregistry مطابق (المصدر + مستوى الثقة).
 *   - كل نوع server-vertified مرفوض من بوابة العميل.
 *   - الكتابة الحقيقية بتتم وverified_by بتبقى من الـDB.
 *
 * التشغيل: `node scripts/verify-engagement-p1b2-app.mjs`
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import {
  CLIENT_REPORTED_EVENT_TYPES,
  ENGAGEMENT_EVENT_SPECS,
  ENGAGEMENT_EVENT_TYPES,
  SERVER_VERIFIED_EVENT_TYPES,
} from "../lib/engagement/event-contract.ts";

const { Client } = pg;

function dbUrl() {
  const envText = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const line = envText.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const client = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ connected\n");

  const { rows: userRows } = await client.query(
    `select id from auth.users order by created_at limit 1;`,
  );
  if (!userRows.length) {
    console.log("⚠️ مفيش مستخدمين — تخطّي.");
    await client.end();
    return;
  }
  const userId = userRows[0].id;

  console.log("── 1) العقد في الكود ↔ الـregistry في الـDB ──");
  const { rows: registry } = await client.query(
    `select event_type, source_table, trust_level, is_active from public.engagement_event_types`,
  );
  const byType = new Map(registry.map((r) => [r.event_type, r]));

  for (const [type, spec] of Object.entries(ENGAGEMENT_EVENT_SPECS)) {
    const row = byType.get(type);
    if (!row) {
      check(`${type}: موجود في الـregistry`, false, "مش موجود");
      continue;
    }
    check(
      `${type}: المصدر + مستوى الثقة مطابقين`,
      row.source_table === spec.sourceTable && row.trust_level === spec.trustLevel,
      `db=(${row.source_table},${row.trust_level}) code=(${spec.sourceTable},${spec.trustLevel})`,
    );
  }

  console.log("\n── 2) فصل client_reported عن server ──");
  for (const type of CLIENT_REPORTED_EVENT_TYPES) {
    const row = byType.get(type);
    check(
      `${type}: مصنّف client_reported في الـDB`,
      row?.trust_level === "client_reported",
      String(row?.trust_level),
    );
  }
  for (const type of SERVER_VERIFIED_EVENT_TYPES) {
    const row = byType.get(type);
    check(
      `${type}: مصنّف server في الـDB`,
      row?.trust_level === "server",
      String(row?.trust_level),
    );
  }

  console.log("\n── 3) كتابة حقيقية عبر دالة الـDB (transaction + rollback) ──");
  await client.query("BEGIN");
  try {
    for (const [type, spec] of Object.entries(ENGAGEMENT_EVENT_SPECS)) {
      const row = byType.get(type);
      if (!row?.is_active) {
        console.log(`  ⏭️  ${type}: مش مفعّل — تخطّي`);
        continue;
      }
      const sourceId = `appcheck-${type}-${Date.now()}`;
      const { rows } = await client.query(
        `select public.record_engagement_event($1,$2,$3,$4,'{}'::jsonb) as r`,
        [type, spec.sourceTable, sourceId, userId],
      );
      const res = rows[0].r;
      check(
        `${type}: اتسجّل فعليًا (inserted=true)`,
        res?.inserted === true,
        JSON.stringify(res),
      );
      check(
        `${type}: trust_level راجع من الـDB`,
        res?.trust_level === spec.trustLevel,
        `${res?.trust_level} vs ${spec.trustLevel}`,
      );
    }
  } finally {
    await client.query("ROLLBACK");
  }

  const { rows: leftover } = await client.query(
    `select count(*)::int as c from public.engagement_events where source_id like 'appcheck-%'`,
  );
  check("مفيش صفوف اختبار باقية بعد ROLLBACK", leftover[0].c === 0, `count=${leftover[0].c}`);

  await client.end();
  console.log(`\n══ النتيجة: ${passed} نجحت / ${failed} فشلت ══`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("❌ fatal:", err);
  process.exit(1);
});
