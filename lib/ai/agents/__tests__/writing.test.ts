import { describe, it, expect } from "vitest";
import { writingAgent } from "../writing";

describe("Writing Assistant Agent", () => {
  it("routes via AgentRouter", async () => {
    const r = await writingAgent({ prompt: "Write an essay outline" });
    expect(r.agent).toBe("writing");
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("ROUTER_REQUIRED");
  });
  it("arabic request", async () => {
    const r = await writingAgent({ prompt: "اكتب مسودة عن الذكاء الاصطناعي", context: { language: "ar", preferences: { subject: "AI" } } }, () =>
      Promise.resolve({ ok: true, agent: "writing", provider: "nvidia", model: "test", content: "مسودة: مقدمة، جذور، تطبيقات...", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("english request", async () => {
    const r = await writingAgent({ prompt: "Draft an outline for quantum physics essay", context: { language: "en" } }, () =>
      Promise.resolve({ ok: true, agent: "writing", provider: "nvidia", model: "test", content: "Outline: intro, theory, applications, conclusion.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("structured drafting output", async () => {
    const r = await writingAgent({ prompt: "Review this text for clarity", context: { preferences: { content: "The quick brown..." } } }, () =>
      Promise.resolve({ ok: true, agent: "writing", provider: "nvidia", model: "test", content: "Review: improve flow; keep meaning.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("missing source asks", async () => {
    const r = await writingAgent({ prompt: "Write based on this" }, () =>
      Promise.resolve({ ok: false, agent: "writing", provider: "nvidia", code: "MISSING_INPUT", message: "Provide notes/theme", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
  });
  it("provider fallback MODEL_404", async () => {
    const r = await writingAgent({ prompt: "Q", context: { preferences: { content: "x" } } }, () =>
      Promise.resolve({ ok: false, agent: "writing", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("MODEL_404");
  });
  it("vision input shape", async () => {
    const r = await writingAgent({ prompt: "Write from image", context: { preferences: { imageInput: "img" } } }, () =>
      Promise.resolve({ ok: true, agent: "writing", provider: "nvidia", model: "test", content: "Written from image source.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
});
