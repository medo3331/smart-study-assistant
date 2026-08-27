import { describe, it, expect } from "vitest";
import { plannerAgent } from "../planner";

describe("Planner Agent", () => {
  it("routing via AgentRouter", async () => {
    const r = await plannerAgent({ prompt: "Plan my exam study" });
    expect(r.agent).toBe("planner");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ROUTER_REQUIRED");
  });
  it("student study planning with real context", async () => {
    const r = await plannerAgent({ prompt: "Plan study for exam in 5 days", context: { role: "student", field: "cs", preferences: { subject: "CS", level: "grad", streak: 5, progress: { currentDay: 3, totalDays: 10 } } } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "Plan: Day 1 review, Day 2 practice, Day 3 exam. Priority: weak topics first.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("graduate planning with career context", async () => {
    const r = await plannerAgent({ prompt: "Plan career development", context: { role: "graduate", field: "engineering", preferences: { level: "graduate" } } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "Career steps: skill → project → portfolio → apply.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("freelancer project planning", async () => {
    const r = await plannerAgent({ prompt: "Plan project delivery", context: { role: "freelancer", preferences: { subject: "design" } } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "Plan: milestones → review → deliver.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("daily planning", async () => {
    const r = await plannerAgent({ prompt: "Plan my day", context: { language: "ar", preferences: { role: "student" } } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "Day: study 2h, review 1h, rest.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("exam planning with deadline", async () => {
    const r = await plannerAgent({ prompt: "Plan for exam in 3 days", context: { preferences: { subject: "math", level: "grad" } } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "3-day plan: review + practice + exam.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("goal breakdown", async () => {
    const r = await plannerAgent({ prompt: "Break down goal", context: { preferences: { goals: { pendingCount: 1, pendingTitles: ["Pass exam"] } } } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "Steps: study → practice → test.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("priority handling / conflicting goals", async () => {
    const r = await plannerAgent({ prompt: "Prioritize", context: { preferences: { goals: { urgentCount: 2, pendingCount: 3 } } } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "Priority: urgent first, then others.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("missing data asks rather than invents", async () => {
    const r = await plannerAgent({ prompt: "Plan study", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: false, agent: "planner", provider: "nvidia", code: "MISSING_INPUT", message: "Provide available time / deadline / goals.", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
  });
  it("multilingual response", async () => {
    const r = await plannerAgent({ prompt: "Plan my week", context: { language: "ar" } }, () =>
      Promise.resolve({ ok: true, agent: "planner", provider: "nvidia", model: "test", content: "خطة أسبوعك: دراسة، مراجعة، ثلث يوم.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("provider error MODEL_404", async () => {
    const r = await plannerAgent({ prompt: "Plan", context: { preferences: { subject: "cs" } } }, () =>
      Promise.resolve({ ok: false, agent: "planner", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("MODEL_404");
  });
});
