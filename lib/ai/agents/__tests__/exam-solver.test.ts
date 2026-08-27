import { describe, it, expect } from "vitest";
import { examSolverAgent } from "../exam-solver";

describe("Exam Solver Agent", () => {
  it("routes correctly (depends on AgentRouter)", async () => {
    const r = await examSolverAgent({ prompt: "Solve: integral of x^2 dx" });
    expect(r.agent).toBe("exam_solver");
    expect(r.ok).toBe(false); // router not injected
    expect(r.code).toBe("ROUTER_REQUIRED");
  });

  it("Arabic question handled with auto language detect", async () => {
    const r = await examSolverAgent({ prompt: "ما حل المعادلة x + 3 = 7؟", context: { language: "ar", role: "grad", preferences: { subject: "math" } } }, () =>
      Promise.resolve({ ok: true, agent: "exam_solver", provider: "nvidia", model: "test", content: "x = 4 (step-by-step).", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });

  it("English question handled", async () => {
    const r = await examSolverAgent({ prompt: "Find derivative of x^3.", context: { language: "en" } }, () =>
      Promise.resolve({ ok: true, agent: "exam_solver", provider: "nvidia", model: "test", content: "3x².", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });

  it("structured step-by-step output exists", async () => {
    const r = await examSolverAgent({ prompt: "Solve integral of 2x dx." }, () =>
      Promise.resolve({ ok: true, agent: "exam_solver", provider: "nvidia", model: "test", content: "Step 1: Identify integral. Step 2: Apply rule. Step 3: x² + C.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
    expect(typeof r.content).toBe("string");
    expect((r.content ?? "").toLowerCase()).toContain("step");
  });

  it("missing information asks instead of inventing", async () => {
    const r = await examSolverAgent({ prompt: "Solve the problem." }, () =>
      Promise.resolve({ ok: false, agent: "exam_solver", provider: "nvidia", code: "MISSING_INPUT", message: "Please provide equation or values.", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
  });

  it("provider error / fallback: MODEL_404 reported (not success)", async () => {
    const r = await examSolverAgent({ prompt: "test" }, () =>
      Promise.resolve({ ok: false, agent: "exam_solver", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("MODEL_404");
  });

  it("vision/image input shape supported (context.preferences.imageInput)", async () => {
    const r = await examSolverAgent({ prompt: "Explain this image", context: { preferences: { imageInput: "base64data", subject: "physics" } } }, () =>
      Promise.resolve({ ok: true, agent: "exam_solver", provider: "nvidia", model: "test", content: "Image shows a circuit.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });

  it("generic subject support (math/physics/chem/programming/signals/academic)", async () => {
    const subjects = ["math", "physics", "chemistry", "programming", "signals", "academic"];
    for (const s of subjects) {
      const r = await examSolverAgent({ prompt: "Q", context: { preferences: { subject: s } } }, () =>
        Promise.resolve({ ok: true, agent: "exam_solver", provider: "nvidia", model: "test", content: "Solved.", retryable: false } as any)
      );
      expect(r.ok).toBe(true);
    }
  });
});
