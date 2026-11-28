/**
 * اقتصاد الكوينز — والدوريات.
 *
 * ⚠️ **مسار الكسب واحد: award_coins** (db/113 — النسخة الموحّدة). مفيش
 * دالة هنا بتزوّد الرصيد من غير مصدر معروف، والداتابيز بتفرض ده كمان
 * (حارس db/114: أي كتابة كسب من غير app.coin_bypass بترفض).
 *
 * **عملات مش مكتسبة بالمذاكرة** (شراء بالفلوس / إعلانات / إداري —
 * قرارات D-M-01/D-M-05): بتدخل من المسار الداخلي `add_coins_grant`
 * (service_role فقط) بـ source_class منفصل — للطالب رصيد واحد زي ما هو.
 * التفعيل مع DEV-M4.
 *
 * Phase A Architecture — فصل العملات (Currency Separation):
 *   XP   → Progression فقط — profiles.xp — اشتقاق Level/League عبر levelFromXp/leagueFromXp
 *   COINS → Store فقط — coin_ledger + coin_balance() — مصدر الحقيقة coin_source_rules
 *   AI_CREDITS (Magic Credits) / ENTITLEMENT / SUBSCRIPTION → أنظمة مستقلة
 * القاعدة: XP ≠ Coins ≠ Magic Credits ≠ Entitlements ≠ Subscription
 */

/** ثابت المستويات — نفس القيمة المستخدمة في app/dashboard/achievements */
export const XP_PER_LEVEL = 200;

export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/**
 * عائد المرحلة الواحدة من الخطة — ١٥٠ XP (Phase 3).
 *
 * قبل كده كانت ١٠٠، وده كان بيخلّي نشاط جانبي واحد (كويز المجتمع، سقفه ١٥٠
 * في اليوم) يساوي مرحلة مذاكرة كاملة. المذاكرة لازم تكون أعلى عائد.
 *
 * ⚠️ السيرفر بيفرض نفس الأرضية في trigger `normalize_study_day_xp`
 *    (`db/45-retention-phase-3-achievements.sql`)، فالرقم ده للعرض والتوليد
 *    المحلي، ومش مصدر الحقيقة — القيمة الفعلية في `study_days.xp_reward`.
 */
export const STUDY_DAY_XP_REWARD = 150;

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
export type CoinSourceKind = "earn" | "oneTime" | "internal";
/** تصنيف مصدر العملة للتقارير المالية — مرآة source_class في db/113 */
export type CoinSourceClass = "study" | "games" | "activity";

export type CoinSource = {
  id: string;
  label: string;
  amount: number;
  live: boolean;
  /** سقف يومي — `null` معناها مفيش سقف (الأحداث اللي بطبيعتها مرة واحدة) */
  dailyCap: number | null;
  /** kind: earn = كسب يومي مسقوف · oneTime = مرة/عمر · internal = مسار داخلي
   *  (المبلغ بيتحدد في السيرفر، مش من القاعدة) */
  kind?: CoinSourceKind;
  sourceClass?: CoinSourceClass;
  /**
   * محطة سلسلة: مش كسب يومي عادي — بتتصرف يوم المحطة بس (٣/٧/٣٠).
   *
   * ⚠️ بتتستبعد من `maxDailyCoins()` عن قصد: الرقم ده هو أساس تسعير
   * الكتالوج، ودخول بونص متقطّع فيه بيخلّي التسعير غلط (بيوعد بكسب يومي
   * مش موجود). المبالغ بتتعدّل في `coin_source_rules` في
   * `db/44-retention-phase-2-tiers.sql`، والرقم هنا مرآة. */
  streakTier?: boolean;
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
    kind: "oneTime",
    sourceClass: "study",
  },
  daily_login: {
    id: "daily_login",
    label: "دخول اليوم",
    amount: 10,
    live: true,
    dailyCap: 1,
    sourceClass: "study",
  },
  // ── Study & Activity ────────────────────────────────────────────────
  day_done: {
    id: "day_done",
    label: "خلّصت يوم من الخطة",
    amount: 25,
    live: true,
    dailyCap: 3,
    sourceClass: "study",
  },
  goal_done: {
    id: "goal_done",
    label: "هدف من المخطط",
    amount: 10,
    live: true,
    dailyCap: 5,
    sourceClass: "study",
  },
  streak_day: {
    id: "streak_day",
    label: "يوم في السلسلة",
    amount: 8,
    live: true,
    dailyCap: 1,
    sourceClass: "study",
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
    sourceClass: "study",
  },
  perfect_week: {
    id: "perfect_week",
    label: "أسبوع كامل",
    amount: 120,
    live: true,
    dailyCap: 1,
    sourceClass: "study",
  },
  // ── Phase 2 — محطات السلسلة (Retention) ──────────────────────────────
  /* بتتصرف من `_streak_apply` لما الطالب يوصل اليوم ٣/٣٠ بالظبط — مش كل
     يوم. الـ XP المرافق (١٥ / ٢٠٠) مكتوب في الدالة نفسها، والواجهة بتقرا
     نفس الأرقام من `lib/retention/streak-tiers.ts`. */
  streak_tier_3: {
    id: "streak_tier_3",
    label: "بونص ٣ أيام",
    amount: 15,
    live: true,
    dailyCap: 1,
    streakTier: true,
    sourceClass: "study",
  },
  streak_tier_30: {
    id: "streak_tier_30",
    label: "بونص الشهر",
    amount: 250,
    live: true,
    dailyCap: 1,
    streakTier: true,
    sourceClass: "study",
  },
  // ── ألعاب البريك — G0-B: مصادر معتمدة بإثبات سيرفري (db/62 + db/113) ──
  /* قبل db/113 كانت المصادر دي بتنادى award_coins من غير فرع ولا قاعدة
     (F1/F3/F5 في docs/PHASE_0_ECONOMY_TRUTH_PLAN.md). escape_room = ٢٥
     (قرار D-1 — مش ٦٠). */
  break_riddle: {
    id: "break_riddle",
    label: "فزورة البريك",
    amount: 15,
    live: true,
    dailyCap: 1,
    sourceClass: "games",
  },
  break_riddle_fast: {
    id: "break_riddle_fast",
    label: "فزورة بريك سريعة (≤٥ د)",
    amount: 20,
    live: true,
    dailyCap: 1,
    sourceClass: "games",
  },
  break_game: {
    id: "break_game",
    label: "لعبة بريك",
    amount: 5,
    live: true,
    dailyCap: 2,
    sourceClass: "games",
  },
  escape_room: {
    id: "escape_room",
    label: "غرفة الهروب",
    amount: 25,
    live: true,
    dailyCap: 1,
    sourceClass: "games",
  },
  daily_mission: {
    id: "daily_mission",
    label: "مهمة يومية",
    amount: 5,
    live: true,
    dailyCap: 4,
    sourceClass: "games",
  },
  weekly_mission: {
    id: "weekly_mission",
    label: "مهمة أسبوعية",
    amount: 150,
    live: true,
    dailyCap: 1,
    sourceClass: "games",
  },
  // ── مصادر داخلية — المبلغ بيتحدد في السيرفر (db/113 _award_coins_variable) ──
  wheel: {
    id: "wheel",
    label: "عجلة الحظ",
    amount: 30,
    live: true,
    dailyCap: 1,
    kind: "internal",
    sourceClass: "games",
  },
  achievement: {
    id: "achievement",
    label: "إنجاز",
    /* المبلغ الحقيقي من achievements_catalog.coins (٣٠–٣٠٠) — الرقم هنا
       تمثيلي للسييد بس، والمسار المتغيّر هو اللي بيكتبه. */
    amount: 100,
    live: true,
    dailyCap: 1,
    kind: "internal",
    sourceClass: "study",
  },
  box_refund: {
    id: "box_refund",
    label: "تعويض صندوق مكرر",
    amount: 100,
    live: true,
    dailyCap: null,
    kind: "internal",
    sourceClass: "study",
  },
  // ⇩ مصادر DEV-M1 — المبلغ محسوب من التصميم المعتمد، والتوصيل لما يكون
  //   فيه إثبات سيرفري للحدث (نمط G0 proof). امتحان شامل = نطاق محمي
  //   (D-DEV-02) — الربط قرار فريق الامتحانات.
  lesson_quiz_passed: {
    id: "lesson_quiz_passed",
    label: "اختبار الدرس",
    amount: 5,
    live: false,
    dailyCap: 1,
    sourceClass: "study",
  },
  review_done: {
    id: "review_done",
    label: "مراجعة مكتملة",
    amount: 10,
    live: false,
    dailyCap: 1,
    sourceClass: "study",
  },
  exam_passed: {
    id: "exam_passed",
    label: "اختبار شامل",
    amount: 20,
    live: false,
    dailyCap: 1,
    sourceClass: "study",
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
    sourceClass: "activity",
  },
  worship_quran: {
    id: "worship_quran",
    label: "هدف القرآن اليومي",
    amount: 5,
    live: true,
    dailyCap: 1,
    sourceClass: "activity",
  },
  worship_adhkar: {
    id: "worship_adhkar",
    label: "تصنيف أذكار مكتمل",
    amount: 3,
    live: true,
    dailyCap: 3,
    sourceClass: "activity",
  },
} as const satisfies Record<string, CoinSource>;

/**
 * مصادر المنح — عملات مش مكتسبة بالمذاكرة (D-M-01 / D-M-05).
 * بتكتب من المسار الداخلي `add_coins_grant` (service_role فقط — db/113 §5)،
 * وsource_class بتاعها purchase/ads/admin. مش جزء من COIN_SOURCES عشان
 * ماتدخلش في حسابات الكسب اليومي ولا في سييد المتجر.
 * التفعيل الفعلي: DEV-M4 (شراء بالفلوس / إعلانات SSV).
 */
export const COIN_GRANT_SOURCES = ["purchase", "ad_reward", "admin_grant"] as const;
export type CoinGrantSourceId = (typeof COIN_GRANT_SOURCES)[number];

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
    // محطات السلسلة متقطّعة (يوم ٣/٧/٣٠) — مش كسب يومي، فمش داخلة في الأساس.
    // oneTime (signup) وinternal (wheel/achievement/box_refund) مش كسب يومي
    // كمان — تصحيح F6 من Phase 0 (كان بتحسب signup يوميًا وبتستبعد ٦ مصادر).
    .filter(
      (s) =>
        s.live &&
        !("streakTier" in s && s.streakTier) &&
        !("kind" in s && (s.kind === "oneTime" || s.kind === "internal")),
    )
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
// - ✅ profiles.streak/last_study_day بقوا سيرفر-أوثوريتاتيف (db/43-retention-p0-streak.sql):
//   _streak_apply هي الوحيدة اللي بتكتبهم، وtrigger protect_profiles_streak بيمنع الكلاينت.
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
// Daily Login: +10 مرة/يوم (ref = يوم القاهرة, idempotent via unique index + daily cap)
// Study: day_done/goal_done/badge عبر complete_study_day / award_coins — موجودة ومثبتة
// Wheel eligibility: Successful Study Activity (complete_study_day success) → wheel_status.can_spin
//   لا يُحتسب مجرد فتح صفحة الدرس؛ الشرط هو ledger row لـ day_done/goal_done اليوم.
// Future: wheel/spin/weekly/store/AI — لا تُنفذ الآن، الموجود هو الأساس فقط.
