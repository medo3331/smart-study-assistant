import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { NvidiaProvider } from "./nvidia";
import { OpenRouterProvider } from "./openrouter";
import { AiRouter } from "./routing";
import { registerMediaExecutors } from "./media-router";

export {
  AI_PROVIDER_BY_TASK,
  TASK_MODEL_PREFERENCE,
  AiRouter,
  AiRouteError,
  routeCandidates,
  capabilitiesForTask,
  type AiRoutedResponse,
  type RouteCandidate,
  type RouterAttempt,
} from "./routing";
export {
  MODEL_REGISTRY,
  getModel,
  findModel,
  modelsForCapabilities,
  modelsForProvider,
  fallbackCandidatesFor,
  selectableModelsForCapabilities,
  isModelSelectable,
  paidModelsAllowed,
} from "./models";
export {
  getProviderHealth,
  getProviderStats,
  providerConfigStatus,
  recordProviderResult,
  type AiHealthStatus,
  type ProviderHealthStats,
} from "./health";
export { AIService } from "./service";
export { extractJson, validateStructured } from "./structured";
export {
  streamingAdapterFor,
  OpenRouterStreamingAdapter,
} from "./streaming";
export {
  mediaCandidates,
  generateImageWithFallback,
  generateVideoWithFallback,
  MediaModelUnavailableError,
} from "./media-router";
export { openrouterApiKey, OPENROUTER_TIMEOUT_MS } from "./openrouter";
export {
  toAiPublicError,
  statusToPublicError,
  classifyStatusCode,
  isFallbackEligibleStatus,
  AiCodedError,
  AiMediaUnavailableError,
  AiAllProvidersFailedError,
  type AiErrorCode,
  type AiPublicError,
} from "./errors";
export {
  runAiTask,
  AI_TASK_REGISTRY,
  isImplementedAiTask,
  type AiTaskInput,
  type AiTaskResult,
  type AiUserContext,
} from "./tasks";

/** The application router. Product features never instantiate providers directly. */
const openRouterModule = new OpenRouterProvider();
const geminiModule = new GeminiProvider();
export const aiRouter = new AiRouter([
  new GroqProvider(),
  new NvidiaProvider(),
  openRouterModule,
  geminiModule,
]);

// Media Router executors — نفس الكائنات الحقيقية، بدون أي غلاف mock.
registerMediaExecutors({ nvidia: undefined, openrouter: openRouterModule, gemini: geminiModule });
