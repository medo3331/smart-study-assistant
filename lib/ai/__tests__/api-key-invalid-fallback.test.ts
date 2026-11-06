/* B4.0.2g-d2: مفتاح باطل (API key not valid — 400 من جوجل) لازم يكمّل
   fallback على المزوّد التالي بدل ما يوقّف السلسلة، وطالما 400 العادي
   (طلب باطل) بيفضل يقف فورًا. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFallbackEligibleError, isInvalidApiKeyMessage } from "../errors";
import { AiProviderError } from "../types";
import type { AiChatRequest, AiChatResponse, AiTextProvider } from "../types";
import { AiRouter, AiRouteError } from "../routing";
import { recordProviderResult } from "../health";

const input: AiChatRequest = { messages: [{ role: "user", content: "خطة دراسة" }] };

function ok(provider: "groq" | "nvidia"): AiChatResponse {
  return { provider, model: "mock", content: "ok", payload: { choices: [] } };
}

function providerStub(name: "groq" | "nvidia", completeChat: ReturnType<typeof vi.fn>): AiTextProvider {
  return { name, completeChat } as unknown as AiTextProvider;
}

// تصفير صحة المزوّد بين الاختبارات — حالة الراوتر module-global.
beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "test-groq");
  vi.stubEnv("NVIDIA_API_KEY", "test-nvidia");
  recordProviderResult("groq", { ok: true });
  recordProviderResult("nvidia", { ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isFallbackEligibleError (B4.0.2g-d2)", () => {
  it("treats 400 with invalid-api-key wording as retryable", () => {
    expect(isInvalidApiKeyMessage("API key not valid. Please pass a valid API key.")).toBe(true);
    expect(isInvalidApiKeyMessage("API_KEY_INVALID")).toBe(true);
    expect(isInvalidApiKeyMessage("Invalid API key provided")).toBe(true);
    expect(isFallbackEligibleError(400, "Gemini request failed: API key not valid")).toBe(true);
  });

  it("keeps 400/413/422 non-retryable for ordinary bad requests", () => {
    expect(isFallbackEligibleError(400, "Invalid prompt length")).toBe(false);
    expect(isFallbackEligibleError(400)).toBe(false);
    expect(isFallbackEligibleError(413, "API key not valid")).toBe(false);
    expect(isFallbackEligibleError(422)).toBe(false);
  });

  it("keeps 401/429/5xx retryable as before", () => {
    expect(isFallbackEligibleError(401)).toBe(true);
    expect(isFallbackEligibleError(429)).toBe(true);
    expect(isFallbackEligibleError(502)).toBe(true);
  });
});

describe("router fallback on invalid api key (B4.0.2g-d2)", () => {
  it("continues to the next provider when the first returns 400 API key not valid", async () => {
    const groq = vi.fn(async () => {
      throw new AiProviderError(
        "Groq request failed: API key not valid. Please pass a valid API key.",
        400,
        "groq"
      );
    });
    const nvidia = vi.fn(async () => ok("nvidia"));
    const router = new AiRouter([providerStub("groq", groq), providerStub("nvidia", nvidia)]);

    const response = await router.completeChat("study_plan", input);

    expect(groq).toHaveBeenCalled();
    expect(nvidia).toHaveBeenCalled();
    expect(response.provider).toBe("nvidia");
    expect(response.fallback?.attempts.length).toBeGreaterThan(1);
  });

  it("still stops on an ordinary 400 bad request", async () => {
    const groq = vi.fn(async () => {
      throw new AiProviderError("Prompt too long", 400, "groq");
    });
    const nvidia = vi.fn(async () => ok("nvidia"));
    const router = new AiRouter([providerStub("groq", groq), providerStub("nvidia", nvidia)]);

    await expect(router.completeChat("study_plan", input)).rejects.toBeInstanceOf(AiRouteError);
    expect(groq).toHaveBeenCalledTimes(1);
    expect(nvidia).not.toHaveBeenCalled();
  });

  it("excludes the invalid-key provider after fallback and reports it in attempts", async () => {
    const groq = vi.fn(async () => {
      throw new AiProviderError("API key not valid", 400, "groq");
    });
    const nvidia = vi.fn(async () => ok("nvidia"));
    const router = new AiRouter([providerStub("groq", groq), providerStub("nvidia", nvidia)]);

    const response = await router.completeChat("study_plan", input);
    const reasons = (response.fallback?.attempts ?? []).filter((a) => a.provider === "groq");
    expect(reasons.every((a) => !a.ok)).toBe(true);
    expect(groq).toHaveBeenCalledTimes(1);
  });
});
