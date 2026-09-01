/**
 * اقتصاد الكوينز — والدوريات.
 *
 * ⚠️ **الكوينز بتتكسب بالمذاكرة بس، ومفيش شرا بفلوس حقيقية إطلاقاً.**
 * مفيش دالة هنا بتزوّد الرصيد من غير مصدر مذاكرة، والداتابيز بتفرض ده
 * كمان (`db/shop.sql`: الإضافة بتمر من دالة `SECURITY DEFINER` بتقبل
 * مصادر معروفة بس). القاعدة دي مش قابلة للتفاوض.
 *
 * Phase A Architecture — فصل العملات (Currency Separation):
 *   XP   → Progression فقط — profiles.xp — اشتقاق Level/League عبر levelFromXp/leagueFromXp
 *   COINS → Store فقط — coin_ledger + coin_balance() — مصدر الحقيقة coin_source_rules
 *   AI_CREDITS / ENTITLEMENT / SUBSCRIPTION → NOT IMPLEMENTED (Future only)
 * القاعدة: XP ≠ Coins ≠ AI Credits ≠ Entitlements ≠ Subscription
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
  // ── Phase 4.0 Foundation — Signup + Daily Login ───────────────────────
  /** مكافأة التسجيل — مرة واحدة في العمر (ref = user_id عبر unique index) */
  signup_bonus: {
    id: "signup_bonus",
    label: "مكافأة التسجيل",
    amount: 20,
    live: true,
    dailyCap: 1,
  },
  daily_login: {
    id: "daily_login",
    label: "دخول اليوم",
    amount: 10,
    live: true,
    dailyCap: 1,
  },
  // ── Study & Activity ────────────────────────────────────────────────
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
  /* ⇩ مصادر العبادة — شغّالة عبر award_coins نفسها بعد توسعة التحقق في
     db/worship.sql. المبالغ دي مرايا لـ coin_source_rules (مصدر الحقيقة) —
     أي تعديل يتعمل في الاتنين معًا. سقف اليوم الكلي للعبادة = ٢٩ كوين. */
  worship_prayer: {
    id: "worship_prayer",
    label: "صلاة مفروضة",
    amount: 3,
    live: true,
    dailyCap: 5,
  },
  worship_quran: {
    id: "worship_quran",
    label: "هدف القرآن اليومي",
    amount: 5,
    live: true,
    dailyCap: 1,
  },
  worship_adhkar: {
    id: "worship_adhkar",
    label: "تصنيف أذكار مكتمل",
    amount: 3,
    live: true,
    dailyCap: 3,
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
// Phase A — Economy Architecture : Currency Separation & EconomyContext
export type EconomyCurrency = "XP" | "COINS";
export type FutureCurrency = "AI_CREDITS" | "ENTITLEMENT" | "SUBSCRIPTION";
export type AnyCurrency = EconomyCurrency | FutureCurrency;
export const CURRENCY_META = {
  XP: { purpose: "Progression", storage: "profiles.xp", status: "LIVE" as const },
  COINS: { purpose: "Store economy", storage: "coin_ledger (via coin_balance())", status: "LIVE" as const },
  AI_CREDITS: { purpose: "AI usage", storage: "NOT IMPLEMENTED", status: "FUTURE" as const },
  ENTITLEMENT: { purpose: "Model/feature unlock", storage: "NOT IMPLEMENTED", status: "FUTURE" as const },
  SUBSCRIPTION: { purpose: "Paid plan -> Entitlement", storage: "NOT IMPLEMENTED", status: "FUTURE" as const },
} as const;
export interface EconomyContext { userId: string; xp: number; level: number; league: League; streak: number; coins: number; badgeCount: number; sessions: number; }
export function createEconomyContext(args: { userId: string; xp: number; streak: number; coins: number; badgeCount: number; sessions: number; }): EconomyContext { return { userId: args.userId, xp: args.xp, level: levelFromXp(args.xp), league: leagueFromXp(args.xp), streak: args.streak, coins: args.coins, badgeCount: args.badgeCount, sessions: args.sessions }; }
export const getLevelFromXp = levelFromXp;
export const getLeagueFromXp = leagueFromXp;
export function xpInLevel(xp: number): number { const safe = Math.max(0, xp); return safe % XP_PER_LEVEL; }
export function xpProgressPercent(xp: number): number { return Math.round((xpInLevel(xp) / XP_PER_LEVEL) * 100); }
export function xpRemainingToNextLevel(xp: number): number { return XP_PER_LEVEL - xpInLevel(xp); }

// ---------------------------------------------------------------------------
// Phase B — Economy Hardening notes
// ---------------------------------------------------------------------------
// XP write authority انتقلت إلى RPC: increment_xp(p_delta) / award_xp(p_delta)
//   SECURITY DEFINER + auth.uid() + delta محدود (-500..200)
//   الكلاينت ممنوع من profiles.update({xp}) عبر trigger + RLS (db/economy-phase-b.sql)
// Badges: insert المباشر محذوف — الإنشاء عبر grant_badge(...) فقط

// ---------------------------------------------------------------------------
// Phase C — Reward Sources Consolidation
// ---------------------------------------------------------------------------
// المسار الموحد لإنهاء اليوم: complete_study_day(p_day_id)
//   يتحقق من الملكية + is_completed + يمنح XP (من xp_reward) + Coins (via award_coins) idempotent
// Badges: grant_badge الآن يتحقق من إثبات دراسة (يوم مكتمل) وحدود الفصل
// باقي المسارات (daily_missions, break, escape, worship, community_quiz) كانت
// بالفعل SECURITY DEFINER مع تحقق + idempotency، فتُركت كما هي.

// Lightweight RewardEvent abstraction — للتوثيق وتقليل التكرار، ليست جدولاً
export type RewardEvent = {
  source: string; // coin_source_rules.id أو 'study_day' للـ XP
  refId: string; // stable identity: study_day.id, planner_goal.id, badge config:chapter, etc.
  userId: string;
  xp?: number;
  coins?: number;
};
export function rewardEventId(source: string, refId: string): string {
  return `${source}:${refId}`;
}
// XP validation debt المتبقي بعد Phase C:
// - Boss XP ما زال يُمنح عبر increment_xp من الكلاينت (onWin) — سيُربط بالـ badge في Phase D
// - profiles.streak/last_study_day ما زال يُكتب من الكلاينت (تسريب 13 كوين/يوم)
// - XP_PER_LEVEL مكرر في db/shop.sql:200

// ---------------------------------------------------------------------------
// Phase D — Store Backend for Useful Products (Backend Infrastructure فقط)
// ---------------------------------------------------------------------------
// لا منتجات مفعلة، لا UI، لا AI Credits runtime، لا Model Unlocks runtime
// الجداول: entitlements + ai_credit_ledger — كلاهما Ledger/ grants عبر service_role فقط
// الرصيد = SUM(delta) مثل coin_ledger، والـ RLS قراءة فقط لصاحبها

export type Entitlement = {
  id: string;
  userId: string;
  kind: string;
  value: string;
  grantedAt: string;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AiCreditLedgerEntry = {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  refId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// CURRENCY_META يبقى كما هو — AI_CREDITS / ENTITLEMENT ما زالتا FUTURE
// التخزين الفعلي الآن موجود (entitlements, ai_credit_ledger) لكن غير موصول
// بالـ Store أو AI Router حتى Phase E/G. هذا مقصود.

// ---------------------------------------------------------------------------
// Phase 4.0 — Economy Foundation: Signup + Daily Login + Study Rewards
// ---------------------------------------------------------------------------
// Signup: +20 مرة واحدة (ref=user_id, unique index يمنع التكرار)
// Daily Login: +10 مرة/يوم (ref=UTC date, idempotent via unique index + daily cap)
// Study: day_done/goal_done/badge عبر complete_study_day / award_coins — موجودة ومثبتة
// Wheel eligibility: Successful Study Activity (complete_study_day success) → wheel_status.can_spin
//   لا يُحتسب مجرد فتح صفحة الدرس؛ الشرط هو ledger row لـ day_done/goal_done اليوم.
// Future: wheel/spin/weekly/store/AI — لا تُنفذ الآن، الموجود هو الأساس فقط.
