import type { AiChatRequest, AiChatResponse, AiImageGenerationRequest, AiImageGenerationResponse, AiImageProvider, AiMediaAnalysisRequest, AiMediaProvider, AiProviderName, AiTaskType, AiTextProvider } from "./types";

/** One policy shared by the assistant, future agents, and server routes. */
export const AI_PROVIDER_BY_TASK: Readonly<Record<AiTaskType, AiProviderName>> = {
  chat: "groq",
  content: "groq",
  marketing_copy: "groq",
  coding: "groq",
  file_analysis: "gemini",
  image_analysis: "gemini",
  data_analysis: "gemini",
  planning: "gemini",
  business_plan: "gemini",
  marketing_plan: "gemini",
  roadmap: "gemini",
  image_generation: "gemini",
};

export class AiRouter {
  private readonly providers: Partial<Record<AiProviderName, AiTextProvider>>;

  constructor(providers: AiTextProvider[]) {
    this.providers = Object.fromEntries(providers.map((provider) => [provider.name, provider]));
  }

  getProviderName(task: AiTaskType): AiProviderName {
    return AI_PROVIDER_BY_TASK[task];
  }

  async completeChat(task: AiTaskType, input: AiChatRequest): Promise<AiChatResponse> {
    const providerName = this.getProviderName(task);
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`AI provider \"${providerName}\" is not available for task \"${task}\".`);
    }

    // No cross-capability fallback: a failed file/image/planning request must
    // surface an error, never masquerade as a successful plain-text response.
    return provider.completeChat(input);
  }

  async analyzeMedia(task: AiTaskType, input: AiMediaAnalysisRequest): Promise<AiChatResponse> {
    const providerName = this.getProviderName(task);
    const provider = this.providers[providerName] as AiMediaProvider | undefined;
    if (!provider?.analyzeMedia) throw new Error(`AI provider "${providerName}" cannot analyze media.`);
    return provider.analyzeMedia(input);
  }

  async generateImage(input: AiImageGenerationRequest): Promise<AiImageGenerationResponse> {
    const providerName = this.getProviderName("image_generation");
    const provider = this.providers[providerName] as AiImageProvider | undefined;
    if (!provider?.generateImage) throw new Error(`AI provider "${providerName}" cannot generate images.`);
    return provider.generateImage(input);
  }
}
