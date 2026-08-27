import { describe, it, expect } from "vitest";
import { documentAnalyzerAgent } from "../document-analyzer";

describe("Document Analyzer Agent", () => {
  it("routes via AgentRouter", async () => {
    const r = await documentAnalyzerAgent({ prompt: "Summarize this document", context: { preferences: { content: "Physics: Newton's laws..." } } });
    expect(r.agent).toBe("document_analyzer");
    expect(r.ok).toBe(false); // router not injected
    expect((r as any).code).toBe("ROUTER_REQUIRED");
  });
  it("Arabic document content", async () => {
    const r = await documentAnalyzerAgent({ prompt: "لخص هذا", context: { language: "ar", preferences: { content: "الدروس: الفيزياء الأساسية.", subject: "physics" } } }, () =>
      Promise.resolve({ ok: true, agent: "document_analyzer", provider: "nvidia", model: "test", content: "ملخص الدرس: قوانين نيوتن...", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("English document content", async () => {
    const r = await documentAnalyzerAgent({ prompt: "Explain this chapter", context: { language: "en", preferences: { content: "Chapter 3: Calculus", subject: "math" } } }, () =>
      Promise.resolve({ ok: true, agent: "document_analyzer", provider: "nvidia", model: "test", content: "Chapter summary and key points.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("summarization", async () => {
    const r = await documentAnalyzerAgent({ prompt: "Summarize", context: { preferences: { content: "Long text..." } } }, () =>
      Promise.resolve({ ok: true, agent: "document_analyzer", provider: "nvidia", model: "test", content: "Summary provided.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("extraction / key points", async () => {
    const r = await documentAnalyzerAgent({ prompt: "Extract main points", context: { preferences: { content: "A B C D E" } } }, () =>
      Promise.resolve({ ok: true, agent: "document_analyzer", provider: "nvidia", model: "test", content: "Key points: A, B, C.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("missing/invalid document asks", async () => {
    const r = await documentAnalyzerAgent({ prompt: "Analyze", context: { preferences: {} } }, () =>
      Promise.resolve({ ok: false, agent: "document_analyzer", provider: "nvidia", code: "MISSING_INPUT", message: "Provide document content.", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
  });
  it("vision/input shape", async () => {
    const r = await documentAnalyzerAgent({ prompt: "Analyze image", context: { preferences: { imageInput: "base64", subject: "art" } } }, () =>
      Promise.resolve({ ok: true, agent: "document_analyzer", provider: "nvidia", model: "test", content: "Image shows diagram.", retryable: false } as any)
    );
    expect(r.ok).toBe(true);
  });
  it("provider error MODEL_404", async () => {
    const r = await documentAnalyzerAgent({ prompt: "Q", context: { preferences: { content: "x" } } }, () =>
      Promise.resolve({ ok: false, agent: "document_analyzer", provider: "nvidia", code: "MODEL_404", message: "404", retryable: true } as any)
    );
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("MODEL_404");
  });
});
