import { describe, it, expect } from "vitest";
import { normalizeMagId } from "../mag-id";

describe("normalizeMagId", () => {
  it("accepts canonical", () => {
    expect(normalizeMagId("mag-f5n-b64m")).toBe("MAG-F5N-B64M");
  });
  it("canonicalizes without dashes", () => {
    expect(normalizeMagId("magf5nb64m")).toBe("MAG-F5N-B64M");
  });
  it("rejects bad", () => {
    expect(normalizeMagId("MAG-12-34")).toBeNull();
    expect(normalizeMagId(123)).toBeNull();
  });
});