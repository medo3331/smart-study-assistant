// lib/notes/locks.ts
//
// Phase 1B.1 — Web Locks.
//
// One exclusive lock per owner namespace:
//
//   magicly-notes-writer:<ownerId>
//
// The lock is session-scoped: the tab that holds it owns the write lease for
// the whole lifetime of its repository. Every other tab stays read-only while
// it waits, and it is promoted automatically as soon as the holder releases
// the lock or its tab is terminated — no polling, no timers.
//
// The lease is decided in two phases so the answer is never ambiguous:
//
//   Phase 1 — ask for the lock with `ifAvailable`. The browser answers
//             immediately: either we hold it, or somebody else does.
//   Phase 2 — a tab that did not get it queues for promotion. The callback
//             runs exactly when the lock is handed over.
//
// Fail-closed: when the Web Locks API is unavailable no tab can ever hold the
// lease, so every repository stays read-only. There is deliberately no
// localStorage fallback (it is not atomic and cannot provide exclusivity).

import { NOTES_ERROR_CODES, NotesError } from "./errors";

/** Handle for an exclusive, session-scoped write lease over one owner namespace. */
export type OwnerWriterLease = {
  /** The Web Lock name used for this lease. */
  readonly lockName: string;
  /** False when the Web Locks API is unavailable (fail-closed, read-only). */
  readonly supported: boolean;
  /** True only while THIS tab holds the lease. */
  isWriter(): boolean;
  /**
   * Resolves ONLY when this tab actually received the writer lease.
   * Rejects with NOTES_WRITER_LEASE_CANCELLED when the lease was released or
   * cancelled before the promotion happened.
   */
  whenWriter(): Promise<void>;
  /** Releases the lease. Idempotent. */
  release(): void;
};

/**
 * The promotion promise of a writer lease.
 *
 * It resolves ONLY on a real promotion. A release or a cancellation rejects
 * it — a waiting tab must never read "the lease ended" as "we are the writer
 * now".
 */
export type WriterPromotion = {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
};

/**
 * Create the promotion promise used by a writer lease.
 *
 * The promise is created eagerly, so it always carries a rejection handler:
 * a lease that is released while it is still waiting must not produce an
 * unhandled rejection.
 */
export function createWriterPromotion(): WriterPromotion {
  let settled = false;
  let resolveFn!: () => void;
  let rejectFn!: (error: unknown) => void;

  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  void promise.catch(() => {});

  return {
    promise,
    resolve: () => {
      if (settled) return;
      settled = true;
      resolveFn();
    },
    reject: (error) => {
      if (settled) return;
      settled = true;
      rejectFn(error);
    },
  };
}

/** The stable error a cancelled promotion rejects with. */
export function writerLeaseCancelledError(): NotesError {
  return new NotesError(
    NOTES_ERROR_CODES.WRITER_LEASE_CANCELLED,
    "NOTES_WRITER_LEASE_CANCELLED: the writer lease ended before this tab was promoted",
  );
}

/** A short-lived exclusive lock, used for the anonymous identity creation. */
export type ScopedLock = {
  readonly name: string;
  release(): void;
};

/** The Web Lock name for an owner namespace. */
export function ownerWriteLockName(ownerId: string): string {
  return `magicly-notes-writer:${ownerId}`;
}

/** Check if the Web Locks API is available. */
export function isWebLocksAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.locks !== "undefined" &&
    typeof navigator.locks.request === "function"
  );
}

/**
 * Try to take an exclusive lock without waiting.
 *
 * Resolves immediately with `acquired: false` when the lock is held
 * elsewhere. When it is acquired the lock is held until `release()` is
 * called.
 */
function tryAcquireExclusive(name: string): Promise<{
  acquired: boolean;
  release: () => void;
}> {
  return new Promise((resolve) => {
    let releaseHold!: () => void;
    const hold = new Promise<void>((res) => {
      releaseHold = res;
    });

    let settled = false;

    const request = navigator.locks.request(
      name,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          if (!settled) {
            settled = true;
            resolve({ acquired: false, release: () => {} });
          }
          return;
        }
        if (!settled) {
          settled = true;
          resolve({ acquired: true, release: () => releaseHold() });
        }
        await hold;
      },
    );

    void request.then(undefined, () => {
      if (!settled) {
        settled = true;
        resolve({ acquired: false, release: () => {} });
      }
    });
  });
}

/**
 * Queue for an exclusive lock.
 *
 * `onGranted` runs when the lock is handed over to this tab.
 */
function queueForExclusive(
  name: string,
  onGranted: () => void,
): { cancel: () => void } {
  let cancelled = false;

  let releaseHold!: () => void;
  const hold = new Promise<void>((res) => {
    releaseHold = res;
  });

  const request = navigator.locks.request(
    name,
    { mode: "exclusive" },
    async () => {
      if (cancelled) return;
      onGranted();
      await hold;
    },
  );

  void request.then(undefined, () => {
    /* the lock manager refused the request — the lease stays read-only */
  });

  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      releaseHold();
    },
  };
}

/**
 * Acquire the exclusive writer lease for an owner namespace.
 *
 * The returned lease is granted asynchronously: the tab may start as a
 * read-only tab and be promoted later. `isWriter()` reports the live state.
 */
export async function acquireOwnerWriterLease(
  ownerId: string,
): Promise<OwnerWriterLease> {
  const lockName = ownerWriteLockName(ownerId);

  if (!isWebLocksAvailable()) {
    console.warn(
      "[notes/locks] Web Locks API not available — every tab stays read-only",
    );
    const promotion = createWriterPromotion();
    return {
      lockName,
      supported: false,
      isWriter: () => false,
      whenWriter: () => promotion.promise,
      release: () => promotion.reject(writerLeaseCancelledError()),
    };
  }

  let granted = false;
  let released = false;

  const promotion = createWriterPromotion();

  // Phase 1 — the browser answers immediately whether we can write.
  const immediate = await tryAcquireExclusive(lockName);

  if (immediate.acquired) {
    granted = true;
    promotion.resolve();
    return {
      lockName,
      supported: true,
      isWriter: () => granted && !released,
      whenWriter: () => promotion.promise,
      release: () => {
        if (released) return;
        released = true;
        granted = false;
        immediate.release();
        // Already promoted: the rejection is a no-op.
        promotion.reject(writerLeaseCancelledError());
      },
    };
  }

  // Phase 2 — queue for promotion. The callback runs when the lock is
  // handed over, which is exactly when this tab becomes the writer.
  const queued = queueForExclusive(lockName, () => {
    granted = true;
    promotion.resolve();
  });

  return {
    lockName,
    supported: true,
    isWriter: () => granted && !released,
    whenWriter: () => promotion.promise,
    release: () => {
      if (released) return;
      released = true;
      granted = false;
      queued.cancel();
      // The promotion never happened — reject instead of resolving.
      promotion.reject(writerLeaseCancelledError());
    },
  };
}

/**
 * Acquire a short-lived exclusive lock and WAIT until it is actually held.
 *
 * Returns null when the Web Locks API is unavailable.
 */
export async function acquireScopedLock(name: string): Promise<ScopedLock | null> {
  if (!isWebLocksAvailable()) return null;

  let granted = false;
  let released = false;

  let resolveAcquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => {
    resolveAcquired = resolve;
  });

  let releaseHold!: () => void;
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });

  const request = navigator.locks.request(
    name,
    { mode: "exclusive" },
    async () => {
      granted = true;
      resolveAcquired();
      await hold;
    },
  );

  void request.then(undefined, () => {
    resolveAcquired();
  });

  await acquiredPromise;
  if (!granted) return null;

  return {
    name,
    release: () => {
      if (released) return;
      released = true;
      releaseHold();
    },
  };
}
