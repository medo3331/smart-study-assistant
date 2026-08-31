import { describe, it, expect } from "vitest";
import type { AgentResult } from "../types";
import { imageAgent } from "../image-agent";

describe("Image Agent", () => {
  it("routing via AgentRouter", async () => {
    const r = await imageAgent({ prompt: "Generate a diagram of photosynthesis" });
    expect(r.agent).toBe("image");
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("ROUTER_REQUIRED");
  });
  it("generate mode", async () => {
    const r = await imageAgent({ prompt: "Draw a concept diagram", options: { mode: "generate" } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "Image request prepared (provider must execute). No fabricated image.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("analyze mode with vision input", async () => {
    const r = await imageAgent({ prompt: "What does this image show?", context: { preferences: { imageInput: "base64...", mode: "analyze" } } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "Visual inspection requested; content depends on model vision support.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("describe mode", async () => {
    const r = await imageAgent({ prompt: "Describe this document scan", options: { mode: "describe" } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "Description prepared; no visual claim without actual provider response.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("prompt mode (refine image prompt)", async () => {
    const r = await imageAgent({ prompt: "Make this prompt better for generation", options: { mode: "prompt" } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "Refined prompt: clear, structured, educational.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("diagram mode", async () => {
    const r = await imageAgent({ prompt: "Create a flowchart", options: { mode: "diagram" } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "Diagram request structured (no image fabricated).", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("educational mode ar", async () => {
    const r = await imageAgent({ prompt: "Educational diagram for photosynthesis in Arabic", context: { language: "ar" }, options: { mode: "educational" } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "طلب تعليمية بصري (باللغة العربية). الطلب جاهز للمعالجة.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("edit mode", async () => {
    const r = await imageAgent({ prompt: "Edit this image to add labels", options: { mode: "edit" } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "Edit request structured.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("general mode", async () => {
    const r = await imageAgent({ prompt: "Help with image task", context: { language: "en" } }, () =>
      Promise.resolve({ ok: true, agent: "image", provider: "nvidia", model: "test", content: "Image request prepared — provider execution required for actual result.", retryable: false } as unknown as AgentResult)
    );
    expect(r.ok).toBe(true);
  });
  it("MODEL_404", async () => {
    const r = await imageAgent({ prompt: "Generate image", context: { preferences: { } } }, () =>
      Promise.resolve({ ok: false, agent: "image", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as unknown as AgentResult)
    );
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).code).toBe("MODEL_404");
  });
  it("no fabricated image on failure", async () => {
    const r = await imageAgent({ prompt: "Generate image", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: false, agent: "image", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as unknown as AgentResult)
    );
    expect(r.ok).toBe(false);
    expect((r as unknown as { code: string; content: string }).content).toBeUndefined();
  });
});
