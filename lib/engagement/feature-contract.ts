// lib/engagement/feature-contract.ts
//
// P1-B2.2 — Smart Notes Feature Discovery (الجزء الخالص / pure).
//
// ── دورة الاكتشاف ───────────────────────────────────────────────────────────
//   undiscovered → introduced → tried → adopted
//     • undiscovered : لسه معرفش الميزة.
//     • introduced   : عُرض له تعريف (حدث من السيرفر) — من غير تكرار لنفس
//                      الإعلان.
//     • tried        : نفّذ فعلًا حقيقيًا (حفظ نوتة) — مش مجرد فتح.
//     • adopted      : استخدام على **أيام كايرو مختلفة** (مش تكرار الحدث).
//
// ── قواعد Trust (مهمة) ─────────────────────────────────────────────────────
//   • `tried` بيتشتق في الـDB من وجود حدث موثّق — مش من طلب العميل.
//   • Smart Notes نفسه `client_reported` (الحفظ محلي/من المتصفح)، فالتشديد
//     (adopted) بيحصل في الطبقة الأعلى: إثبات **المكافأة** يقبل
//     `server_verified` بس — مفيش مكافآت في هذه المرحلة أصلًا.
//   • `adopted` = أيام كايرو مختلفة ⇒ إعادة إرسال نفس الحدث لا
//     تُحتسب استخدامًا متكررًا.
//
// ⚠️ ممنوع في هذه المرحلة: Coins، XP، Daily/Weekly Missions، Push.

/* ==========================================================================
   ١) حالات الاكتشاف
   ========================================================================== */

export const FEATURE_DISCOVERY_STATES = [
  "undiscovered",
  "introduced",
  "tried",
  "adopted",
] as const;

export type FeatureDiscoveryState = (typeof FEATURE_DISCOVERY_STATES)[number];

/** ترتيب الأسبقية — أعلى رقم = حالة أقوى. */
const STATE_RANK: Record<FeatureDiscoveryState, number> = {
  undiscovered: 0,
  introduced: 1,
  tried: 2,
  adopted: 3,
};

/** أعلى حالة تقدر تُرجَع (لمنع التراجع). */
export function strongestDiscoveryState(
  a: FeatureDiscoveryState,
  b: FeatureDiscoveryState,
): FeatureDiscoveryState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

/* ==========================================================================
   ٢) المميزات (مرآة لـpublic.feature_catalog)
   ========================================================================== */

export type FeatureAvailability =
  | "available"
  | "under_development"
  | "unavailable"
  | "planned";

export const FEATURE_KEYS = {
  SMART_NOTES: "smart_notes",
  SMART_EXAM: "smart_exam",
  MAGIC_AI: "magic_ai",
  LECTURES: "lectures",
  PLANNER: "planner",
  GAMES: "games",
  COMMUNITY_GROUPS: "community_groups",
  REWARDED_ADS: "rewarded_ads",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export type FeatureSpec = {
  label: string;
  route: string | null;
  availability: FeatureAvailability;
  /** هل تدخل في دورة Discovery؟ */
  discoverable: boolean;
  /** نص التعريف. */
  discoveryCopy: string | null;
  /** نص التلميح بعد التبنّي. */
  tipCopy: string | null;
  /** عدد أيام كايرو المختلفة اللي تُعتبر تبنّيًا. */
  adoptionMinDays: number;
};

/**
 * مرآة الكتالوج في الكود.
 * ⚠️ الكتالوج في الـDB هو المرجع النهائي؛ القيم دي بتتظبط معاه.
 */
export const FEATURE_SPECS: Record<FeatureKey, FeatureSpec> = {
  [FEATURE_KEYS.SMART_NOTES]: {
    label: "النوتس الذكية",
    route: "/notes",
    availability: "under_development",
    discoverable: true,
    discoveryCopy: "تعرف إنك تقدر تكتب وترسم وتجمع صور محاضرتك في نوتة واحدة؟",
    tipCopy: "جرّب تتبّع نقطة ضعف واحدة في نوتة، واربطها بالمحاضرة نفسها.",
    adoptionMinDays: 3,
  },
  [FEATURE_KEYS.SMART_EXAM]: {
    label: "الامتحانات الذكية",
    route: "/exams",
    availability: "available",
    discoverable: false,
    discoveryCopy: null,
    tipCopy: null,
    adoptionMinDays: 3,
  },
  [FEATURE_KEYS.MAGIC_AI]: {
    label: "المساعد الذكي",
    route: "/chat",
    availability: "available",
    discoverable: false,
    discoveryCopy: null,
    tipCopy: null,
    adoptionMinDays: 3,
  },
  [FEATURE_KEYS.LECTURES]: {
    label: "المحاضرات",
    route: "/lectures",
    availability: "available",
    discoverable: false,
    discoveryCopy: null,
    tipCopy: null,
    adoptionMinDays: 3,
  },
  [FEATURE_KEYS.PLANNER]: {
    label: "التخطيط والأهداف",
    route: "/dashboard/planner",
    availability: "available",
    discoverable: false,
    discoveryCopy: null,
    tipCopy: null,
    adoptionMinDays: 3,
  },
  [FEATURE_KEYS.GAMES]: {
    label: "الألعاب",
    route: "/break",
    availability: "available",
    discoverable: false,
    discoveryCopy: null,
    tipCopy: null,
    adoptionMinDays: 3,
  },
  [FEATURE_KEYS.COMMUNITY_GROUPS]: {
    label: "مجموعات المجتمع",
    route: null,
    availability: "unavailable",
    discoverable: false,
    discoveryCopy: null,
    tipCopy: null,
    adoptionMinDays: 3,
  },
  [FEATURE_KEYS.REWARDED_ADS]: {
    label: "إعلانات مكافأة",
    route: null,
    availability: "planned",
    discoverable: false,
    discoveryCopy: null,
    tipCopy: null,
    adoptionMinDays: 3,
  },
};

/** المميزات اللي ينفع تظهر في Discovery فعلًا (متاحة + قابلة للاكتشاف). */
export function isDiscoverableFeature(key: FeatureKey): boolean {
  const spec = FEATURE_SPECS[key];
  if (!spec) return false;
  if (!spec.discoverable) return false;
  return spec.availability === "available" || spec.availability === "under_development";
}

/* ==========================================================================
   ٣) قواعد العرض (متى نقول إيه)
   ========================================================================== */

export type DiscoveryPresentation = {
  /** ينفع نعرض التعريف؟ */
  shouldIntroduce: boolean;
  /** نعرض النص التعريفي؟ */
  showIntro: boolean;
  /** نعرض النص التعريفي؟ */
  showTip: boolean;
  /** سبب القرار (للوج/التشخيص). */
  reason:
    | "unavailable"
    | "not_discoverable"
    | "already_adopted"
    | "already_tried"
    | "already_introduced"
    | "dismissed_too_often"
    | "introduce";
};

export type DiscoveryDecisionInput = {
  state: FeatureDiscoveryState;
  /** عدد مرات التجاهل. */
  dismissCount: number;
  /** الحد الأقصى للتجاهل قبل静音. */
  maxDismissCount?: number;
};

/**
 * يقرر الشكل المناسب للحالة الحالية.
 *
 * ⚠️ اكتشاف الميزة **مش إجبار**: بيقرر يعرض ولا مايعرضش — مفيش قفل على
 *    الميزة، ومفيش إزعاج.
 */
export function decideDiscoveryPresentation(
  key: FeatureKey,
  input: DiscoveryDecisionInput,
): DiscoveryPresentation {
  const spec = FEATURE_SPECS[key];
  const maxDismiss = input.maxDismissCount ?? 3;

  if (!spec) {
    return {
      shouldIntroduce: false,
      showIntro: false,
      showTip: false,
      reason: "not_discoverable",
    };
  }
  if (spec.availability === "unavailable" || spec.availability === "planned") {
    return {
      shouldIntroduce: false,
      showIntro: false,
      showTip: false,
      reason: "unavailable",
    };
  }
  if (!spec.discoverable) {
    return {
      shouldIntroduce: false,
      showIntro: false,
      showTip: false,
      reason: "not_discoverable",
    };
  }
  if (input.state === "adopted") {
    // متبنيّاش: نوقف رسائل التعريف، ونقدّم Advanced tips بس.
    return {
      shouldIntroduce: false,
      showIntro: false,
      showTip: Boolean(spec.tipCopy),
      reason: "already_adopted",
    };
  }
  if (input.state === "tried") {
    // جرّبها: من غير إعادة تعريف — نعرض تلميح التطوير بس.
    return {
      shouldIntroduce: false,
      showIntro: false,
      showTip: Boolean(spec.tipCopy),
      reason: "already_tried",
    };
  }
  if (input.state === "introduced") {
    // عرفها بالفعل ⇒ ما نكرّرش نفس الإعلان. وده شرط صريح في دورة الاكتشاف.
    return {
      shouldIntroduce: false,
      showIntro: false,
      showTip: false,
      reason: "already_introduced",
    };
  }
  if (input.dismissCount >= maxDismiss) {
    // تجاهل كتير ⇒ نسكت (مفيش إزعاج).
    return {
      shouldIntroduce: false,
      showIntro: false,
      showTip: false,
      reason: "dismissed_too_often",
    };
  }

  return {
    shouldIntroduce: true,
    showIntro: Boolean(spec.discoveryCopy),
    showTip: false,
    reason: "introduce",
  };
}
