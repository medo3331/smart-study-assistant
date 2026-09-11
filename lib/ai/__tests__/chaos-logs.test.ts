import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError } from "../types";
import type { AiChatRequest, AiProviderName } from "../types";
import type { AiStreamChunk, AiStreamingProvider } from "../streaming";
import { __setStreamingAdapterLookupForTests, streamWithFallback } from "../streaming-fallback";

const input: AiChatRequest = { messages: [{ role: "user", content: "test" }] };

function adapter(name: AiProviderName, impl: () => AsyncGenerator<AiStreamChunk>): AiStreamingProvider {
  return { name, streamChat: impl };
}

async function drain(gen: AsyncGenerator<AiStreamChunk>) {
  try {
    for await (const _ of gen) {
      /* consume */
    }
  } catch {
    /* expected */
  }
}

afterEach(() => {
  __setStreamingAdapterLookupForTests(null);
  vi.restoreAllMocks();
});

describe("Chaos: Logs Security", () => {
  it("no_api_keys_in_logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    __setStreamingAdapterLookupForTests(() =>
      adapter("groq", async function* () {
        throw new Error("Network error sk-abcdefghijklmnopqrstuvwxyz012345");
      })
    );
    await drain(streamWithFallback("chat", input));
    const logged = warn.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(logged).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(logged).not.toMatch(/GROQ_API_KEY\s*=/);
    warn.mockRestore();
  });

  it("logs_provider_name_not_key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    __setStreamingAdapterLookupForTests((p) =>
      adapter(p, async function* () {
        throw new AiProviderError("rate", 429, p);
      })
    );
    await drain(streamWithFallback("chat", input));
    const logged = warn.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(logged).toMatch(/Stream Fallback/);
    expect(logged).not.toMatch(/Bearer /);
    warn.mockRestore();
  });

  it("success_does_not_warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq"
        ? adapter("groq", async function* () {
            yield { type: "text", value: "ok" };
            yield { type: "end", provider: "groq", model: "m" };
          })
        : undefined
    );
    await drain(streamWithFallback("chat", input));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
