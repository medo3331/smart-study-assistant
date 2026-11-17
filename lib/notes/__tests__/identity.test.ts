import { describe, it, expect } from "vitest";
import { getOrCreateAnonId, readAnonId } from "../identity";

describe("identity (Node environment — no IndexedDB)", () => {
  it("exports getOrCreateAnonId", () => {
    expect(typeof getOrCreateAnonId).toBe("function");
  });

  it("exports readAnonId", () => {
    expect(typeof readAnonId).toBe("function");
  });

  it("getOrCreateAnonId returns null when IndexedDB unavailable", async () => {
    // In Node, indexedDB is undefined → should return null (fail closed)
    const result = await getOrCreateAnonId();
    expect(result).toBeNull();
  });

  it("readAnonId returns null when IndexedDB unavailable", async () => {
    const result = await readAnonId();
    expect(result).toBeNull();
  });
});
