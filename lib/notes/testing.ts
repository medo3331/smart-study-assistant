// lib/notes/testing.ts
//
// Phase 1B.1 — Test-only helpers.
//
// ⚠️ NOT exported from lib/notes/index.ts. Import this module from tests only.
//    Production code must not depend on it.
//
// Nothing here is a security boundary: TypeScript module privacy is not a
// security mechanism. The point of keeping these helpers out of the public
// barrel is to keep the production write paths narrow and obvious, not to
// make them unreachable.

import { createNoteRepositoryInternal, type NoteRepository } from "./repository";
import {
  createWriterPromotion,
  writerLeaseCancelledError,
  type OwnerWriterLease,
} from "./locks";
import type { NoteStorage, NotesOwner, NotesOwnerKind } from "./types";

export { setStorageTestHooks } from "./test-hooks";
export type { StorageTestHooks } from "./test-hooks";

/** A writer lease whose granted state can be driven by the test. */
export type TestWriterLease = OwnerWriterLease & {
  /** Grant or revoke the lease without touching the browser. */
  setGranted(granted: boolean): void;
};

/**
 * A fake writer lease for environments without the Web Locks API (Node).
 *
 * It uses the SAME promotion machinery as the real lease
 * (createWriterPromotion), so the promotion/cancellation semantics under test
 * are the production ones — not a parallel mock.
 */
export function createTestWriterLease(
  options: { granted?: boolean; supported?: boolean } = {},
): TestWriterLease {
  let granted = options.granted ?? true;
  const supported = options.supported ?? true;

  const promotion = createWriterPromotion();
  if (granted) promotion.resolve();

  return {
    lockName: "magicly-notes-writer:test",
    supported,
    isWriter: () => granted,
    whenWriter: () => promotion.promise,
    release: () => {
      granted = false;
      promotion.reject(writerLeaseCancelledError());
    },
    setGranted: (next: boolean) => {
      granted = next;
      if (next) promotion.resolve();
    },
  };
}

/** Build a namespaced owner for tests. */
export function createTestOwner(
  kind: NotesOwnerKind = "anon",
  id = "test-owner",
): NotesOwner {
  return {
    kind,
    id: kind === "anon" ? `anon:${id}` : `user:${id}`,
  };
}

/**
 * Build a repository for tests with an explicit owner, storage and lease.
 *
 * This bypasses the identity resolution on purpose — that is exactly what
 * the production factory must never allow.
 */
export function createTestNoteRepository(options: {
  owner: NotesOwner;
  storage: NoteStorage;
  lease?: OwnerWriterLease;
  drainTimeoutMs?: number;
}): NoteRepository {
  const lease = options.lease ?? createTestWriterLease();
  return createNoteRepositoryInternal({
    owner: options.owner,
    storage: options.storage,
    lease,
    drainTimeoutMs: options.drainTimeoutMs,
  });
}
