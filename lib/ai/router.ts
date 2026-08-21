import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { AiRouter } from "./routing";

export { AI_PROVIDER_BY_TASK, AiRouter } from "./routing";

/** The application router. Product features never instantiate providers directly. */
export const aiRouter = new AiRouter([new GroqProvider(), new GeminiProvider()]);
