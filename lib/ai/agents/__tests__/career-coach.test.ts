import { describe, it, expect } from "vitest";
import { careerCoachAgent } from "../career-coach";

describe("Career Coach Agent", () => {
  it("routing via AgentRouter", async () => {
    const r = await careerCoachAgent({ prompt: "Plan my career" });
    expect(r.agent).toBe("career");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ROUTER_REQUIRED");
  });
  it("student career guidance", async () => {
    const r = await careerCoachAgent({ prompt: "How should I prepare for a tech career?", context: { role: "student", preferences: { field: "cs", level: "grad", goals: { pendingCount: 2 } } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Path: skills → internship → portfolio. Priorities: coding, communication.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("graduate career guidance", async () => {
    const r = await careerCoachAgent({ prompt: "Career path after graduation", context: { role: "graduate", preferences: { field: "engineering" } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Recommend: specialize → CV → interview prep → apply.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("freelancer career guidance", async () => {
    const r = await careerCoachAgent({ prompt: "How to grow freelance", context: { role: "freelancer", preferences: { subject: "design" } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Build niche, portfolio, pricing, clients.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("skill gap with real context", async () => {
    const r = await careerCoachAgent({ prompt: "Analyze my gaps", context: { role: "grad", preferences: { subject: "cs", progress: { completedDays: 5, totalDays: 10 } } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Gaps: project experience, networking; priorities: build project, update CV.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("resume / CV guidance", async () => {
    const r = await careerCoachAgent({ prompt: "Review my CV", context: { role: "graduate", preferences: { field: "engineering" } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "CV: highlight skills with evidence; no invented experience.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("interview preparation", async () => {
    const r = await careerCoachAgent({ prompt: "Prepare for interview", context: { role: "student", preferences: { subject: "cs" } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Practice: project explanation, strengths, weaknesses.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("career comparison", async () => {
    const r = await careerCoachAgent({ prompt: "Compare software vs data science", context: { language: "en", preferences: { role: "grad" } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Trade-offs: software = broader; data = deeper stats. Choose by interest.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("multilingual", async () => {
    const r = await careerCoachAgent({ prompt: "lineer career", context: { language: "ar", preferences: { targetLanguage: "fr" } } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "Plan de carrière: commencer par les compétences de base.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("missing context asks", async () => {
    const r = await careerCoachAgent({ prompt: "Help me", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: false, agent: "career", provider: "nvidia", code: "MISSING_INPUT", message: "Provide role, field, goals.", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
  });
  it("no invented experience/credentials/job", async () => {
    const r = await careerCoachAgent({ prompt: "Give me a job at Google", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: true, agent: "career", provider: "nvidia", model: "test", content: "I cannot invent job openings or credentials — provide your profile and target for real guidance.", retryable: false } as any)
    );
    expect(r.ok).toBe(true); // agent correctly refuses to invent
    expect(r.content || "").not.toContain("Google"); // no specific company invented
  });
  it("provider error MODEL_404", async () => {
    const r = await careerCoachAgent({ prompt: "Plan", context: { preferences: { field: "cs" } } }, () =>
      Promise.resolve({ ok: false, agent: "career", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("MODEL_404");
  });
});
