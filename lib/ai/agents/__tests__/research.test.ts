import { describe, it, expect } from "vitest";
import { researchAgent } from "../research";

describe("Research Assistant Agent", () => {
  it("routing", async () => {
    const r = await researchAgent({ prompt: "Best sources for quantum physics" });
    expect(r.agent).toBe("research");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ROUTER_REQUIRED");
  });
  it("arabic query", async () => {
    const r = await researchAgent({ prompt: "ابحث عن أفضل مصادر لفهم الفيزياء الكمومية", context: { language: "ar" } }, () =>
      Promise.resolve({ ok: true, agent: "research", provider: "nvidia", model: "test", content: "ملخص: مصادر موثوقة... (من السياق)", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("english query", async () => {
    const r = await researchAgent({ prompt: "Best sources for quantum physics", context: { language: "en" } }, () =>
      Promise.resolve({ ok: true, agent: "research", provider: "nvidia", model: "test", content: "Sources: ... (from context).", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("structured result with sources/evidence/uncertainty", async () => {
    const r = await researchAgent({ prompt: "Analyze sources", context: { preferences: { sources: ["paper-a.pdf"], content: "Physics findings..." } } }, () =>
      Promise.resolve({ ok: true, agent: "research", provider: "nvidia", model: "test", content: "Facts: X. Claims: Y (evidence: source A). Uncertainty: Z needs verification.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("no external sources — does not invent URLs", async () => {
    const r = await researchAgent({ prompt: "Find sources", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: true, agent: "research", provider: "nvidia", model: "test", content: "No sources provided — ask user for documents or clarify topic.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
    // Verify no invented URL in response
    expect((r.content || "").includes("http")).toBe(false);
  });
  it("vision input shape", async () => {
    const r = await researchAgent({ prompt: "Analyze image", context: { preferences: { imageInput: "img", subject: "physics" } } }, () =>
      Promise.resolve({ ok: true, agent: "research", provider: "nvidia", model: "test", content: "Image analysis result.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("provider error MODEL_404", async () => {
    const r = await researchAgent({ prompt: "Q", context: { preferences: { content: "x" } } }, () =>
      Promise.resolve({ ok: false, agent: "research", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("MODEL_404");
  });
  it("missing input asks", async () => {
    const r = await researchAgent({ prompt: "" }, () =>
      Promise.resolve({ ok: false, agent: "research", provider: "nvidia", code: "MISSING_INPUT", message: "Provide query and context.", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
  });
});
