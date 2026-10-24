import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../extract-text", () => ({
  extractTextFromFile: vi.fn(),
  ExtractError: class ExtractError extends Error { code = "X"; },
}));
vi.mock("../../ai/gemini", () => ({
  GeminiProvider: vi.fn(),
}));

import { unifiedAI } from "../../unified-ai/unified-ai";
import { extractTextFromFile } from "../../extract-text";
import { GeminiProvider } from "../../ai/gemini";

const mockAnalyzeMedia = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GROQ_API_KEY = "gsk_test";
  (GeminiProvider as any).mockImplementation(function () { return { analyzeMedia: mockAnalyzeMedia }; });
  (extractTextFromFile as any).mockResolvedValue("ocr text");
  mockAnalyzeMedia.mockResolvedValue({ content: "vision answer" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "groq answer" } }], usage: {} }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
});

function makeFile(type = "image/png", size = 100) {
  const bytes = new Uint8Array(size);
  return new File([bytes], "img.png", { type });
}

describe("Phase 3C vision", () => {
  it("valid image reaches Gemini in multimodal base64 format", async () => {
    const file = makeFile();
    const res = await unifiedAI({ prompt: "describe", imageInput: file, language: "en" });
    expect(res.ok).toBe(true);
    expect(res.answer).toBe("vision answer");
    expect(mockAnalyzeMedia).toHaveBeenCalled();
    const arg = mockAnalyzeMedia.mock.calls[0][0];
    expect(typeof arg.data).toBe("string");
    expect(arg.mimeType).toBe("image/png");
    expect(arg.prompt).toBe("describe");
    expect(extractTextFromFile).not.toHaveBeenCalled();
  });

  it("text-only request remains unchanged (no vision, no OCR)", async () => {
    const res = await unifiedAI({ prompt: "hello", language: "en" });
    expect(res.ok).toBe(true);
    expect(res.answer).toBe("groq answer");
    expect(mockAnalyzeMedia).not.toHaveBeenCalled();
    expect(extractTextFromFile).not.toHaveBeenCalled();
  });

  it("unsupported image MIME returns error", async () => {
    const file = makeFile("text/plain");
    const res = await unifiedAI({ prompt: "x", imageInput: file, language: "en" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNSUPPORTED_IMAGE_TYPE");
  });

  it("oversized image returns error", async () => {
    const file = makeFile("image/png", 3 * 1024 * 1024);
    const res = await unifiedAI({ prompt: "x", imageInput: file, language: "en" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("IMAGE_TOO_LARGE");
  });

  it("vision provider failure falls back to OCR path", async () => {
    mockAnalyzeMedia.mockRejectedValueOnce(new Error("vision down"));
    const file = makeFile();
    const res = await unifiedAI({ prompt: "describe", imageInput: file, language: "en" });
    expect(res.ok).toBe(true);
    expect(res.answer).toBe("groq answer");
    expect(extractTextFromFile).toHaveBeenCalled();
    expect(res.metadata?.visionFallback).toBe(true);
  });

  it("Arabic prompt preserved to vision provider", async () => {
    const file = makeFile();
    await unifiedAI({ prompt: "اشرح", imageInput: file, language: "ar" });
    expect(mockAnalyzeMedia.mock.calls[0][0].prompt).toBe("اشرح");
  });
});