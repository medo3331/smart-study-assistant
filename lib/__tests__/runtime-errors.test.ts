import { describe, it, expect } from "vitest";
import {
  sanitizeErrorMessage,
  sanitizeMetadata,
  classifyError,
  createTraceId,
  recordRuntimeError,
} from "../runtime-errors";

describe("runtime-errors helpers", () => {
  it("sanitizes sensitive data", () => {
    const msg = sanitizeErrorMessage("Authorization: Bearer abcdefghijklmnop q secret=xyz user@example.com");
    expect(msg).not.toContain("user@example.com");
    expect(msg).not.toContain("abcdefghijklmnop");
    expect(msg).toContain("[email]");
    expect(msg).toContain("[redacted]");
  });

  it("sanitizes metadata", () => {
    const out = sanitizeMetadata({ prompt: "secret prompt", count: 3, token: "abc", nested: { a: 1 } });
    expect(out.prompt).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.count).toBe(3);
  });

  it("classifies provider errors", () => {
    expect(classifyError(new Error("Groq 429 rate limit"), "internal")).toBe("provider");
    expect(classifyError(new Error("unauthorized"), "internal")).toBe("auth");
  });

  it("creates trace id", () => {
    expect(createTraceId()).toBeTruthy();
  });

  it("recordRuntimeError does not throw when env missing", async () => {
    await expect(recordRuntimeError({ route: "/api/test", message: "boom" })).resolves.toBeUndefined();
  });
});
