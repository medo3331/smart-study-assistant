import { THEME_PACKS } from "./theme-packs";
import type { Rarity } from "./rarity";
import { RARITY, RARITIES } from "./rarity";
import type { Category, ShopItem, Slot, Unlock } from "./types";
import { CATEGORY } from "./types";

/**
 * كتالوج المتجر.
 *
 * ── التسعير ──
 * الأسعار مش مرمية. الكوينز بتيجي من المذاكرة بس، والمعدّل المتوقّع
 * لواحد منتظم ≈ ٥٠–٨٠ كوين في اليوم (شوف economy.ts). فالنطاقات هنا
 * مقيسة على **وقت** مش على رقم يبان حلو:
 *
 *   عادي      ٨٠–١٥٠     → يوم أو يومين
 *   غير شائع  ٢٠٠–٣٥٠    → أقل من أسبوع
 *   نادر      ٤٥٠–٧٠٠    → أسبوع لأسبوعين
 *   أسطوري    ٩٠٠–١٤٠٠   → تلات أسابيع
 *   خارق      ١٨٠٠–٢٦٠٠  → شهر تقريباً
 *   خرافي     ٤٠٠٠–٦٠٠٠  → شهرين، ودي المفروض تبان بعيدة
 *
 * `priceFor` بتاخد النطاق وتحدّد السعر من الندرة، فمستحيل يتسرّب عنصر
 * خرافي بـ ١٠٠ كوين بغلطة كتابة.
 */

const BANDS: Record<Rarity, readonly [number, number]> = {
  common: [80, 150],
  uncommon: [200, 350],
  rare: [450, 700],
  epic: [900, 1400],
  legendary: [1800, 2600],
  mythic: [4000, 6000],
};

/**
 * سعر داخل نطاق الندرة. `t` من ٠ لـ ١ بيحدد فين في النطاق (٠ = أرخص).
 * بيتقرّب لأقرب ١٠ عشان الأسعار تبقى مقروءة.
 */
function priceFor(rarity: Rarity, t = 0.5): number {
  const [lo, hi] = BANDS[rarity];
  const raw = lo + (hi - lo) * Math.min(1, Math.max(0, t));
  return Math.round(raw / 10) * 10;
}

/** بيتأكد إن السعر جوه نطاق ندرته — بيتنادى في التست */
export function priceInBand(item: ShopItem): boolean {
  if (item.price === 0) return true; // العناصر الافتراضية
  const [lo, hi] = BANDS[item.rarity];
  return item.price >= lo && item.price <= hi;
}

// ============================================================================
// الثيمات — ١٥
// ============================================================================

/**
 * الندرة هنا **مشتقّة مش مكتوبة**: الثيمات الغامقة أندر لأنها أصعب في
 * التنفيذ وأكتر تميّزاً، و«الحد الأدنى» عادي عن قصد — هو أقرب حاجة
 * للورقة الافتراضية فمينفعش يبقى غالي.
 */
const THEME_RARITY: Record<string, Rarity> = {
  minimal: "common",
  "ocean-blue": "common",
  forest: "uncommon",
  "coffee-shop": "uncommon",
  sunset: "uncommon",
  "ice-world": "rare",
  aurora: "rare",
  "purple-neon": "rare",
  midnight: "epic",
  retro: "epic",
  "dark-library": "epic",
  matrix: "legendary",
  cyberpunk: "legendary",
  galaxy: "legendary",
  golden: "mythic",
};

/**
 * الورقة الأصلية — أهم عنصر في القسم كله.
 *
 * `value: ""` معناها **شيل `data-pack` خالص**، يعني رجّع الملزمة زي ما هي
 * بـ `data-theme` بس. مجانية ومملوكة للكل من غير شرا.
 *
 * Why عنصر صريح مش حالة خاصة: من غيره الحساب الجديد يبقى «مفيش ثيم
 * ملبوس»، فمنطق التلبيس يحتاج فرع مخصوص للثيمات لوحدها، والمستخدم
 * ميعرفش يرجّع الشكل الأصلي بعد ما يشتري ثيم. وكل ده عشان نتجنّب سطر.
 * وكمان بتحافظ على شكل الموقع الحالي كافتراضي — مش بنغيّر حاجة على حد.
 */
const THEME_DEFAULT: ShopItem = {
  id: "theme.notebook",
  category: "theme",
  name: "الملزمة الأصلية",
  desc: "ورق الدفتر بالهامش الأحمر — الشكل الأساسي",
  rarity: "common",
  price: 0,
  value: "",
  unlock: null,
};

const THEME_ITEMS: ShopItem[] = THEME_PACKS.map((pack, i) => {
  const rarity = THEME_RARITY[pack.id] ?? "common";
  return {
    id: `theme.${pack.id}`,
    category: "theme" as Category,
    name: pack.name,
    desc: pack.desc,
    rarity,
    // الـ t بيتوزّع على الليستة فالثيمات في نفس الندرة مش كلها بنفس السعر
    price: priceFor(rarity, (i % 3) / 2),
    value: pack.id,
    unlock:
      pack.id === "golden"
        ? ({ kind: "streak", days: 30 } satisfies Unlock)
        : pack.id === "matrix"
          ? ({ kind: "sessions", count: 100 } satisfies Unlock)
          : null,
    featured: pack.id === "dark-library" || pack.id === "aurora",
  };
});

// ============================================================================
// الصور الرمزية — ١٥
// ============================================================================

/**
 * إيموجي مش صور. سببين: (١) مفيش مسار أصول للصور في المشروع، (٢)
 * `StudyPet.tsx` الموجود أصلاً بيستخدم إيموجي، فده اتساق مش تنازل.
 * الإيموجي كمان بيشتغل مع أي باليت من الـ١٥ لأنه مش متأثر بالتوكنز.
 */
const AVATARS: readonly (readonly [string, string, string, Rarity])[] = [
  ["owl", "🦉", "بومة الليل — للي بيذاكر بعد ١٢", "common"],
  ["cat", "🐱", "قطة الكتب", "common"],
  ["fox", "🦊", "تعلب ذكي", "common"],
  ["bee", "🐝", "نحلة مشغولة", "common"],
  ["turtle", "🐢", "بطيء وبيوصل", "uncommon"],
  ["dolphin", "🐬", "دولفين — أسرع تعلّم", "uncommon"],
  ["panda", "🐼", "باندا هادية", "uncommon"],
  ["wolf", "🐺", "ديب المذاكرة", "rare"],
  ["octopus", "🐙", "تمن إيدين تمن مواد", "rare"],
  ["lion", "🦁", "أسد", "rare"],
  ["unicorn", "🦄", "أحادي القرن", "epic"],
  ["dragon", "🐲", "تنين صغير", "epic"],
  ["phoenix", "🔥", "عنقاء — بيرجع بعد كل انقطاع", "legendary"],
  ["galaxy-brain", "🌌", "عقل مجرّة", "legendary"],
  ["crown", "👑", "التاج", "mythic"],
];

const AVATAR_ITEMS: ShopItem[] = AVATARS.map(([id, emoji, desc, rarity], i) => ({
  id: `avatar.${id}`,
  category: "avatar" as Category,
  name: desc.split(" — ")[0],
  desc,
  rarity,
  price: id === "owl" ? 0 : priceFor(rarity, (i % 4) / 3),
  value: emoji,
  unlock:
    id === "crown"
      ? ({ kind: "league", league: "legend" } satisfies Unlock)
      : id === "phoenix"
        ? ({ kind: "streak", days: 7 } satisfies Unlock)
        : /* 🏅 الأوسمة بتتكسب من `BossFight.tsx` — تحدي فصل بتكسبه.
             والتنين هو بالظبط شكل البوس اللي بتغلبه، فلبسه بعد تلات
             انتصارات معناه واضح من غير شرح. */
          id === "dragon"
          ? ({ kind: "badges", count: 3 } satisfies Unlock)
          : null,
  featured: id === "octopus",
}));
// ============================================================================
// الإطارات — ١٢
// ============================================================================

/**
 * الإطار = وصف CSS مش صورة، فبيتلوّن مع الباليت.
 * `value` هو اسم كلاس بيتعرّف في globals.css جوه `@layer components`
 * (`.frame-<value>`). ممنوع يتعرّف بره الطبقة — أي CSS بره الطبقات
 * بيكسب أي حاجة جواها فبتفسد الـ utilities.
 */
const FRAMES: readonly (readonly [string, string, string, Rarity])[] = [
  ["thin", "خط رفيع", "أبسط برواز — خط واحد", "common"],
  ["dashed", "متقطّع", "زي حدود دفتر الرسم", "common"],
  ["double", "مزدوج", "خطين", "common"],
  ["corners", "أركان", "أربع زوايا بس", "uncommon"],
  ["notebook", "ملزمة", "هامش أحمر زي الدفتر", "uncommon"],
  ["tape", "شريط لاصق", "كإن الصورة ملزوقة", "uncommon"],
  ["stitch", "خيط", "حرف مخيّطة", "rare"],
  ["glow", "هالة", "ضوء خفيف حوالين الصورة", "rare"],
  ["marker", "فسفوري", "الضربة الفسفورية كبرواز", "epic"],
  ["circuit", "دوائر", "خطوط لوحة إلكترونية", "epic"],
  ["laurel", "غار", "إكليل — للمتصدرين", "legendary"],
  ["prism", "منشور", "حدود بتتغيّر مع الحركة", "mythic"],
];

const FRAME_ITEMS: ShopItem[] = FRAMES.map(([id, name, desc, rarity], i) => ({
  id: `frame.${id}`,
  category: "frame" as Category,
  name,
  desc,
  rarity,
  price: id === "thin" ? 0 : priceFor(rarity, (i % 3) / 2),
  value: id,
  unlock:
    id === "laurel"
      ? ({ kind: "league", league: "diamond" } satisfies Unlock)
      : id === "prism"
        ? ({ kind: "badges", count: 10 } satisfies Unlock)
        : null,
  featured: id === "notebook",
}));

// ============================================================================
// الألقاب — ١٢
// ============================================================================

const TITLES: readonly (readonly [string, string, string, Rarity])[] = [
  ["beginner", "مبتدئ", "أول خطوة", "common"],
  ["curious", "فضولي", "بيسأل كتير", "common"],
  ["regular", "منتظم", "بيذاكر كل يوم", "uncommon"],
  ["night-owl", "بومة ليل", "المذاكرة بعد ١٢", "uncommon"],
  ["early-bird", "صحصاح", "المذاكرة قبل ٧", "uncommon"],
  ["marathoner", "ماراثوني", "جلسات طويلة", "rare"],
  ["unbroken", "مش بيقطع", "سلسلة طويلة", "rare"],
  ["problem-solver", "حلّال", "بيخلص التمارين", "epic"],
  ["mentor", "معلّم", "بيساعد غيره", "epic"],
  ["knowledge-king", "ملك المعرفة", "أعلى درجة", "legendary"],
  ["legend", "أسطورة", "دوري الأساطير", "legendary"],
  ["the-one", "الوحيد", "لقب واحد بس في كل حساب", "mythic"],
];

const TITLE_ITEMS: ShopItem[] = TITLES.map(([id, name, desc, rarity], i) => ({
  id: `title.${id}`,
  category: "title" as Category,
  name,
  desc,
  rarity,
  price: id === "beginner" ? 0 : priceFor(rarity, (i % 3) / 2),
  value: name,
  unlock:
    id === "unbroken"
      ? ({ kind: "streak", days: 30 } satisfies Unlock)
      : id === "knowledge-king"
        ? ({ kind: "sessions", count: 100 } satisfies Unlock)
        : id === "legend"
          ? ({ kind: "league", league: "legend" } satisfies Unlock)
          : /* «حلّال» = خلّص تمارين، والوسام بيتكسب من أسئلة تحدي الفصل.
               نفس المعنى، فالشرط ملزوق باللقب مش متحطوط عليه. */
            id === "problem-solver"
            ? ({ kind: "badges", count: 5 } satisfies Unlock)
            : null,
  featured: id === "night-owl",
}));
// ============================================================================
// الرفقاء — ١٠
// ============================================================================

/**
 * الرفيق مش نظام جديد — هو **جلد** فوق `StudyPet.tsx` الموجود.
 *
 * Why: الكمبوننت الموجود فيه بالفعل المنطق اللي الطلب بيوصفه — بيتفاعل
 * مع المذاكرة (`streak`)، وبيزعل من الانقطاع (`daysSinceLastActivity`)،
 * وبيتطوّر بالمستوى (`getPetStage`). لو عملنا رفقاء من الصفر كان هيبقى
 * منطقين للحاجة الواحدة، والقديم اللي شغّال هو اللي هيبوظ.
 *
 * فكل رفيق أربع إيموجي: مراحل التطوّر الأربع بنفس ترتيب `getPetStage`.
 * الافتراضي (`egg`) هو نفس إيموجي الكمبوننت الحالي بالحرف، فاللي معندهمش
 * رفيق مشتري مش هيلاحظوا أي فرق.
 *
 * ⚠️⚠️ المراحل مفصولة بـ `STAGE_SEP` **مش** ملزوقة. الشكل الملزوق
 * (`"🥚🐈🐈‍⬛🦁"`) مالوش قسمة صحيحة في جافاسكريبت: `split("")` بيقطّع
 * الأزواج البديلة، و`Array.from` بيقسّم بنقطة الكود مش بالحرف المرئي —
 * فـ 🐈‍⬛ (قطة + ZWJ + مربع) بتطلع تلات مداخل، والأربع مراحل بتبقى ستة
 * ومتزحلقة. `Intl.Segmenter` بيحلّها بس مش موجود في كل متصفح، والحل
 * اللي بيشتغل في كل مكان إن الداتا تبقى صريحة من الأول.
 */
const COMPANIONS: readonly (readonly [string, string, string, string, Rarity])[] = [
  ["egg", "الرفيق الأصلي", "🥚·🐥·🐲·🐉", "اللي معاك من الأول", "common"],
  ["cactus", "صبّارة", "🌱·🪴·🌵·🎋", "مبتموتش لو نسيتها يوم", "common"],
  ["slime", "سلايم", "💧·🫧·🌊·🌀", "بيكبر وبيتشكّل", "uncommon"],
  ["robot", "روبوت", "🔩·🤖·🦾·🛸", "بيتجمّع قطعة قطعة", "uncommon"],
  ["cat", "قطة", "🥚·🐈·🐈‍⬛·🦁", "من قطة لأسد", "rare"],
  ["bird", "طير", "🪺·🐦·🦅·🦚", "من عش لطاووس", "rare"],
  ["ghost", "شبح", "🫥·👻·🎃·💀", "بيبان أكتر لما تذاكر", "epic"],
  ["star", "نجمة", "✨·⭐·🌟·💫", "بتلمع بالمستوى", "epic"],
  ["dragon", "تنين", "🥚·🦎·🐉·🔥", "التطوّر الكامل", "legendary"],
  ["void", "الفراغ", "⚫·🌑·🌌·🕳️", "مفيش حد يعرف هو إيه", "mythic"],
];

const COMPANION_ITEMS: ShopItem[] = COMPANIONS.map(
  ([id, name, stages, desc, rarity], i) => ({
    id: `companion.${id}`,
    category: "companion" as Category,
    name,
    desc,
    rarity,
    price: id === "egg" ? 0 : priceFor(rarity, (i % 3) / 2),
    // أربع مراحل في نص واحد مفصولة بـ STAGE_SEP — `companionStages` تحت
    // هي اللي بتقسّمها، وهي المكان الوحيد اللي يعرف الشكل ده
    value: stages,
    unlock:
      id === "dragon" ? ({ kind: "level", level: 20 } satisfies Unlock) : null,
    featured: id === "slime",
  }),
);

// ============================================================================
// حِزم الصوت — ١٠
// ============================================================================

/**
 * ⚠️ ٨ أغسطس: الحزم دي **مش موصولة بمشغّل صوت**. هي عناصر مخزن بتتشرى
 * وبتتعرض وبس — مفيش أي كود بياخد `value` ويشغّله.
 *
 * قبل كده الستة الأولانية كانت بتقابل `SOUND_TRACKS` في
 * `app/dashboard/components/types.ts`. الليستة دي اتشالت واتبدلت
 * بالمكتبة الصوتية (`audio-library.ts`: قرآن + موسيقى + صوتيات
 * المستخدم)، فمفاتيح زي `rain` و`forest` و`white_noise` بقى مالهاش
 * مقابل في التطبيق.
 *
 * فلو حد جه يوصّل الحزم دي بالمشغّل: `value` هنا مش مفتاح صالح، لازم
 * الأول يتقرر الحزم تشاور على إيه في المكتبة الجديدة.
 *
 * الأربعة الأخيرة `value` بتاعهم بيبدأ بـ `synth:` — المقصود إنها
 * تتولّد بـ Web Audio في المتصفح من غير ملفات. برضه لسه مش متنفّذة.
 */
const SOUNDS: readonly (readonly [string, string, string, string, Rarity])[] = [
  ["lofi", "لو-فاي", "lofi", "بيت هادي للمذاكرة الطويلة", "common"],
  ["rain", "مطر", "rain", "مطر على شباك", "common"],
  ["waves", "موج", "waves", "بحر بعيد", "common"],
  ["forest", "غابة", "forest", "عصافير وشجر", "uncommon"],
  ["piano", "بيانو", "piano", "نوتات متفرّقة", "uncommon"],
  ["white_noise", "ضجيج أبيض", "white_noise", "بيغطّي كل حاجة", "uncommon"],
  ["brown", "ضجيج بنّي", "synth:brown", "أعمق من الأبيض وأقل إجهاد", "rare"],
  ["binaural", "نبض مزدوج", "synth:binaural", "٤٠ هرتز للتركيز", "rare"],
  ["singing-bowl", "جرس تبتي", "synth:bowl", "رنّة واحدة كل شوية", "epic"],
  ["deep-space", "فضاء", "synth:space", "همهمة سفينة", "legendary"],
];

const SOUND_ITEMS: ShopItem[] = SOUNDS.map(([id, name, value, desc, rarity], i) => ({
  id: `sound.${id}`,
  category: "sound" as Category,
  name,
  desc,
  rarity,
  price: id === "lofi" ? 0 : priceFor(rarity, (i % 3) / 2),
  value,
  unlock: null,
  featured: id === "brown",
}));
// ============================================================================
// الاحتفالات — ٩
// ============================================================================

/**
 * ⚠️ كل واحد فيهم لازم يحترم `prefers-reduced-motion`. المشروع فيه
 * `lib/useReducedMotion.ts` جاهز — الكمبوننت بينادي عليه وبيقع على
 * `pulse` (أهدى واحد) لو المستخدم طالب حركة أقل. مش اختيار: احتفال
 * بيرمي ٢٠٠ حتة على الشاشة لواحد عنده حساسية حركة ضرر حقيقي.
 */
const EFFECTS: readonly (readonly [string, string, string, Rarity])[] = [
  ["pulse", "نبضة", "الكارت بينبض مرة — أهدى احتفال", "common"],
  ["check", "علامة", "علامة صح بتترسم", "common"],
  ["confetti", "ورق ملوّن", "الكلاسيكي", "uncommon"],
  ["stamp", "ختم", "ختم «تم» بيتنزل على الورقة", "uncommon"],
  ["highlight", "تفسفير", "الضربة الفسفورية بتمسح السطر", "rare"],
  ["stars", "نجوم", "نجوم بتطلع من الزرار", "rare"],
  ["fireworks", "صواريخ", "ألعاب نارية", "epic"],
  ["page-turn", "قلب صفحة", "الصفحة بتتقلب زي الملزمة", "legendary"],
  ["supernova", "انفجار نجم", "الشاشة كلها", "mythic"],
];

const EFFECT_ITEMS: ShopItem[] = EFFECTS.map(([id, name, desc, rarity], i) => ({
  id: `effect.${id}`,
  category: "effect" as Category,
  name,
  desc,
  rarity,
  price: id === "pulse" ? 0 : priceFor(rarity, (i % 3) / 2),
  value: id,
  unlock:
    id === "supernova" ? ({ kind: "streak", days: 30 } satisfies Unlock) : null,
  featured: id === "highlight",
}));

// ============================================================================
// حصري المتجر اليومي — ٦
// ============================================================================

/**
 * العناصر دي **مش بتتباع في المتجر العادي إطلاقاً**. شرطها
 * `{ kind: "daily" }` وهو نوع مالوش تحقّق: `unlock_satisfied` في
 * الداتابيز و`unlockStatus` هنا الاتنين بيرجّعوا «مقفول» دايماً. الباب
 * الوحيد هو استثناء مكتوب صريح في `purchase_item` بيسأل جدول
 * `shop_daily`: واحد منهم بس بيلف كل يوم.
 *
 * ⚠️ الأقسام المختارة (صورة رمزية، لقب، رفيق) كلها **بيانات صافية** —
 * إيموجي ونص. مقصود: إضافة برواز أو صوت حصري كانت هتحتاج كلاس في
 * `globals.css` أو ملف صوت، وأي واحد فيهم ناقص = عنصر بيتشترى وبيبان
 * مكسور. دول مستحيل يكسروا حاجة.
 *
 * ⚠️ الأسعار غالية عن قصد (خرافي/خارق) — الحصري مش المفروض يكون أرخص
 * طريق لحاجة قوية، هو نفس السعر بندرة أصعب في اللقيان.
 */
const DAILY_ONLY: readonly (readonly [string, "avatar" | "title" | "companion", string, string, string, Rarity])[] = [
  ["avatar.eclipse", "avatar", "الخسوف", "🌘", "بيبان يوم واحد بس", "mythic"],
  ["avatar.comet", "avatar", "المذنّب", "☄️", "بيعدّي مرة كل فترة", "legendary"],
  ["title.chosen", "title", "المُختار", "المُختار", "لقب اليوم الواحد", "mythic"],
  ["title.wanderer", "title", "الرحّالة", "الرحّالة", "بيمرّ وبيمشي", "legendary"],
  ["companion.fox", "companion", "تعلب", "🍂·🦊·🔥·🌟", "بيلمع لما تكمّل", "legendary"],
  ["companion.moth", "companion", "فراشة الليل", "🥚·🐛·🦋·🌙", "بتذاكر بالليل", "mythic"],
];

const DAILY_ITEMS: ShopItem[] = DAILY_ONLY.map(
  ([id, category, name, value, desc, rarity], i) => ({
    id,
    category: category as Category,
    name,
    desc,
    rarity,
    price: priceFor(rarity, (i % 3) / 2),
    value,
    unlock: { kind: "daily" } satisfies Unlock,
  }),
);

// ============================================================================
// المفيدة — 3 منتجات Useful (Phase E)
// ============================================================================
/**
 * منتجات Useful تُباع بـ Coins وتُحفظ كـ entitlement/credits.
 * التسعير مقيس على BANDS و maxDailyCoins ≈ 300-400:
 *   Study Booster 2200 (legendary 1800-2600) — ميزة دائمة ≈ 5 أيام max / 30 يوم عادي
 *   AI Starter 650 (rare 450-700) — 6.5 coin/credit
 *   AI Power 2400 (legendary 1800-2600) — 4.8 coin/credit بخصم bulk ~26%
 * `metadata.useful` يُقرأ في السيرفر فقط — الكلاينت يرسل item_id فقط.
 */
const USEFUL_ITEMS: ShopItem[] = [
  {
    id: "useful.study-booster",
    category: "useful" as Category,
    name: "Study Booster",
    desc: "يفتح ميزة الدراسة المتقدمة بشكل دائم",
    rarity: "legendary",
    price: 2200,
    value: "advanced-study",
    unlock: null,
    featured: true,
    metadata: { useful: { type: "entitlement", kind: "feature", value: "advanced-study" } },
  },
  {
    id: "useful.ai-starter-pack",
    category: "useful" as Category,
    name: "AI Starter Pack",
    desc: "100 AI Credits — تُحفظ في رصيدك",
    rarity: "rare",
    price: 650,
    value: "100",
    unlock: null,
    featured: true,
    metadata: { useful: { type: "ai_credit", amount: 100 } },
  },
  {
    id: "useful.ai-power-pack",
    category: "useful" as Category,
    name: "AI Power Pack",
    desc: "500 AI Credits — حزمة كبيرة بخصم",
    rarity: "legendary",
    price: 2400,
    value: "500",
    unlock: null,
    featured: true,
    metadata: { useful: { type: "ai_credit", amount: 500 } },
  },
];

// ============================================================================
// الكتالوج المجمّع
// ============================================================================

/**
 * ⚠️ الصناديق (`box`) مش موجودة هنا عن قصد. المستخدم اختار «الأساس
 * الصلب الأول»، والصندوق ميكانيكا (فتح + سحب عشوائي + أنيميشن) مش عنصر
 * بيتلبس. القسم متعرّف في `types.ts` فالمتجر بيقدر يوريه «قريباً» من
 * غير ما حاجة تتغيّر لما يتنفّذ.
 */
export const CATALOG: readonly ShopItem[] = [
  THEME_DEFAULT,
  ...THEME_ITEMS,
  ...AVATAR_ITEMS,
  ...FRAME_ITEMS,
  ...TITLE_ITEMS,
  ...COMPANION_ITEMS,
  ...SOUND_ITEMS,
  ...EFFECT_ITEMS,
  ...DAILY_ITEMS,
  ...USEFUL_ITEMS,
];

/**
 * حصري المتجر اليومي — للعرض في قسم «الحصري» ولفحوص التوازن.
 * الفلترة على الشرط مش على مصفوفة منفصلة، فمستحيل عنصر يقع من القايمة.
 */
export const DAILY_EXCLUSIVES: readonly ShopItem[] = CATALOG.filter(
  (it) => it.unlock?.kind === "daily",
);

const BY_ID = new Map(CATALOG.map((it) => [it.id, it]));

export function itemById(id: string): ShopItem | undefined {
  return BY_ID.get(id);
}

export function itemsInCategory(c: Category): readonly ShopItem[] {
  return CATALOG.filter((it) => it.category === c);
}

/** الخانة اللي العنصر بيتلبس فيها — من قسمه */
export function slotOf(item: ShopItem): Slot | null {
  return CATEGORY[item.category].slot;
}

/** الفاصل بين مراحل الرفيق في `value` */
export const STAGE_SEP = "·";

/** مراحل الرفيق الافتراضية — نفس إيموجي `getPetStage` في StudyPet.tsx */
export const DEFAULT_STAGES: readonly [string, string, string, string] = [
  "🥚",
  "🐥",
  "🐲",
  "🐉",
];

/**
 * مراحل الرفيق الأربع من `value` — **دايماً أربعة بالظبط**.
 *
 * Why الطول مضمون: `getPetStage` في StudyPet.tsx عندها أربع درجات مستوى
 * وبتفهرس بالرقم. لو النص رجّع تلاتة، المستوى ١٥+ بياخد `undefined`
 * والرفيق بيختفي من غير خطأ — أسوأ أنواع الكسر. فالناقص بياخد من
 * الافتراضي والزيادة بتتقص هنا، مرة واحدة، مش عند كل نداء.
 */
export function companionStages(
  value: string,
): [string, string, string, string] {
  const parts = value
    .split(STAGE_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    parts[0] || DEFAULT_STAGES[0],
    parts[1] || DEFAULT_STAGES[1],
    parts[2] || DEFAULT_STAGES[2],
    parts[3] || DEFAULT_STAGES[3],
  ];
}

/**
 * العناصر المجانية — دي اللي كل حساب جديد بيلاقيها ملبوسة.
 * `shop-data.ts` بيستخدمها كافتراضي فمفيش حساب بيبان «فاضي».
 */
export const DEFAULT_ITEMS: readonly ShopItem[] = CATALOG.filter(
  (it) => it.price === 0,
);

/** إحصائية للعرض في رأس المتجر */
export function catalogCounts(): Record<Category | "all", number> {
  const out = { all: CATALOG.length } as Record<Category | "all", number>;
  for (const it of CATALOG) out[it.category] = (out[it.category] ?? 0) + 1;
  return out;
}

export { RARITY, RARITIES, BANDS, priceFor };

