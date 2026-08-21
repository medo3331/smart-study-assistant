/**
 * الصناديق الغامضة.
 *
 * ⚠️⚠️ **الصناديق مش في `CATALOG`، ومش بتتشترى بـ `purchase_item`.**
 * الصندوق مش عنصر بيتملّك — هو *عملية*: بتدفع، بتسحب، بتاخد عنصر أو
 * تعويض. لو حطّيناه في الكتالوج كان هيبقى صف في `shop_inventory` بلا
 * خانة تلبيس، و`purchase_item` كانت هترفض تانية شراية («العنصر ده معاك
 * بالفعل») لحد ما المستخدم يفتحه. فالصناديق في جدول لوحدها والدالة
 * `open_box` بتعمل الدفع والسحب والتمليك في معاملة واحدة.
 *
 * ── إزاي متأكدين إن الصناديق مش مضخة كوينز؟ ──
 * قاعدتين، والتانية بتتفحص في الداتابيز وقت التشغيل:
 *
 *  ١) **القيمة المتوقّعة أقل من السعر** في كل درجة (`boxEdge` تحت
 *     بتحسبها). يعني الصندوق مقامرة فيها ميل للبيت — مش طريقة كسب.
 *     الجاذبية إن `ذهبي` بـ ٢٦٠٠ ممكن يطلّع خرافي بـ ٥٣٣٣.
 *
 *  ٢) **أقصى تعويض ممكن في أي صندوق أقل من سعره** (`refundSafe` تحت).
 *     ودي أقوى من الأولى: مش «في المتوسط بتخسر» — بل **كل** فتحة
 *     بتخسر لو طلعت مكرر، من غير أي حساب احتمالات. `open_box` في
 *     db/shop.sql بترمي exception لو التعويض ≥ السعر، فلو حد عدّل رقم
 *     هنا وكسر القاعدة، الصندوق بيبطّل يفتح — مش بيسرّب كوينز بالسكوت.
 */

import type { Rarity } from "./rarity";
import { RARITIES } from "./rarity";

/**
 * تعويض المكرر بالكوينز، بالندرة.
 *
 * المستخدم اختار «يرجّع كوينز بدلها». الأرقام دي **جزء بسيط** من سعر
 * العنصر (تقريباً ١٥–٢٠٪) عن قصد: التعويض ترضية مش صفقة. لو التعويض
 * قرّب من السعر، الصندوق يبقى شبه صرّافة.
 */
export const REFUND: Record<Rarity, number> = {
  common: 20,
  uncommon: 50,
  rare: 110,
  epic: 220,
  legendary: 450,
  mythic: 1000,
};

export type BoxTier = {
  id: string;
  name: string;
  /** سطر واحد في الكارت */
  desc: string;
  price: number;
  /** أعلى ندرة ممكنة — للعرض في الكارت («لحد خارق») */
  top: Rarity;
  /**
   * أوزان السحب من ١٠٠٠٠. الندرة اللي مش مذكورة هنا **مستحيلة** في
   * الصندوق ده. المجموع لازم ١٠٠٠٠ — `oddsSane` بتتأكد.
   *
   * ⚠️ الوزن على **الندرة** مش على العنصر. الداتابيز بتقسّم وزن الندرة
   * على عدد عناصرها المؤهّلة، فإضافة عنصر أسطوري جديد بتقلّل فرصة كل
   * عنصر أسطوري لوحده وبتسيب فرصة «تطلّع أسطوري» زي ما هي.
   */
  odds: Partial<Record<Rarity, number>>;
};

/**
 * أربع درجات. الأسماء من عيلة الملزمة (ورق، حبر، فسفوري، ذهبي) مش
 * «برونزي/فضي/ذهبي» — نفس سبب إن الندرة بتاخد توكنز `--hl-*`.
 *
 * الأسعار مقيسة على متوسط أسعار العناصر المؤهّلة فعلاً في كل ندرة
 * (١٢٦ / ٢٧٢ / ٥٨٢ / ١١٧٥ / ٢٠٩٤ / ٥٣٣٣) — مش على منتصف النطاق، لأن
 * الخارق والخرافي أغلبهم مقفول بشرط فتح فمش داخل السحب.
 */
export const BOXES: readonly BoxTier[] = [
  {
    id: "box.paper",
    name: "صندوق ورق",
    desc: "أول تجربة — عادي أو غير شائع، وأحياناً نادر",
    price: 260,
    top: "rare",
    odds: { common: 6000, uncommon: 3000, rare: 1000 },
  },
  {
    id: "box.ink",
    name: "صندوق حبر",
    desc: "غير شائع مضمون، وفرصة أسطوري",
    price: 620,
    top: "epic",
    odds: { uncommon: 5500, rare: 3000, epic: 1500 },
  },
  {
    id: "box.highlight",
    name: "صندوق فسفوري",
    desc: "نادر مضمون، وفرصة خارق",
    price: 1200,
    top: "legendary",
    odds: { rare: 5500, epic: 3000, legendary: 1500 },
  },
  {
    id: "box.golden",
    name: "صندوق ذهبي",
    desc: "أسطوري مضمون، و١٥٪ خرافي",
    price: 2600,
    top: "mythic",
    odds: { epic: 5000, legendary: 3500, mythic: 1500 },
  },
];

const BY_ID = new Map(BOXES.map((b) => [b.id, b]));

export function boxById(id: string): BoxTier | undefined {
  return BY_ID.get(id);
}

export function isBoxId(id: string): boolean {
  return BY_ID.has(id);
}

/** أوزان الصندوق مرتّبة من الأعمّ للأندر — للعرض في «الاحتمالات» */
export function boxOdds(box: BoxTier): readonly { rarity: Rarity; odds: number }[] {
  return RARITIES.filter((r) => (box.odds[r] ?? 0) > 0).map((r) => ({
    rarity: r,
    odds: box.odds[r] as number,
  }));
}

/** نسبة مئوية بخانة عشرية واحدة بالكتير — «١٥٪» مش «١٥.٠٪» */
export function oddsPercent(odds: number): string {
  const pct = (odds / 10000) * 100;
  return Number.isInteger(pct) ? `${pct}` : pct.toFixed(1);
}

/* --------------------------------------------------------------------------
   فحوص التوازن — بتتنادى في التست وفي سكربت السييد
   -------------------------------------------------------------------------- */

/** مجموع أوزان كل صندوق = ١٠٠٠٠ بالظبط */
export function oddsSane(box: BoxTier): boolean {
  const sum = RARITIES.reduce((t, r) => t + (box.odds[r] ?? 0), 0);
  return sum === 10000;
}

/**
 * أقصى تعويض ممكن في الصندوق **أقل** من سعره.
 *
 * دي القاعدة اللي بتخلّي «افتح صناديق عشان تكسب كوينز» مستحيلة من غير
 * أي حساب احتمالات: أسوأ نتيجة (كله مكرر) بتخسر، وأحسن نتيجة بتاخد
 * عنصر. `open_box` بتفحص نفس الشرط في الداتابيز وقت التشغيل.
 */
export function refundSafe(box: BoxTier): boolean {
  const worst = Math.max(
    ...RARITIES.filter((r) => (box.odds[r] ?? 0) > 0).map((r) => REFUND[r]),
  );
  return worst < box.price;
}

/**
 * ميل البيت: `1 - القيمة المتوقّعة / السعر`. لازم يبقى موجب في كل درجة،
 * وإلا الصندوق بيضخّ كوينز في الاقتصاد.
 *
 * `avgPrice` بيتحقن من بره (من الكتالوج) عشان الحساب يبقى على العناصر
 * المؤهّلة الحقيقية مش على منتصف النطاق النظري.
 */
export function boxEdge(box: BoxTier, avgPrice: Record<Rarity, number>): number {
  const ev = RARITIES.reduce(
    (sum, r) => sum + ((box.odds[r] ?? 0) / 10000) * (avgPrice[r] ?? 0),
    0,
  );
  return 1 - ev / box.price;
}
