/**
 * 🔍 تحقق P1-B2.2 من جهة التطبيق — تطابق العقد مع الكتالوج في الـDB.
 *
 * ⚠️ بيشتغل على القاعدة الحقيقية لكن بيشيل كل صف بيكتبه
 *    (transaction + ROLLBACK) ⇒ صفر تلويث.
 *
 * الهدف: نتأكد إن مرآة الكتالوج في الكود (`lib/engagement/feature-contract.ts`)
 *   بتطابق الكتالوج في الـDB — خصوصاً حالة Smart Notes (متاحة تحت التطوير)
 *   وإن Community Groups / Rewarded Ads مش قابلين للاكتشاف.
 *
 * التشغيل: `node --experimental-strip-types scripts/verify-engagement-p1b2-discovery-app.mjs`
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import {
  FEATURE_SPECS,
  isDiscoverableFeature,
  decideDiscoveryPresentation,
} from "../lib/engagement/feature-contract.ts";

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

  console.log("── 1) الكتالوج في الكود ↔ الكتالوج في الـDB ──");
  const { rows: catalog } = await client.query(
    `select key, label, route, availability, is_discoverable, adoption_min_days
       from public.feature_catalog`,
  );
  const byKey = new Map(catalog.map((r) => [r.key, r]));

  for (const [key, spec] of Object.entries(FEATURE_SPECS)) {
    const row = byKey.get(key);
    if (!row) {
      check(`${key}: موجود في الـDB`, false);
      continue;
    }
    check(
      `${key}: التطابق`,
      row.availability === spec.availability &&
        row.is_discoverable === spec.discoverable &&
        Number(row.adoption_min_days) === spec.adoptionMinDays &&
        (row.route ?? null) === spec.route,
      `db=(${row.availability},${row.is_discoverable},${row.adoption_min_days},${row.route}) ` +
        `code=(${spec.availability},${spec.discoverable},${spec.adoptionMinDays},${spec.route})`,
    );
  }

  console.log("\n── 2) قواعد الترويج ──");
  const { rows: undiscoverable } = await client.query(
    `select key from public.feature_catalog where is_discoverable = false`,
  );
  for (const row of undiscoverable) {
    const spec = FEATURE_SPECS[row.key];
    if (!spec) continue;
    check(
      `${row.key}: غير قابل للاكتشاف في الكود كمان`,
      isDiscoverableFeature(row.key) === false,
    );
  }

  const { rows: discoverable } = await client.query(
    `select key from public.feature_catalog where is_discoverable = true and availability in ('available','under_development')`,
  );
  for (const row of discoverable) {
    check(
      `${row.key}: قابل للاكتشاف في الكود كمان`,
      isDiscoverableFeature(row.key) === true,
    );
  }

  console.log("\n── 3) دورة الحالة عبر decision logic ──");
  const notesKey = "smart_notes";
  const intro = decideDiscoveryPresentation(notesKey, { state: "undiscovered", dismissCount: 0 });
  check("undiscovered ⇒ تعريف", intro.showIntro === true, JSON.stringify(intro));

  const introduced = decideDiscoveryPresentation(notesKey, { state: "introduced", dismissCount: 0 });
  check("introduced ⇒ من غير إعادة تعريف", introduced.showIntro === false, JSON.stringify(introduced));

  const tried = decideDiscoveryPresentation(notesKey, { state: "tried", dismissCount: 0 });
  check("tried ⇒ تلميح مش تعريف", tried.showTip === true && tried.showIntro === false, JSON.stringify(tried));

  const adopted = decideDiscoveryPresentation(notesKey, { state: "adopted", dismissCount: 0 });
  check("adopted ⇒ تلميح متقدم + بدون تكرار", adopted.showTip === true && adopted.shouldIntroduce === false, JSON.stringify(adopted));

  const dismissed = decideDiscoveryPresentation(notesKey, { state: "undiscovered", dismissCount: 3 });
  check("3 تجاهلات ⇒ صمت", dismissed.shouldIntroduce === false, JSON.stringify(dismissed));

  await client.end();
  console.log(`\n══ النتيجة: ${passed} نجحت / ${failed} فشلت ══`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("❌ fatal:", err);
  process.exit(1);
});
