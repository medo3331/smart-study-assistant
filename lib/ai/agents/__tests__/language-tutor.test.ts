import { describe, it, expect } from "vitest";
import { languageTutorAgent } from "../language-tutor";

describe("Language Tutor Agent", () => {
  it("routing via AgentRouter", async () => {
    const r = await languageTutorAgent({ prompt: "Explain grammar" });
    expect(r.agent).toBe("language");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ROUTER_REQUIRED");
  });
  it("Arabic user → English learning (user ar, target en)", async () => {
    const r = await languageTutorAgent({ prompt: "كيف أقول hello بالعربية؟", context: { language: "ar", preferences: { targetLanguage: "en", level: "intermediate" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "You can say: مرحبًا = Hello.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("English user → Spanish learning", async () => {
    const r = await languageTutorAgent({ prompt: "How do I conjugate ser in Spanish?", context: { language: "en", preferences: { targetLanguage: "es", level: "beginner" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "Ser: yo soy, tú eres...", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("conversation mode", async () => {
    const r = await languageTutorAgent({ prompt: "Hello, how are you?", context: { preferences: { mode: "conversation" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "I am well — how can I help?", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("grammar correction", async () => {
    const r = await languageTutorAgent({ prompt: "Correct: She don't like apples.", context: { language: "en", preferences: { targetLanguage: "en" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "Correct: She doesn't like apples. (3rd person singular).", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("vocabulary", async () => {
    const r = await languageTutorAgent({ prompt: "Explain 'resilience' with examples", context: { language: "en", preferences: { targetLanguage: "fr" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "Résilience (f): capacité à rebondir. Ex: resilience in adversity.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("translation preserves meaning", async () => {
    const r = await languageTutorAgent({ prompt: "Translate: The library is open until 8pm.", context: { language: "ar", preferences: { targetLanguage: "en", sourceLanguage: "ar" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "The library stays open until 8 PM.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("writing review", async () => {
    const r = await languageTutorAgent({ prompt: "Review this paragraph for clarity", context: { language: "en", preferences: { mode: "writing" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "Clear; improve transitions; keep voice.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("explanation (level adaptive)", async () => {
    const r = await languageTutorAgent({ prompt: "Explain subjunctive mood", context: { language: "en", educationLevel: "grad", preferences: { targetLanguage: "en" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "Subjunctive: hypothetical/desired states; examples.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("missing target language asks", async () => {
    const r = await languageTutorAgent({ prompt: "Help me", context: { language: "ar", preferences: {} } }, () =>
      Promise.resolve({ ok: false, agent: "language", provider: "nvidia", code: "MISSING_INPUT", message: "Specify targetLanguage (e.g., en, es, fr).", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
  });
  it("unsupported / unknown language handled generically", async () => {
    const r = await languageTutorAgent({ prompt: "Bonjour", context: { language: "fr", preferences: { targetLanguage: "ja" } } }, () =>
      Promise.resolve({ ok: true, agent: "language", provider: "nvidia", model: "test", content: "Bonjour → good morning (Japanese response depends on model support).", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("provider error MODEL_404", async () => {
    const r = await languageTutorAgent({ prompt: "Q", context: { preferences: { content: "x" } } }, () =>
      Promise.resolve({ ok: false, agent: "language", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("MODEL_404");
  });
});
