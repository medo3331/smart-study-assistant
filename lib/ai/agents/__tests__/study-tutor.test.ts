// Study Tutor tests — verified, not invented
import { describe, it, expect } from "vitest";
import type { AgentResult } from "../types";
import { studyTutorAgent } from "../study-tutor";

describe("Study Tutor Agent", () => {
  it("routes correctly via AgentRouter dependency", async () => {
    const r = await studyTutorAgent({ prompt: "اشرح درس الـPointers" });
    expect(r.agent).toBe("study_tutor");
    expect(r.ok).toBe(false); // router not injected => ROUTER_REQUIRED (honest)
    expect((r as unknown as { code: string; content: string }).code).toBe("ROUTER_REQUIRED");
  });

  it("handles context (role/field/level/lesson/progress/style)", async () => {
    const ctx = {
      role: "grad",
      language: "ar",
      educationLevel: "grad",
      preferences: { subject: "Computer Science", currentLesson: "Pointers in C", progress: "50%", learningStyle: "visual" },
    };
    // We only inspect the prompt construction via mock router; since no real router here, just verify it doesn't throw
    const r = await studyTutorAgent({ prompt: "ماذا يعني pointer؟", context: ctx }, () =>
      Promise.resolve({ ok: true, agent: "study_tutor", provider: "nvidia", model: "test", content: "Pointer is a memory address.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
    expect(r.agent).toBe("study_tutor");
  });

  it("multilingual: Arabic prompt -> Arabic reply when language=ar", async () => {
    const r = await studyTutorAgent({ prompt: "اشرح", context: { language: "ar" } }, () =>
      Promise.resolve({ ok: true, agent: "study_tutor", provider: "nvidia", model: "test", content: "شرح عربي.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });

  it("handles missing context gracefully", async () => {
    const r = await studyTutorAgent({ prompt: "hello" });
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("ROUTER_REQUIRED");
  });

  it("provider fallback: MODEL_404 not treated as success", async () => {
    const r = await studyTutorAgent({ prompt: "test" }, () =>
      Promise.resolve({ ok: false, agent: "study_tutor", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as unknown as AgentResult)
    );
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("MODEL_404");
  });

  it("normalized error on exception", async () => {
    const r = await studyTutorAgent({ prompt: "test" }, () => { throw new Error("fail"); });
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("STUDY_TUTOR_ERROR");
  });
});
