// lib/notes/identity.ts
//
// Phase 1B.1 — Identity resolution.
//
// The identity is derived here, never supplied by a caller. The repository
// factory asks this module who the current owner is; a UI component never
// passes an owner id.
//
// Phase 1B.1 resolves the ANONYMOUS identity only. The authenticated
// (Supabase) identity will be plugged into the same `IdentitySource` boundary
// later — the public API does not change when that happens.

import { acquireScopedLock } from "./locks";
import { idbGetMeta, idbPutMeta } from "./idb";
import type { NotesOwner, NotesOwnerKind } from "./types";

const ANON_ID_KEY = "anonOwnerId";
const ANON_ID_LOCK_NAME = "magicly-notes-anon-id-creation";

/** Prefix of the anonymous owner namespace. */
export const ANON_OWNER_PREFIX = "anon:";
/** Prefix of the authenticated owner namespace. */
export const USER_OWNER_PREFIX = "user:";

/**
 * Get or create the anonymous owner id.
 *
 * - If an identity exists in meta, return it.
 * - Otherwise take the anonymous-identity lock, re-read (another tab may have
 *   created it in the meantime) and create it only if it is still absent.
 * - If persistence fails, return null. There is no ephemeral identity: data
 *   must never be written under an id that cannot be retrieved later.
 */
export async function getOrCreateAnonId(): Promise<string | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  try {
    const existing = await idbGetMeta(ANON_ID_KEY);
    if (typeof existing === "string" && existing.length > 0) {
      return existing;
    }
  } catch {
    return null;
  }

  // The lock is a different name from the writer lease, so identity creation
  // never contends with a writer tab.
  const lock = await acquireScopedLock(ANON_ID_LOCK_NAME);

  try {
    // Re-read after taking the lock — another tab may have created it.
    const recheck = await idbGetMeta(ANON_ID_KEY);
    if (typeof recheck === "string" && recheck.length > 0) {
      return recheck;
    }

    const newId = crypto.randomUUID();
    await idbPutMeta(ANON_ID_KEY, newId);

    // Read back whatever is persisted. Under the lock this is our own id;
    // without Web Locks it still converges on a single stored value.
    const stored = await idbGetMeta(ANON_ID_KEY);
    return typeof stored === "string" && stored.length > 0 ? stored : null;
  } catch (error) {
    console.error("[notes/identity] Failed to persist anonId:", error);
    return null;
  } finally {
    lock?.release();
  }
}

/**
 * Read the anonymous owner id without creating it.
 * Returns null when it is not set (or IndexedDB is unavailable).
 */
export async function readAnonId(): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const val = await idbGetMeta(ANON_ID_KEY);
    return typeof val === "string" && val.length > 0 ? val : null;
  } catch {
    return null;
  }
}

/**
 * The boundary an identity source has to implement.
 *
 * A source resolves the CURRENT owner of the notes namespace. It is never
 * supplied by a UI caller.
 */
export type IdentitySource = {
  readonly kind: NotesOwnerKind;
  current(): Promise<NotesOwner | null>;
};

/** The anonymous source used in Phase 1B.1. */
export const ANONYMOUS_IDENTITY_SOURCE: IdentitySource = {
  kind: "anon",
  async current(): Promise<NotesOwner | null> {
    const raw = await getOrCreateAnonId();
    if (!raw) return null;
    return { kind: "anon", id: `${ANON_OWNER_PREFIX}${raw}` };
  },
};

/**
 * Resolve the current owner.
 *
 * There is deliberately NO runtime replacement path: the active source is a
 * constant, not mutable module state. A future authenticated (Supabase)
 * source is wired into this function by a code change, so no importer — not
 * even a deep one — can make the production factory resolve a different
 * owner.
 *
 * Internal: this is not exported from lib/notes/index.ts.
 */
export async function resolveIdentity(): Promise<NotesOwner | null> {
  return ANONYMOUS_IDENTITY_SOURCE.current();
}
