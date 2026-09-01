import type { Rarity } from "./rarity";

/**
 * أنواع الكتالوج.
 *
 * القاعدة الحاكمة: **الخانة (slot) هي اللي بتحدد التلبيس** مش النوع.
 * كل خانة بيتلبس فيها عنصر واحد بس، والداتابيز بتفرض ده بـ unique index
 * على (user_id, slot). لو خلّينا التلبيس بالنوع كان لازم كل استعلام
 * يعرف قواعد كل نوع لوحده.
 */

export const CATEGORIES = [
  "theme",
  "avatar",
  "frame",
  "title",
  "companion",
  "sound",
  "effect",
  "box",
  "useful",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * الخانات القابلة للتلبيس. لاحظ إن `box` مش خانة — الصندوق بيتفتح
 * ويختفي، مبيتلبسش. وعشان كده `slot` نوعه منفصل عن `Category`.
 */
export const SLOTS = [
  "theme",
  "avatar",
  "frame",
  "title",
  "companion",
  "sound",
  "effect",
] as const;

export type Slot = (typeof SLOTS)[number];

export type CategoryMeta = {
  id: Category;
  name: string;
  /** جملة واحدة تحت اسم القسم في المتجر */
  lede: string;
  /** اسم أيقونة lucide — الاستيراد بيحصل في الكمبوننت مش هنا */
  icon: string;
  /** له خانة تلبيس؟ الصناديق لأ */
  slot: Slot | null;
};

export const CATEGORY: Record<Category, CategoryMeta> = {
  theme: {
    id: "theme",
    name: "الثيمات",
    lede: "تغيّر شكل الموقع كله — الورق والحبر والقلم",
    icon: "Palette",
    slot: "theme",
  },
  avatar: {
    id: "avatar",
    name: "الصور الرمزية",
    lede: "صورتك في المتصدرين وفي المجتمع",
    icon: "Smile",
    slot: "avatar",
  },
  frame: {
    id: "frame",
    name: "الإطارات",
    lede: "برواز حوالين صورتك",
    icon: "Frame",
    slot: "frame",
  },
  title: {
    id: "title",
    name: "الألقاب",
    lede: "سطر تحت اسمك",
    icon: "BadgeCheck",
    slot: "title",
  },
  companion: {
    id: "companion",
    name: "الرفقاء",
    lede: "كائن على لوحتك بيتفاعل مع مذاكرتك",
    icon: "PawPrint",
    slot: "companion",
  },
  sound: {
    id: "sound",
    name: "حِزم الصوت",
    lede: "خلفية صوتية للمذاكرة",
    icon: "Music",
    slot: "sound",
  },
  effect: {
    id: "effect",
    name: "الاحتفالات",
    lede: "اللي بيحصل لما تخلّص يوم أو تكسب",
    icon: "Sparkles",
    slot: "effect",
  },
  box: {
    id: "box",
    name: "الصناديق",
    lede: "عنصر عشوائي — والندرة على حسب الحظ",
    icon: "Gift",
    slot: null,
  },
  useful: {
    id: "useful",
    name: "المفيدة",
    lede: "ترقية و AI Credits — تُشترى وتُحفظ",
    icon: "Zap",
    slot: null,
  },
};

/**
 * شرط الفتح. `null` معناها معروض للبيع من أول يوم.
 *
 * Why نوع منفصل: الطلب فيه إنجازات بتفتح عناصر. لو خلّينا الشرط نص حر
 * كان كل مكان بيقراه هيفسّره بطريقته. هنا الشرط **بيانات** فالواجهة
 * بتقدر تعرض «فاضل ٣ أيام» من غير ما حد يكتب الجملة بالإيد.
 */
export type Unlock =
  | { kind: "streak"; days: number }
  | { kind: "sessions"; count: number }
  | { kind: "level"; level: number }
  | { kind: "league"; league: string }
  /**
   * أوسمة تحدي الفصل — **بالعدد** مش بمعرّف وسام معيّن.
   *
   * ⚠️ مش `badgeId` عن قصد: `badges.id` في db/pages.sql سطر ١٣٧ نوعه
   * `uuid default gen_random_uuid()`، يعني بيتولّد جديد لكل صف. أي معرّف
   * مكتوب في الكتالوج هنا مستحيل يطابق وسام حقيقي، فالعنصر كان هيقعد
   * مقفول للأبد. و`title` كمان مش ثابت — BossFight بيكتب
   * `منتصر على ${bossName}` واسم البوس جاي من بيانات الفصل.
   *
   * العدد هو الحاجة الوحيدة الثابتة والمفهومة للمستخدم: «اكسب ٣ أوسمة».
   */
  | { kind: "badges"; count: number }
  /**
   * حصري المتجر اليومي. **مالوش شرط يتحقق** — العنصر ده مقفول قفل دائم
   * في كل طريق غير إنه يلف في متجر اليوم.
   *
   * `unlock_satisfied` في الداتابيز بترجّع `false` للنوع ده دايماً،
   * و`unlockStatus` هنا بتعمل نفس الحاجة. الباب الوحيد هو استثناء مكتوب
   * صريح في `purchase_item` بيسأل جدول `shop_daily`. يعني لو الاستثناء
   * اتشال بالغلط، العنصر بيقعد مقفول — مش بيتفتح للكل.
   */
  | { kind: "daily" };

export type ShopItem = {
  id: string;
  category: Category;
  name: string;
  /** وصف قصير — سطر واحد في الكارت */
  desc: string;
  rarity: Rarity;
  /** السعر بالكوينز. صفر = مجاني (العناصر الافتراضية) */
  price: number;
  /**
   * محتوى العنصر: معرّف الباليت للثيم، إيموجي للصورة الرمزية، مفتاح
   * التراك للصوت... الواجهة بتفسّره على حسب `category`.
   */
  value: string;
  /** شرط لازم يتحقّق قبل الشرا. `null` = متاح دايماً */
  unlock: Unlock | null;
  /** بيبان في «المميزة» — الاختيار تحريري مش عشوائي */
  featured?: boolean;
  /** بيانات إضافية للمفيدة — لا تُستخدم للـ cosmetic */
  metadata?: Record<string, unknown>;
};
