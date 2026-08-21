/**
 * مولّد صفوف السييد لـ db/shop.sql.
 *
 * الأسعار ومبالغ الكسب لازم يبقوا نفسهم في مكانين: الـ TS (اللي الواجهة
 * بتقرا منه) والداتابيز (اللي دالة الشرا بتقرا منه). لو اتكتبوا مرتين
 * بالإيد هيفرقوا يوم ما حد يعدّل واحد وينسى التاني — والمستخدم يشوف سعر
 * ويتخصم منه سعر تاني.
 *
 * فالـ TS هو المصدر، والسكريبت ده بيحقن SQL بينهم بين علامتين.
 *
 *     node scripts/shop-seed.mjs           # يكتب في db/shop.sql
 *     node scripts/shop-seed.mjs --print   # يطبع بس
 *
 * ⚠️ بيقرا الـ TS بـ regex مش بـ import: الملفات فيها استيرادات بلا امتداد
 * (صح للباندلر، غلط لـ Node ESM) فتشغيلها في Node مباشرة بيفشل. التحقق
 * إن الأرقام اللي طلعت هي نفسها اللي في الـ TS بيحصل في الآخر بمقارنة
 * العدد والمجموع.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_PATH = join(root, "db", "shop.sql");

/**
 * الكتالوج والاقتصاد بيتقروا بتصريف الـ TS لـ JS وتشغيله — مش بـ regex.
 * الكتالوج مبني بـ map وشروط ternary، فأي regex عليه هيبقى مكسور من أول
 * تعديل. التصريف بيضمن إن اللي بنسيّده هو **بالظبط** اللي التطبيق شايفه.
 */
function loadFromTs() {
  const out = mkdtempSync(join(tmpdir(), "shopseed-"));
  execFileSync(
    "npx",
    ["tsc", "lib/shop/catalog.ts", "lib/shop/economy.ts",
     "lib/shop/boxes.ts", "lib/shop/wheel.ts",
     "--outDir", out, "--module", "es2022", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: root, stdio: "pipe" },
  );

  // استيرادات بلا امتداد صح للباندلر وغلط لـ Node ESM. بنصلّحها في النسخة
  // المصرّفة بس — الأصل مبيتلمسش.
  for (const f of ["catalog.js", "economy.js", "theme-packs.js", "rarity.js",
                   "types.js", "boxes.js", "wheel.js"]) {
    const p = join(out, f);
    try {
      writeFileSync(p, readFileSync(p, "utf8").replace(/from ["'](\.\/[a-z-]+)["']/g, 'from "$1.js"'));
    } catch { /* مش كل الملفات موجودة */ }
  }
  return { out };
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const nullable = (v) => (v === null || v === undefined ? "null" : v);

function buildSeed({ CATALOG, slotOf, COIN_SOURCES, LEAGUES, boxes, wheel }) {
  const L = [];

  L.push("-- قواعد مصادر الكسب — من COIN_SOURCES في lib/shop/economy.ts");
  L.push("insert into public.coin_source_rules (id, amount, daily_cap, is_live) values");
  const rules = Object.values(COIN_SOURCES).map(
    (s) => `  (${q(s.id)}, ${s.amount}, ${nullable(s.dailyCap)}, ${s.live})`,
  );
  L.push(rules.join(",\n"));
  L.push("on conflict (id) do update set");
  L.push("  amount = excluded.amount, daily_cap = excluded.daily_cap, is_live = excluded.is_live;");
  L.push("");

  L.push("-- الدوريات — من LEAGUES في lib/shop/economy.ts");
  L.push("insert into public.shop_leagues (id, min_xp, rank) values");
  L.push(LEAGUES.map((l, i) => `  (${q(l.id)}, ${l.minXp}, ${i})`).join(",\n"));
  L.push("on conflict (id) do update set min_xp = excluded.min_xp, rank = excluded.rank;");
  L.push("");

  // ⚠️ `rarity` نزلت الداتابيز عشان سحب الصناديق. من غيرها كان لازم
  // الكلاينت يبعت بركة السحب — يعني يبعت «اسحبلي من الخرافي».
  L.push(`-- الكتالوج — من CATALOG في lib/shop/catalog.ts (${CATALOG.length} عنصر)`);
  L.push("insert into public.shop_catalog (id, slot, price, unlock, rarity) values");
  L.push(
    CATALOG.map((it) => {
      const slot = slotOf(it);
      const unlock = it.unlock ? `${q(JSON.stringify(it.unlock))}::jsonb` : "null";
      return `  (${q(it.id)}, ${slot ? q(slot) : "null"}, ${it.price}, ${unlock}, ${q(it.rarity)})`;
    }).join(",\n"),
  );
  L.push("on conflict (id) do update set");
  L.push("  slot = excluded.slot, price = excluded.price, unlock = excluded.unlock,");
  L.push("  rarity = excluded.rarity;");
  L.push("");

  L.push(`-- الصناديق — من BOXES في lib/shop/boxes.ts (${boxes.BOXES.length} درجة)`);
  L.push("insert into public.shop_boxes (id, name, price, odds, ord) values");
  L.push(
    boxes.BOXES.map(
      (b, i) =>
        `  (${q(b.id)}, ${q(b.name)}, ${b.price}, ${q(JSON.stringify(b.odds))}::jsonb, ${i})`,
    ).join(",\n"),
  );
  L.push("on conflict (id) do update set");
  L.push("  name = excluded.name, price = excluded.price,");
  L.push("  odds = excluded.odds, ord = excluded.ord;");
  L.push("");
  L.push("delete from public.shop_boxes where id not in (");
  L.push("  " + boxes.BOXES.map((b) => q(b.id)).join(", "));
  L.push(");");
  L.push("");

  L.push("-- تعويض المكرر — من REFUND في lib/shop/boxes.ts");
  L.push("insert into public.shop_refunds (rarity, coins) values");
  L.push(
    Object.entries(boxes.REFUND).map(([r, c]) => `  (${q(r)}, ${c})`).join(",\n"),
  );
  L.push("on conflict (rarity) do update set coins = excluded.coins;");
  L.push("");

  L.push(`-- جوايز العجلة — من WHEEL_PRIZES في lib/shop/wheel.ts (${wheel.WHEEL_PRIZES.length} شريحة)`);
  L.push("insert into public.shop_wheel_prizes (id, label, coins, weight, ord) values");
  L.push(
    wheel.WHEEL_PRIZES.map(
      (p, i) => `  (${q(p.id)}, ${q(p.label)}, ${p.coins}, ${p.weight}, ${i})`,
    ).join(",\n"),
  );
  L.push("on conflict (id) do update set");
  L.push("  label = excluded.label, coins = excluded.coins,");
  L.push("  weight = excluded.weight, ord = excluded.ord;");
  L.push("");
  L.push("delete from public.shop_wheel_prizes where id not in (");
  L.push("  " + wheel.WHEEL_PRIZES.map((p) => q(p.id)).join(", "));
  L.push(");");
  L.push("");

  // ⚠️ العناصر اللي اتشالت من الكتالوج لازم تختفي من الجدول كمان، وإلا
  // تفضل قابلة للشرا بـ rpc مباشر بعد ما الواجهة تشيلها.
  L.push("-- عناصر اتشالت من الكتالوج — بتتشال من الجدول كمان");
  L.push("delete from public.shop_catalog where id not in (");
  L.push("  " + CATALOG.map((it) => q(it.id)).join(", "));
  L.push(");");

  return L.join("\n");
}

const { out } = loadFromTs();
const catalog = await import(new URL("file://" + join(out, "catalog.js")).href);
const economy = await import(new URL("file://" + join(out, "economy.js")).href);

const boxes = await import(new URL("file://" + join(out, "boxes.js")).href);
const wheel = await import(new URL("file://" + join(out, "wheel.js")).href);

/**
 * فحوص التوازن **قبل** الحقن.
 *
 * Why: الرقم الغلط في `boxes.ts` نوعه إن الصندوق يبقى مضخة كوينز. لو
 * السكريبت حقن وسكت، الكسر يوصل الداتابيز ومحدش يلاحظ غير لما الاقتصاد
 * يبوظ. فالسكريبت بيموت هنا والملف مبيتغيّرش.
 *
 * `open_box` بتفحص شرط التعويض تاني وقت التشغيل — الفحصين مقصودين:
 * ده بيمنع الكسر يوصل الملف، وده بيمنعه يشتغل لو وصل بأي طريقة تانية.
 */
function checkBalance() {
  const errs = [];

  // متوسط سعر العناصر **المؤهّلة للسحب فعلاً**: بسعر، وبلا شرط فتح.
  // المقفول مش بينزل من صندوق (وإلا الصندوق يتخطّى شرط الفتح)، فحسابه
  // في المتوسط كان هيدّي ميل بيت وهمي.
  const pool = catalog.CATALOG.filter((it) => it.price > 0 && !it.unlock);
  const avg = {};
  const cnt = {};
  for (const r of ["common", "uncommon", "rare", "epic", "legendary", "mythic"]) {
    const items = pool.filter((it) => it.rarity === r);
    cnt[r] = items.length;
    avg[r] = items.length
      ? Math.round(items.reduce((t, it) => t + it.price, 0) / items.length)
      : 0;
  }

  for (const b of boxes.BOXES) {
    if (!boxes.oddsSane(b)) errs.push(`${b.name}: مجموع الأوزان مش ١٠٠٠٠`);
    if (!boxes.refundSafe(b)) errs.push(`${b.name}: أقصى تعويض ≥ السعر — مضخة كوينز`);
    const edge = boxes.boxEdge(b, avg);
    if (edge <= 0) errs.push(`${b.name}: ميل البيت ${(edge * 100).toFixed(1)}% — سالب`);
    // ندرة موزونة ومفيش عنصر مؤهّل فيها = وزن ضايع، والسحب هيرجع أندر
    // من المعلن. الداتابيز بتوزّع الوزن على العناصر المؤهّلة فالصفر بيكسر.
    for (const [r, w] of Object.entries(b.odds)) {
      if (w > 0 && avg[r] === 0) errs.push(`${b.name}: وزن على «${r}» ومفيش عنصر مؤهّل`);
      /* ⚠️ ندرة موزونة بعنصر واحد مؤهّل = سحب معروف نتيجته مقدّماً، وبعد
         أول مرة كل ضربة في الندرة دي بترجّع تعويض. الفحص ده موجود
         تحديداً لأن **إضافة شرط فتح لعنصر بتشيله من السحب**: الخرافي
         نزل من ٣ لـ ٢ مؤهّل لما `frame.prism` اتقفل بشرط الأوسمة، فأي
         قفل تاني على خرافي بيوصل للحد. لو الرقم وصل ١، إمّا تفك شرط
         عنصر خرافي أو تضيف واحد جديد. */
      if (w > 0 && (cnt[r] ?? 0) === 1) {
        errs.push(`${b.name}: «${r}» فيها عنصر مؤهّل واحد بس — السحب مش عشوائي فعلياً`);
      }
    }
  }

  if (!wheel.wheelOddsSane()) errs.push("العجلة: مجموع الأوزان مش ١٠٠٠٠");
  const cheapest = Math.min(...boxes.BOXES.map((b) => b.price));
  if (!wheel.wheelCapSafe(cheapest))
    errs.push(`العجلة: أعلى جايزة ≥ أرخص صندوق (${cheapest})`);

  if (errs.length) {
    console.error("✗ فحوص التوازن فشلت — الملف مااتغيّرش:");
    for (const e of errs) console.error("  • " + e);
    process.exit(1);
  }
  return { avg, cheapest };
}

const { avg } = checkBalance();

const seed = buildSeed({
  CATALOG: catalog.CATALOG,
  slotOf: catalog.slotOf,
  COIN_SOURCES: economy.COIN_SOURCES,
  LEAGUES: economy.LEAGUES,
  boxes,
  wheel,
});

if (process.argv.includes("--print")) {
  console.log(seed);
  process.exit(0);
}

const sql = readFileSync(SQL_PATH, "utf8");
const B = "-- SEED:BEGIN";
const E = "-- SEED:END";
const i = sql.indexOf(B);
const j = sql.indexOf(E);

if (i < 0 || j < 0) {
  console.error(`✗ مفيش علامات ${B} / ${E} في db/shop.sql`);
  process.exit(1);
}

// الحقن idempotent: بيستبدل اللي بين العلامتين، فتشغيله ١٠ مرات = مرة.
writeFileSync(SQL_PATH, sql.slice(0, i + B.length) + "\n\n" + seed + "\n\n" + sql.slice(j));

const items = catalog.CATALOG.length;
const paid = catalog.CATALOG.filter((it) => it.price > 0).length;
console.log(`✓ اتحقن في db/shop.sql: ${items} عنصر (${paid} بسعر)، ` +
  `${Object.keys(economy.COIN_SOURCES).length} مصدر، ${economy.LEAGUES.length} دوري، ` +
  `${boxes.BOXES.length} صندوق، ${wheel.WHEEL_PRIZES.length} شريحة عجلة`);

for (const b of boxes.BOXES) {
  const edge = (boxes.boxEdge(b, avg) * 100).toFixed(1);
  console.log(`   ${b.name}: سعر ${b.price} · ميل البيت ${edge}%`);
}
console.log(`   العجلة: قيمة متوقعة ${wheel.wheelExpected().toFixed(1)} كوين للفة`);
