import { describe, it, expect } from "vitest";
import {
  acquireOwnerWriterLease,
  acquireScopedLock,
  createWriterPromotion,
  isWebLocksAvailable,
  ownerWriteLockName,
  writerLeaseCancelledError,
} from "../locks";
import { createTestWriterLease } from "../testing";

describe("Web Locks", () => {
  it("isWebLocksAvailable returns boolean", () => {
    expect(typeof isWebLocksAvailable()).toBe("boolean");
  });

  it("builds a per-owner lock name", () => {
    expect(ownerWriteLockName("anon:abc")).toBe("magicly-notes-writer:anon:abc");
    expect(ownerWriteLockName("user:xyz")).toBe("magicly-notes-writer:user:xyz");
  });

  it("fails closed when the Web Locks API is unavailable", async () => {
    // Node has no Web Locks — the lease must never report a writer.
    const lease = await acquireOwnerWriterLease("anon:test");
    if (!isWebLocksAvailable()) {
      expect(lease.supported).toBe(false);
      expect(lease.isWriter()).toBe(false);
      expect(lease.lockName).toBe("magicly-notes-writer:anon:test");
    } else {
      expect(lease.supported).toBe(true);
    }
    lease.release();
  });

  it("release is idempotent", async () => {
    const lease = await acquireOwnerWriterLease("anon:test-release");
    lease.release();
    lease.release();
    expect(lease.isWriter()).toBe(false);
  });

  it("acquireScopedLock returns null when Web Locks are unavailable", async () => {
    const lock = await acquireScopedLock("magicly-notes-test-lock");
    if (!isWebLocksAvailable()) {
      expect(lock).toBeNull();
    } else {
      expect(lock).not.toBeNull();
      lock!.release();
    }
  });

  // --- Writer promotion promise (P2-01) ---

  it("resolves the promotion only on a real promotion", async () => {
    const promotion = createWriterPromotion();
    let state = "pending";
    void promotion.promise.then(
      () => {
        state = "resolved";
      },
      () => {
        state = "rejected";
      },
    );
    await Promise.resolve();
    expect(state).toBe("pending");
    promotion.resolve();
    await expect(promotion.promise).resolves.toBeUndefined();
    expect(state).toBe("resolved");
  });

  it("rejects the promotion with a stable typed error on cancellation", async () => {
    const promotion = createWriterPromotion();
    promotion.reject(writerLeaseCancelledError());
    await expect(promotion.promise).rejects.toThrow(
      "NOTES_WRITER_LEASE_CANCELLED",
    );
    // A settled promotion cannot change its verdict.
    promotion.resolve();
    await expect(promotion.promise).rejects.toThrow(
      "NOTES_WRITER_LEASE_CANCELLED",
    );
  });

  it("rejects the promotion of a waiting lease that is released", async () => {
    const lease = createTestWriterLease({ granted: false });
    const promotion = lease.whenWriter();
    lease.release();
    await expect(promotion).rejects.toThrow("NOTES_WRITER_LEASE_CANCELLED");
  });

  it("keeps a granted promotion resolved when the lease is released", async () => {
    const lease = createTestWriterLease({ granted: true });
    const promotion = lease.whenWriter();
    await expect(promotion).resolves.toBeUndefined();
    lease.release();
    await expect(promotion).resolves.toBeUndefined();
  });
});
