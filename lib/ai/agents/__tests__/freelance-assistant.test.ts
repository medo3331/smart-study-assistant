import { describe, it, expect } from "vitest";
import type { AgentResult } from "../types";
import { freelanceAgent } from "../freelance-assistant";

describe("Freelance Assistant Agent", () => {
  it("routing via AgentRouter", async () => {
    const r = await freelanceAgent({ prompt: "Plan my freelance career" });
    expect(r.agent).toBe("freelance");
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("ROUTER_REQUIRED");
  });
  it("student to freelance transition", async () => {
    const r = await freelanceAgent({ prompt: "How to start as freelancer", context: { role: "student", preferences: { field: "cs", level: "grad" } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Build portfolio -> set pricing -> find niche.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("graduate freelance path", async () => {
    const r = await freelanceAgent({ prompt: "Career as freelancer after graduation", context: { role: "graduate", preferences: { field: "design" } } }, () =>
      Promise.resolve({ ok: true, agent: "freelance", provider: "nvidia", model: "test", content: "Build niche portfolio, set rates, manage clients.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("freelancer skill gap / portfolio", async () => {
    const r = await freelanceAgent({ prompt: "What skills am I missing?", context: { role: "freelancer", preferences: { subject: "dev" } } }, () =>
      Promise.resolve({ ok: true, agent: "freelance", provider: "nvidia", model: "test", content: "Gaps: portfolio, pricing, client communication.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("multilingual ar", async () => {
    const r = await freelanceAgent({ prompt: "كيف أبدأ كمستقل؟", context: { language: "ar" } }, () =>
      Promise.resolve({ ok: true, agent: "freelance", provider: "nvidia", model: "test", content: "ابدأ بتحديد الاختصاص ثم بناء الأعمال.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("multilingual en", async () => {
    const r = await freelanceAgent({ prompt: "Plan my freelance move", context: { language: "en" } }, () =>
      Promise.resolve({ ok: true, agent: "freelance", provider: "nvidia", model: "test", content: "Plan: niche → portfolio → pricing → clients.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("missing context asks", async () => {
    const r = await freelanceAgent({ prompt: "Help", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: false, agent: "freelance", provider: "nvidia", code: "MISSING_INPUT", message: "Provide role, field, goals.", retryable: true } as unknown as AgentResult)
    );
    expect(r.ok).toBe(false);
  });
  it("provider error MODEL_404", async () => {
    const r = await freelanceAgent({ prompt: "Plan", context: { preferences: { field: "cs" } } }, () =>
      Promise.resolve({ ok: false, agent: "freelance", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as unknown as AgentResult)
    );
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("MODEL_404");
  });
  it("no invented job/currency/source", async () => {
    const r = await freelanceAgent({ prompt: "Find job listings", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: true, agent: "freelance", provider: "nvidia", model: "test", content: "I don't invent job openings — provide your profile and target for guidance.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
    expect(((r as unknown as { code: string; content: string }).content || "") as string).not.toContain("Google");
  });
});
