/* ⇩⇩ مولّد آلياً من scripts/palettes.py — متعدّلوش بالإيد ⇩⇩
   للتحديث: python scripts/palettes.py --ts > lib/shop/theme-packs.ts

   العيّنة (swatch) ترتيبها: [الصفحة، الكارت، الضربة، الحبر]
   وهي نفس القيم الموجودة في globals.css بالحرف، فمعاينة الثيم في
   المتجر بتوريه بجد مش تقريب. */

export type ThemePackId =
    "dark-library"
  | "midnight"
  | "retro"
  | "cyberpunk"
  | "matrix"
  | "galaxy"
  | "ocean-blue"
  | "forest"
  | "coffee-shop"
  | "sunset"
  | "golden"
  | "minimal"
  | "purple-neon"
  | "ice-world"
  | "aurora";

export type ThemePack = {
  id: ThemePackId;
  name: string;
  desc: string;
  /** غامقة؟ بتستخدم لفرز «ثيمات ليلية» ولـ color-scheme */
  dark: boolean;
  swatch: readonly [string, string, string, string];
};

export const THEME_PACKS: readonly ThemePack[] = [
  { id: "dark-library", name: "المكتبة الغامقة", desc: "أغلفة جلدية وكحلي هادي — مكتب بالليل", dark: true, swatch: ["#212B3D", "#29344B", "#E4C158", "#EDF1FA"] },
  { id: "midnight", name: "منتصف الليل", desc: "كحلي غامق بارد — سهرة خفيفة", dark: true, swatch: ["#252844", "#2E3156", "#618DE5", "#EDF1FA"] },
  { id: "retro", name: "ريترو", desc: "وردي رجعي — CRT وشريط كاسيت", dark: true, swatch: ["#3E212B", "#4D2935", "#E4AA58", "#EDF1FA"] },
  { id: "cyberpunk", name: "سايبربانك", desc: "نيون وردي على ليل — سايبر", dark: true, swatch: ["#3E212F", "#4C293A", "#58E4D8", "#EDF1FA"] },
  { id: "matrix", name: "ماتريكس", desc: "شاشة خضرا — وضع التركيز", dark: true, swatch: ["#192F19", "#1F3A1F", "#64E458", "#EDF1FA"] },
  { id: "galaxy", name: "المجرّة", desc: "سديم بنفسجي — الفضاء", dark: true, swatch: ["#322444", "#3C2D53", "#C665E6", "#EDF1FA"] },
  { id: "ocean-blue", name: "أزرق المحيط", desc: "مياه صافية — شطّ هادي", dark: false, swatch: ["#E6EBEF", "#F7F8F9", "#58C1E4", "#203B4E"] },
  { id: "forest", name: "الغابة", desc: "أوراق صباح — نسمة هواء", dark: false, swatch: ["#E4EDE9", "#F7F9F8", "#92E458", "#1A402D"] },
  { id: "coffee-shop", name: "القهوة", desc: "بنّي دافئ — مقهى الصباح", dark: false, swatch: ["#EFEAE6", "#F9F8F7", "#E4B558", "#49341E"] },
  { id: "sunset", name: "الغروب", desc: "أشعة الشفق — دفا آخر اليوم", dark: false, swatch: ["#EFEAE7", "#F9F8F7", "#E47B58", "#4D321F"] },
  { id: "golden", name: "الذهبي", desc: "ذهبي — ندرة عالية", dark: false, swatch: ["#EDEBE4", "#F9F8F7", "#E4C858", "#41371B"] },
  { id: "minimal", name: "الحد الأدنى", desc: "ورق أبيض نضيف — مفيش تشويش", dark: false, swatch: ["#E7EBF0", "#F7F8F9", "#589EE4", "#223A52"] },
  { id: "purple-neon", name: "النيون البنفسجي", desc: "قلم بنفسجي — مذاكرة تركيز", dark: false, swatch: ["#EFE8F1", "#F8F7F9", "#E458E4", "#50275E"] },
  { id: "ice-world", name: "العالم الجليدي", desc: "جليد صباح — نضارة", dark: false, swatch: ["#E5ECEE", "#F7F8F9", "#58D8E4", "#1D3C47"] },
  { id: "aurora", name: "الأورورا", desc: "تركواز — شفق قطبي", dark: false, swatch: ["#E5EDEE", "#F7F9F9", "#58E4AA", "#1A3E41"] },
];

export const THEME_PACK_IDS: readonly ThemePackId[] =
  THEME_PACKS.map((p) => p.id);

export function isThemePackId(v: string): v is ThemePackId {
  return THEME_PACK_IDS.includes(v as ThemePackId);
}
