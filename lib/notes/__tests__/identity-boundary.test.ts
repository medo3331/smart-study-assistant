import { describe, it, expect } from "vitest";
import * as identityModule from "../identity";

/**
 * The production identity boundary (P1-02).
 *
 * The identity is resolved INSIDE the notes layer. There must be no runtime
 * path — not even through a deep import — that replaces the active identity
 * source, because that would let a consumer pick the owner namespace the
 * production factory operates on.
 */
describe("identity boundary", () => {
  it("does not expose a runtime identity replacement", () => {
    const module = identityModule as unknown as Record<string, unknown>;
    expect("setIdentitySource" in module).toBe(false);
    expect("activeSource" in module).toBe(false);
    expect("setIdentitySource" in module).toBe(false);
  });

  it("does not expose a runtime identity replacement to TypeScript either", () => {
    // @ts-expect-error — there is no runtime identity replacement
    void identityModule.setIdentitySource;
    expect(true).toBe(true);
  });

  it("resolves the identity internally and fails closed without IndexedDB", async () => {
    // Node has no IndexedDB → the anonymous identity cannot be established.
    await expect(identityModule.resolveIdentity()).resolves.toBeNull();
  });

  it("exposes the identity source as a constant, not as mutable state", async () => {
    const source = identityModule.ANONYMOUS_IDENTITY_SOURCE;
    expect(source.kind).toBe("anon");
    expect(await identityModule.resolveIdentity()).toBe(
      await source.current(),
    );
  });
});
