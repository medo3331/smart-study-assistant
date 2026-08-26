import type { AiProviderName } from "./types";

/**
 * حالات صحة المزوّد/الموديل.
 * NOT_CONFIGURED = مفيش API key — حالة دائمة لحد ما البيئة تتظبط.
 * AVAILABLE / DEGRADED / RATE_LIMITED / COOLDOWN / TIMEOUT / UNAVAILABLE =
 * حالات مؤقتة بترجع تلقائيًا بعد cooldown أو عند أول نجاح.
 * AUTH_ERROR = مش مؤقت بالوقت — محتاج مفتاح جديد أو نجاح صريح جديد.
 */
export type AiHealthStatus =
  | "AVAILABLE"
  | "DEGRADED"
  | "RATE_LIMITED"
  | "COOLDOWN"
  | "AUTH_ERROR"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED";

/** القدرات اللي بنصنّف بيها المهام والموديلات. */
export type AiCapability =
  | "text"
  | "streaming"
  | "structured_output"
  | "vision"
  | "file_analysis"
  | "reasoning"
  | "coding"
  | "image_generation"
  | "video_generation"
  | "embeddings";

/**
 * فحص التهيئة الفعلي — مش fake health check. الحالة الوحيدة اللي نقدر
 * نتأكد منها من غير طلب شبكة هي إن المزوّد معرّف أصلًا في البيئة.
 */
export function providerConfigStatus(provider: AiProviderName): AiHealthStatus {
  const configured =
    provider === "groq"
      ? Boolean(
          process.env.GROQ_API_KEY?.trim() ||
            process.env.GROQ_API_KEY_1?.trim() ||
            process.env.GROQ_API_KEY_2?.trim() ||
            process.env.GROQ_API_KEY_3?.trim()
        )
      : provider === "nvidia"
        ? Boolean(process.env.NVIDIA_API_KEY?.trim())
        : provider === "openrouter"
          ? Boolean(process.env.OPENROUTER_API_KEY?.trim())
          : provider === "gemini"
            ? Boolean(process.env.GEMINI_API_KEY?.trim())
            : false;
  return configured ? "AVAILABLE" : "NOT_CONFIGURED";
}

export function isConfigured(provider: AiProviderName): boolean {
  return providerConfigStatus(provider) !== "NOT_CONFIGURED";
}

/** إحصائيات تشغيلية لكل مزوّد — للتشخيص والمراقبة فقط، بدون أي بيانات حساسة. */
export type ProviderHealthStats = {
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  /** متوسط زمن الاستجابة الناجحة بالميلي ثانية (آخر ٢٠ نجاح). */
  averageLatencyMs: number;
  lastError?: string;
  lastSuccessAt?: number;
  cooldownUntil: number;
};

const LATENCY_WINDOW = 20;

type ProviderRuntimeState = {
  status: Exclude<AiHealthStatus, "NOT_CONFIGURED">;
  /** unix ms — قبلها الحالة المؤقتة بترجع تلقائيًا AVAILABLE (بعد فحص التهيئة). */
  cooldownUntil: number;
  /** آخر سبب فشل معروف — للتشخيص فقط، بدون أي محتوى حساس. */
  lastReason?: string;
  lastSuccessAt?: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  latencyWindow: number[];
};

const COOLDOWN_MS: Partial<Record<Exclude<AiHealthStatus, "NOT_CONFIGURED">, number>> = {
  UNAVAILABLE: 60_000,
  RATE_LIMITED: 30_000,
  DEGRADED: 15_000,
  TIMEOUT: 30_000,
};

const runtimeStates = new Map<AiProviderName, ProviderRuntimeState>();

function defaultState(): ProviderRuntimeState {
  return { status: "AVAILABLE", cooldownUntil: 0, successCount: 0, failureCount: 0, consecutiveFailures: 0, latencyWindow: [] };
}

function effectiveState(provider: AiProviderName): ProviderRuntimeState {
  const state = runtimeStates.get(provider) ?? defaultState();
  if (
    state.cooldownUntil > 0 &&
    Date.now() >= state.cooldownUntil &&
    state.status !== "AUTH_ERROR"
  ) {
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

/** إحصائيات المزوّد للمراقبة — آمنة للطباعة، بدون أي مفاتيح أو محتوى طلبات. */
export function getProviderStats(provider: AiProviderName): ProviderHealthStats {
  const state = effectiveState(provider);
  const latencies = state.latencyWindow.length
    ? Math.round(state.latencyWindow.reduce((sum, ms) => sum + ms, 0) / state.latencyWindow.length)
    : 0;
  return {
    successCount: state.successCount,
    failureCount: state.failureCount,
    consecutiveFailures: state.consecutiveFailures,
    averageLatencyMs: latencies,
    lastError: state.lastReason,
    lastSuccessAt: state.lastSuccessAt,
    cooldownUntil: state.cooldownUntil,
  };
}

/**
 * تسجيل نتيجة استخدام حقيقية للمزوّد. دي نقطة الدخول الوحيدة لتغيير الحالة —
 * ممنوع أي حدس من خارج النتائج الفعلية.
 */
export function recordProviderResult(
  provider: AiProviderName,
  result:
    | { ok: true; latencyMs?: number }
    | { ok: false; status: number; reason: string; reasonCode?: string }
): void {
  // مزوّد مش معرّف في البيئة يفضل NOT_CONFIGURED مهما كانت النتيجة.
  if (!isConfigured(provider)) return;

  const state = effectiveState(provider);

  if (result.ok) {
    state.successCount += 1;
    state.consecutiveFailures = 0;
    state.lastSuccessAt = Date.now();
    state.status = "AVAILABLE";
    state.cooldownUntil = 0;
    if (typeof result.latencyMs === "number" && result.latencyMs >= 0) {
      state.latencyWindow.push(Math.round(result.latencyMs));
      if (state.latencyWindow.length > LATENCY_WINDOW) state.latencyWindow.shift();
    }
    runtimeStates.set(provider, state);
    return;
  }

  state.failureCount += 1;
  state.consecutiveFailures += 1;
  state.lastReason = `${result.status}: ${String(result.reason).slice(0, 200)}`;

  let next: ProviderRuntimeState["status"];
  if (result.status === 429 || result.status === 402) {
    next = "RATE_LIMITED";
  } else if (result.status === 401 || result.status === 403) {
    // مش مؤقت — محتاج مفتاح جديد، مفيش auto-recovery بالوقت.
    next = "AUTH_ERROR";
  } else if (result.reasonCode === "TIMEOUT") {
    next = "TIMEOUT";
  } else if (result.status >= 500 || result.status === 408 || result.status === 504) {
    // أعطال متكررة تحت = DEGRADED؛ أول عطل = نفسه UNAVAILABLE مع cooldown قصير.
    next = ["UNAVAILABLE", "RATE_LIMITED", "DEGRADED"].includes(state.status) ? "DEGRADED" : "UNAVAILABLE";
  } else {
    // أخطاء الطلب (400/404…) مش صحة المزوّد — الحالة زي ما هي.
    runtimeStates.set(provider, state);
    return;
  }

  runtimeStates.set(provider, {
    ...state,
    status: next,
    cooldownUntil: next === "AUTH_ERROR" ? 0 : Date.now() + (COOLDOWN_MS[next] ?? 30_000),
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
