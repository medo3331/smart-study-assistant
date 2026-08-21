/**
 * اقتصاد الكوينز — والدوريات.
 *
 * ⚠️ **الكوينز بتتكسب بالمذاكرة بس، ومفيش شرا بفلوس حقيقية إطلاقاً.**
 * مفيش دالة هنا بتزوّد الرصيد من غير مصدر مذاكرة، والداتابيز بتفرض ده
 * كمان (`db/shop.sql`: الإضافة بتمر من دالة `SECURITY DEFINER` بتقبل
 * مصادر معروفة بس). القاعدة دي مش قابلة للتفاوض.
 */

/** ثابت المستويات — نفس القيمة المستخدمة في app/dashboard/achievements */
export const XP_PER_LEVEL = 200;

export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

// ============================================================================
// مصادر الكوينز
// ============================================================================

/**
 * كل مصدر ممكن. `source` بيتخزّن **نص** في السجل، فالمصادر الجديدة
 * (غرفة الهروب، عجلة الحظ، ترقية الدوري) بتتوصّل بعدين من غير migration.
 *
 * اللي متوصّل فعلاً دلوقتي معلّم بـ `live: true` — واللي لأ موجود عشان
 * المبالغ تبقى متوازنة من الأول مش مرتجلة وقت التوصيل.
 */
export type CoinSource = {
  id: string;
  label: string;
  amount: number;
  live: boolean;
  /** سقف يومي — `null` معناها مفيش سقف (الأحداث اللي بطبيعتها مرة واحدة) */
  dailyCap: number | null;
};

export const COIN_SOURCES = {
  day_done: {
    id: "day_done",
    label: "خلّصت يوم من الخطة",
    amount: 25,
    live: true,
    dailyCap: 3,
  },
  goal_done: {
    id: "goal_done",
    label: "هدف من المخطط",
    amount: 10,
    live: true,
    dailyCap: 5,
  },
  daily_login: {
    id: "daily_login",
    label: "دخول اليوم",
    amount: 5,
    live: true,
    dailyCap: 1,
  },
  streak_day: {
    id: "streak_day",
    label: "يوم في السلسلة",
    amount: 8,
    live: true,
    dailyCap: 1,
  },
  /* ⚠️ السقف مش تجميلي. مصدر شغّال بسقف `null` = حنفية كوينز مفتوحة:
     `while(true) rpc('award_coins',{p_source:'badge'})` من الكونسول كان
     بيجيب ٤٠ كوين كل نداء بلا حدود. الحماية بقت طبقتين — السقف ده،
     والفهرس الفريد على (user_id, source, ref_id) في db/shop.sql.
     ⛔ ماتخليش أي مصدر `live: true` بسقف `null`. */
  badge: {
    id: "badge",
    label: "وسام جديد",
    amount: 40,
    live: true,
    dailyCap: 3,
  },
  perfect_week: {
    id: "perfect_week",
    label: "أسبوع كامل",
    amount: 120,
    live: true,
    dailyCap: 1,
  },
  // ⇩ مصادر لسه ما اتبنتش — المبلغ محسوب، والتوصيل بعدين
  escape_room: {
    id: "escape_room",
    label: "غرفة الهروب",
    amount: 60,
    live: false,
    dailyCap: 1,
  },
  wheel: {
    id: "wheel",
    label: "عجلة الحظ",
    amount: 30,
    live: false,
    dailyCap: 1,
  },
  league_promo: {
    id: "league_promo",
    label: "ترقية دوري",
    amount: 200,
    // سقف ١ رغم إن الترقية بطبيعتها مابتتكررش: `live` بيتقلب لـ true
    // بضغطة، والسقف بيمنع إن التقليبة دي تفتح حنفية ٢٠٠ كوين للنداء.
    live: false,
    dailyCap: 1,
  },
} as const satisfies Record<string, CoinSource>;

export type CoinSourceId = keyof typeof COIN_SOURCES;

export function isCoinSource(v: string): v is CoinSourceId {
  return Object.prototype.hasOwnProperty.call(COIN_SOURCES, v);
}

/**
 * أقصى كسب في اليوم من المصادر الشغّالة.
 *
 * ده الرقم اللي **أسعار الكتالوج مقيسة عليه**، فأي تعديل على المبالغ فوق
 * لازم يتراجع مع `BANDS` في catalog.ts. التست بيتأكد إن أغلى عنصر
 * (خرافي، ٦٠٠٠) بيحتاج بين شهر وتلاتة — لا يوم ولا سنة.
 */
export function maxDailyCoins(): number {
  return Object.values(COIN_SOURCES)
    .filter((s) => s.live)
    .reduce((sum, s) => sum + s.amount * (s.dailyCap ?? 1), 0);
}

/** معدّل واقعي لواحد منتظم — مش بيعمل كل حاجة كل يوم */
export function typicalDailyCoins(): number {
  const c = COIN_SOURCES;
  return c.day_done.amount + c.goal_done.amount * 2 + c.daily_login.amount + c.streak_day.amount;
}

// ============================================================================
// الدوريات
// ============================================================================

/**
 * الدوري **مشتق من الـ XP**، مش عمود في الداتابيز.
 *
 * Why: مفيش نظام دوريات في المشروع (بحثت، مفيش ولا نتيجة). عمود جديد
 * معناه مكان تاني يتعتّق ويختلف مع الـ XP. الاشتقاق معناه إنه صح دايماً.
 * ولو اتبنى نظام دوريات حقيقي بأسابيع وترقية، الأسماء دي تفضل هي هي.
 */
export type League = {
  id: string;
  name: string;
  minXp: number;
  /** إيموجي — بيبان في الشريط العلوي جانب الرصيد */
  icon: string;
};

export const LEAGUES: readonly League[] = [
  { id: "wood", name: "الخشب", minXp: 0, icon: "🪵" },
  { id: "bronze", name: "البرونز", minXp: 400, icon: "🥉" },
  { id: "silver", name: "الفضة", minXp: 1200, icon: "🥈" },
  { id: "gold", name: "الذهب", minXp: 2800, icon: "🥇" },
  { id: "diamond", name: "الألماس", minXp: 6000, icon: "💎" },
  { id: "legend", name: "الأساطير", minXp: 12000, icon: "👑" },
];

export function leagueFromXp(xp: number): League {
  let out = LEAGUES[0];
  for (const l of LEAGUES) if (xp >= l.minXp) out = l;
  return out;
}

/** الدوري الجاي والناقص للوصول له — `null` لو في الأعلى */
export function nextLeague(xp: number): { league: League; xpNeeded: number } | null {
  const up = LEAGUES.find((l) => xp < l.minXp);
  return up ? { league: up, xpNeeded: up.minXp - xp } : null;
}

/** ترتيب الدوري — للمقارنة في شروط الفتح */
export function leagueRank(id: string): number {
  const i = LEAGUES.findIndex((l) => l.id === id);
  return i < 0 ? -1 : i;
}

/** هل المستخدم وصل الدوري المطلوب؟ */
export function hasLeague(xp: number, required: string): boolean {
  return leagueRank(leagueFromXp(xp).id) >= leagueRank(required);
}
