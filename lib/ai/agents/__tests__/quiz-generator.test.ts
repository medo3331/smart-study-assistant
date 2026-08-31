import { describe, it, expect } from "vitest";
import type { AgentResult } from "../types";
import { quizGeneratorAgent } from "../quiz-generator";

describe("Quiz Generator Agent", () => {
  it("routes via AgentRouter", async () => {
    const r = await quizGeneratorAgent({ prompt: "Generate 3 MCQs on Pointers" });
    expect(r.agent).toBe("quiz_generator");
    expect(r.ok).toBe(false); // router not injected
    expect((r as unknown as { code: string; content: string }).code).toBe("ROUTER_REQUIRED");
  });
  it("Arabic request handled", async () => {
    const r = await quizGeneratorAgent({ prompt: "جدي أسئلة اختبار على الدرس", context: { language: "ar", preferences: { subject: "CS" } } }, () =>
      Promise.resolve({ ok: true, agent: "quiz_generator", provider: "nvidia", model: "test", content: "Q1... Q2... Q3...", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("English request handled", async () => {
    const r = await quizGeneratorAgent({ prompt: "3 true/false on calculus", context: { language: "en" } }, () =>
      Promise.resolve({ ok: true, agent: "quiz_generator", provider: "nvidia", model: "test", content: "T/F answers.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("vision input shape supported", async () => {
    const r = await quizGeneratorAgent({ prompt: "Generate quiz from this", context: { preferences: { imageInput: "data", subject: "math" } } }, () =>
      Promise.resolve({ ok: true, agent: "quiz_generator", provider: "nvidia", model: "test", content: "Q from image.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("missing info asks not invents", async () => {
    const r = await quizGeneratorAgent({ prompt: "Generate quiz" }, () =>
      Promise.resolve({ ok: false, agent: "quiz_generator", provider: "nvidia", code: "MISSING_INPUT", message: "Need lesson topic.", retryable: true } as unknown as AgentResult)
    );
    expect(r.ok).toBe(false);
  });
  it("provider fallback MODEL_404", async () => {
    const r = await quizGeneratorAgent({ prompt: "Q" }, () =>
      Promise.resolve({ ok: false, agent: "quiz_generator", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as unknown as AgentResult)
    );
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("MODEL_404");
  });
  it("structured output (MCQ/True-False/Short)", async () => {
    const r = await quizGeneratorAgent({ prompt: "Quiz on pointers", context: { preferences: { subject: "CS" } } }, () =>
      Promise.resolve({ ok: true, agent: "quiz_generator", provider: "nvidia", model: "test", content: "Q1 (MCQ) ... Q2 (T/F) ... Q3 (Short)", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
    const content = ((r as unknown as { code: string; content: string }).content || "") as string;
    expect(content.length).toBeGreaterThan(0);
  });
});
