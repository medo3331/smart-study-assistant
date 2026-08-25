import type { AiProviderName } from "./types";

/**
 * حالات صحة المزوّد/الموديل.
 * NOT_CONFIGURED = مفيش API key — حالة دائمة لحد ما البيئة تتظبط.
 * AVAILABLE / DEGRADED / RATE_LIMITED / UNAVAILABLE = حالات مؤقتة بترجع
 * تلقائيًا بعد فترة تهدئة (cooldown) أو عند أول نجاح جديد.
 */
export type AiHealthStatus =
  | "AVAILABLE"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "RATE_LIMITED";

/** القدرات اللي بنصنّف بيها المهام والموديلات. */
export type AiCapability =
  | "text"
  | "streaming"
  | "structured_output"
  | "vision"
  | "file_analysis"
  | "reasoning"
  | "coding"
  | "image_generation";

/**
 * فحص التهيئة الفعلي — مش fake health check. الحالة الوحيدة اللي نقدر
 * نتأكد منها من غير طلب شبكة هي إن المزوّد معرّف أصلًا في البيئة.
 */
export function providerConfigStatus(provider: AiProviderName): AiHealthStatus {
  const configured =
    provider === "groq"
      ? Boolean(process.env.GROQ_API_KEY?.trim())
      : provider === "gemini"
        ? Boolean(process.env.GEMINI_API_KEY?.trim())
        : false;
  return configured ? "AVAILABLE" : "NOT_CONFIGURED";
}

export function isConfigured(provider: AiProviderName): boolean {
  return providerConfigStatus(provider) !== "NOT_CONFIGURED";
}

/** الأسباب اللي بتتسجل مع كل تغيير حالة — أساس التلميحات المستقبلية للمراقبة. */
export type HealthTransition = {
  provider: AiProviderName;
  from: AiHealthStatus;
  to: AiHealthStatus;
  at: number;
};

type ProviderRuntimeState = {
  status: Exclude<AiHealthStatus, "NOT_CONFIGURED">;
  /** unix ms — قبلها الحالة المؤقتة بترجع تلقائيًا AVAILABLE (بعد فحص التهيئة). */
  cooldownUntil: number;
  /** آخر سبب فشل معروف — للتشخيص فقط، بدون أي محتوى حساس. */
  lastReason?: string;
};

const COOLDOWN_MS = {
  UNAVAILABLE: 60_000,
  RATE_LIMITED: 30_000,
  DEGRADED: 15_000,
} as const;

const runtimeStates = new Map<AiProviderName, ProviderRuntimeState>();

function defaultState(): ProviderRuntimeState {
  return { status: "AVAILABLE", cooldownUntil: 0 };
}

function effectiveState(provider: AiProviderName): ProviderRuntimeState {
  const state = runtimeStates.get(provider) ?? defaultState();
  if (state.cooldownUntil > 0 && Date.now() >= state.cooldownUntil) {
    // انتهت فترة التهدئة — رجّعنا AVAILABLE وخلّينا lastReason للسياق.
    state.status = "AVAILABLE";
    state.cooldownUntil = 0;
    runtimeStates.set(provider, state);
  }
  return state;
}

/** الحالة الكاملة: تهيئة دائمية + حالة مؤقتة مع فترة تهدئة. */
export function getProviderHealth(provider: AiProviderName): AiHealthStatus {
  const configStatus = providerConfigStatus(provider);
  if (configStatus === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  return effectiveState(provider).status;
}

export function isUsable(provider: AiProviderName): boolean {
  const health = getProviderHealth(provider);
  return health === "AVAILABLE" || health === "DEGRADED";
}

/**
 * تسجيل نتيجة استخدام حقيقية للمزوّد. دي نقطة الدخول الوحيدة لتغيير الحالة —
 * ممنوع أي حدس من خارج النتائج الفعلية.
 */
export function recordProviderResult(
  provider: AiProviderName,
  result:
    | { ok: true }
    | { ok: false; status: number; reason: string }
): void {
  // مزوّد مش معرّف في البيئة يفضل NOT_CONFIGURED مهما كانت النتيجة.
  if (!isConfigured(provider)) return;

  if (result.ok) {
    runtimeStates.set(provider, { status: "AVAILABLE", cooldownUntil: 0 });
    return;
  }

  const state = effectiveState(provider);
  let next: ProviderRuntimeState["status"];
  if (result.status === 429 || result.status === 402) {
    next = "RATE_LIMITED";
  } else if (result.status >= 500 || result.status === 408 || result.status === 504) {
    // أعطال متكررة تحت = DEGRADED؛ أول عطل = نفسه UNAVAILABLE مع cooldown قصير.
    next = state.status === "UNAVAILABLE" || state.status === "RATE_LIMITED" ? "DEGRADED" : "UNAVAILABLE";
  } else {
    // أخطاء الطلب/التهيئة (400/401/403/404…) مش صحة المزوّد — الحالة زي ما هي.
    return;
  }

  runtimeStates.set(provider, {
    status: next,
    cooldownUntil: Date.now() + COOLDOWN_MS[next],
    lastReason: `${result.status}: ${result.reason}`.slice(0, 200),
  });
}

/** للفحص والتشخيص فقط — لا يُعرض للمستخدمين ولا يخرج من السيرفر. */
export function getProviderDiagnostics(provider: AiProviderName): { lastReason?: string; cooldownRemainingMs: number } {
  const state = effectiveState(provider);
  return {
    lastReason: state.lastReason,
    cooldownRemainingMs: Math.max(0, state.cooldownUntil - Date.now()),
  };
}
