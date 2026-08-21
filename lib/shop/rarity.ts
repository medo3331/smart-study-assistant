/**
 * درجات الندرة الست.
 *
 * القرار اللي المستخدم اختاره: **اللعبة بالحركة مش باللون.** يعني الندرة
 * مالهاش الحق تلوّن كارت بحاله ولا تحوّل المتجر لقوس قزح — ليها تلات
 * مساحات صغيرة بس: خط الكارت، الشريط اللي فوقه، والبادج. الورقة تفضل ورقة.
 *
 * وكل لون منهم **من توكنز الملزمة الموجودة** (`--hl-*`) مش ألوان جديدة،
 * فبيتبدّلوا لوحدهم مع أي باليت من الـ١٥ ومع فاتح/غامق. لو حطّينا hex
 * صريح هنا كان "أسطوري" هيبقى أصفر باهت على ثيم الذهبي وأسود على ماتريكس.
 */

export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;

export type Rarity = (typeof RARITIES)[number];

export type RarityMeta = {
  id: Rarity;
  /** الاسم في الواجهة */
  name: string;
  /**
   * توكن اللون. `fill` للشريط والبادج، و`ink` للنص عشان يقرا على الورق.
   * الاتنين من نفس العيلة فالبادج والنص مايتخالفوش.
   */
  fill: string;
  ink: string;
  /** ترتيب الفرز — أعلى = أندر */
  weight: number;
  /**
   * وزن السحب في الصناديق (من ١٠٠٠٠). مش مستخدم دلوقتي — الصناديق
   * مرحلة تانية — بس محسوب من الأول عشان التوازن مايتعملش على السريع
   * وقت التنفيذ.
   */
  odds: number;
};

export const RARITY: Record<Rarity, RarityMeta> = {
  // العادي مقصود إنه **مش ملوّن**: لو كل درجة ليها لون يبقى مفيش تمييز.
  common: {
    id: "common",
    name: "عادي",
    fill: "var(--ink-soft)",
    ink: "var(--ink-soft)",
    weight: 1,
    odds: 5000,
  },
  uncommon: {
    id: "uncommon",
    name: "غير شائع",
    fill: "var(--hl-green-fill)",
    ink: "var(--hl-green-ink)",
    weight: 2,
    odds: 2700,
  },
  rare: {
    id: "rare",
    name: "نادر",
    fill: "var(--hl-blue-fill)",
    ink: "var(--hl-blue-ink)",
    weight: 3,
    odds: 1500,
  },
  epic: {
    id: "epic",
    name: "أسطوري",
    fill: "var(--hl-purple-fill)",
    ink: "var(--hl-purple-ink)",
    weight: 4,
    odds: 600,
  },
  // الذهبي = الضربة الفسفورية نفسها، وهي هوية المشروع. مقصود إنها تبقى
  // درجة قبل الأخيرة عشان أنْدَر حاجة تبقى هي أغلى حاجة بصرياً كمان.
  legendary: {
    id: "legendary",
    name: "خارق",
    fill: "var(--hl-yellow-fill)",
    ink: "var(--hl-yellow-ink)",
    weight: 5,
    odds: 180,
  },
  mythic: {
    id: "mythic",
    name: "خرافي",
    fill: "var(--hl-red-fill)",
    ink: "var(--hl-red-ink)",
    weight: 6,
    odds: 20,
  },
};

/** ترتيب من الأندر للأعمّ — للفرز في المتجر والمخزن */
export const RARITY_DESC: readonly Rarity[] = [...RARITIES].reverse();

export function rarityMeta(r: Rarity): RarityMeta {
  return RARITY[r];
}

/**
 * مجموع الاحتمالات لازم يبقى ١٠٠٠٠ بالظبط.
 * بيتفحص في تست مش وقت التشغيل — عدّ ثابت في كل رندر مضيعة.
 */
export function oddsTotal(): number {
  return RARITIES.reduce((sum, r) => sum + RARITY[r].odds, 0);
}
