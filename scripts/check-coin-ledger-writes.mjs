/**
 * حارس CI — أي insert كسب مباشر في coin_ledger خارج الملفات المصرّح بها
 * بيفشل. (C1 — docs/PHASE_0_ECONOMY_TRUTH_PLAN.md §P0-E)
 *
 * الـ allowlist: ملفات الاقتصاد الموحّدة + الملفات القديمة المعروفة
 * (المتدهّنة — ممنوع إعادة تشغيلها بعد db/113/114، وده مكتوب في هيدرها).
 * ملف جديد فيه insert كسب = لازم يمر من award_coins — الفحص ده بيمسكه.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dbDir = join(root, "db");

const ALLOWED = new Set([
  "113-economy-truth.sql", // النسخة canonical من award_coins
  "114-economy-route-writers.sql", // التحويلات + signup trigger — كل insert تحته bypass
  // الملفات التاريخية (deprecated — هيدرها بيقول ماتشغّلش بعد 113/114):
  "shop.sql",
  "43-retention-p0-streak.sql",
  "44-retention-phase-2-tiers.sql",
  "45-retention-phase-3-achievements.sql",
  "worship.sql",
  "economy-phase-4-foundation.sql",
  "gamification.sql",
  "break-zone.sql",
  "hotfix4-fix-signup-trigger.sql",
]);

let failures = 0;
for (const f of readdirSync(dbDir)) {
  if (!f.endsWith(".sql") || ALLOWED.has(f)) continue;
  const text = readFileSync(join(dbDir, f), "utf8");
  const hasDirectEarn = /insert\s+into\s+public\.coin_ledger[^;]*'earn'/i.test(text);
  if (hasDirectEarn) {
    console.error(`✗ db/${f}: فيه insert كسب مباشر في coin_ledger — الكسب بيمر من award_coins (db/113)`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\nفشل حارس coin_ledger: ${failures} ملف/ملفات.`);
  process.exit(1);
}
console.log("✓ حارس coin_ledger: مفيش كتابة كسب مباشرة خارج المسار المركزي.");
