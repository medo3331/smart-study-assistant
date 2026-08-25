import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { AiRouter } from "./routing";

export {
  AI_PROVIDER_BY_TASK,
  AiRouter,
  AiRouteError,
  routeCandidates,
  capabilitiesForTask,
  type AiRoutedResponse,
  type RouteCandidate,
  type RouterAttempt,
} from "./routing";
export { MODEL_REGISTRY, getModel, findModel, modelsForCapabilities } from "./models";
export {
  getProviderHealth,
  providerConfigStatus,
  recordProviderResult,
  type AiHealthStatus,
} from "./health";
export { AIService } from "./service";
export { extractJson, validateStructured } from "./structured";
export { streamingAdapterFor } from "./streaming";

/** The application router. Product features never instantiate providers directly. */
export const aiRouter = new AiRouter([new GroqProvider(), new GeminiProvider()]);
