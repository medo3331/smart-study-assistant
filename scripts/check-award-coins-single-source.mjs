/**
 * حارس CI — award_coins لازم تكون معرّفة في db/113 بس (F1 في
 * docs/PHASE_0_ECONOMY_TRUTH_PLAN.md: كانت معرّفة في 5 ملفات والنسخة
 * الفعّالة تعتمد على آخر ملف اتشغّل). أي تعريف جديد بيفشل الفحص.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dbDir = join(root, "db");
const CANONICAL = "113-economy-truth.sql";

const re = /create\s+(or\s+replace\s+)?function\s+public\.award_coins\s*\(/i;

let failures = 0;
for (const f of readdirSync(dbDir)) {
  if (!f.endsWith(".sql")) continue;
  if (!re.test(readFileSync(join(dbDir, f), "utf8"))) continue;
  if (f === CANONICAL) continue;
  // الملفات القديمة المتدهّنة مسموح تعريفها تفضل قائم في السجل التاريخي —
  // لكن لازم هيدرها يحذّر إنها ممنوعة بعد 113/114 (آخر تعريف بيكتب فوق
  // النسخة الموحّدة ويرجّع فوضى النسخ).
  const firstLine = readFileSync(join(dbDir, f), "utf8").split("\n")[0];
  if (firstLine.includes("DEPRECATED بعد db/113")) continue;
  console.error(
    `✗ db/${f}: فيه تعريف لـ award_coins من غير هيدر Deprecation — النسخة الوحيدة الصالحة في db/${CANONICAL}`,
  );
  failures++;
}

if (failures > 0) {
  console.error(`\nفشل حارس award_coins: ${failures} تعريف خارج النسخة الموحّدة.`);
  process.exit(1);
}
console.log("✓ حارس award_coins: تعريف واحد بس (db/113).");
