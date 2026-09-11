import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../types";
import type { AiChatRequest, AiProviderName } from "../types";
import type { AiStreamChunk, AiStreamingProvider } from "../streaming";
import { __setStreamingAdapterLookupForTests, streamWithFallback } from "../streaming-fallback";

const input: AiChatRequest = { messages: [{ role: "user", content: "test" }] };

function adapter(
  name: AiProviderName,
  impl: (req: AiChatRequest) => AsyncGenerator<AiStreamChunk, void, undefined>
): AiStreamingProvider {
  return { name, streamChat: impl };
}

async function* succeed(text: string): AsyncGenerator<AiStreamChunk, void, undefined> {
  yield { type: "text", value: text };
  yield { type: "end", provider: "nvidia", model: "mock" };
}

async function collect(gen: AsyncGenerator<AiStreamChunk, void, undefined>) {
  const chunks: AiStreamChunk[] = [];
  for await (const c of gen) chunks.push(c);
  return chunks;
}

afterEach(() => {
  __setStreamingAdapterLookupForTests(null);
  vi.restoreAllMocks();
});

describe("Chaos: Fallback Chain", () => {
  it("fallback_rotates_on_429", async () => {
    const groq = vi.fn(async function* () {
      throw new AiProviderError("rate", 429, "groq");
    });
    const nvidia = vi.fn(succeed.bind(null, "ok-from-nvidia"));
    __setStreamingAdapterLookupForTests((p) => {
      if (p === "groq") return adapter("groq", groq as never);
      if (p === "nvidia") return adapter("nvidia", nvidia as never);
      return undefined;
    });
    const chunks = await collect(streamWithFallback("chat", input));
    expect(groq).toHaveBeenCalled();
    expect(nvidia).toHaveBeenCalled();
    expect(chunks.some((c) => c.type === "text" && c.value.includes("nvidia"))).toBe(true);
  });

  it("fallback_preserves_stream", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq" ? adapter("groq", succeed.bind(null, "hello-stream")) : undefined
    );
    const chunks = await collect(streamWithFallback("chat", input));
    expect(chunks[0]).toEqual({ type: "text", value: "hello-stream" });
    expect(chunks.at(-1)?.type).toBe("end");
  });

  it("fallback_all_providers_fail", async () => {
    __setStreamingAdapterLookupForTests(() =>
      adapter("groq", async function* () {
        throw new Error("Network error");
      })
    );
    await expect(collect(streamWithFallback("chat", input))).rejects.toThrow(/All stream providers failed|Network error/);
  });

  it("fallback_does_not_rotate_on_400", async () => {
    const nvidia = vi.fn(succeed.bind(null, "should-not-run"));
    __setStreamingAdapterLookupForTests((p) => {
      if (p === "groq")
        return adapter("groq", async function* () {
          throw new AiProviderError("bad request", 400, "groq");
        });
      if (p === "nvidia") return adapter("nvidia", nvidia as never);
      return undefined;
    });
    await expect(collect(streamWithFallback("chat", input))).rejects.toMatchObject({ status: 400 });
    expect(nvidia).not.toHaveBeenCalled();
  });

  it("fallback_skips_missing_adapter", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "openrouter" ? adapter("openrouter", succeed.bind(null, "via-or")) : undefined
    );
    const chunks = await collect(streamWithFallback("chat", input));
    expect(chunks.some((c) => c.type === "text" && c.value === "via-or")).toBe(true);
  });

  it("fallback_rotates_on_502", async () => {
    __setStreamingAdapterLookupForTests((p) => {
      if (p === "groq")
        return adapter("groq", async function* () {
          throw new AiProviderError("bad gateway", 502, "groq");
        });
      if (p === "nvidia") return adapter("nvidia", succeed.bind(null, "recovered"));
      return undefined;
    });
    const chunks = await collect(streamWithFallback("chat", input));
    expect(chunks.some((c) => c.type === "text" && c.value === "recovered")).toBe(true);
  });

  it("fallback_explain_task_supported", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq" ? adapter("groq", succeed.bind(null, "explain-ok")) : undefined
    );
    const chunks = await collect(streamWithFallback("explain", input));
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("fallback_coding_task_supported", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq" || p === "nvidia" ? adapter(p, succeed.bind(null, "code-ok")) : undefined
    );
    const chunks = await collect(streamWithFallback("coding", input));
    expect(chunks.some((c) => c.type === "text")).toBe(true);
  });

  it("fallback_stops_after_first_success", async () => {
    const second = vi.fn(succeed.bind(null, "second"));
    __setStreamingAdapterLookupForTests((p) => {
      if (p === "groq") return adapter("groq", succeed.bind(null, "first"));
      return adapter(p, second as never);
    });
    await collect(streamWithFallback("chat", input));
    expect(second).not.toHaveBeenCalled();
  });
});
