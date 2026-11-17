// lib/notes/test-hooks.ts
//
// Phase 1B.1 — Internal, test-only seam.
//
// This module exists so the browser acceptance tests can inject a *controlled*
// failure or delay without monkey-patching the browser prototypes (which is
// fragile) and without changing production behaviour.
//
// It is deliberately NOT exported from lib/notes/index.ts. Production code
// must never install hooks.
//
// Default state is inert: `hooks` is null and every call site is a no-op.

/** Test-only hooks understood by the storage layer. */
export type StorageTestHooks = {
  /**
   * Called before a write transaction is opened (outside any transaction, so
   * it may await). May throw to simulate a native storage failure.
   */
  beforeWrite?: (operation: string) => void | Promise<void>;
  /**
   * Called inside the cascade transaction, before any record is deleted.
   * The hook may call `tx.abort()` to abort the whole transaction.
   */
  beforeCascadeDelete?: (tx: IDBTransaction) => void;
};

let hooks: StorageTestHooks | null = null;

/** Install (or clear, with `null`) the test hooks. Test-only. */
export function setStorageTestHooks(next: StorageTestHooks | null): void {
  hooks = next;
}

/** Current test hooks, or null when the storage layer runs in production mode. */
export function getStorageTestHooks(): StorageTestHooks | null {
  return hooks;
}
