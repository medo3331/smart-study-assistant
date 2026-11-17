// lib/notes/factory.ts
//
// Phase 1B.1 — The trusted repository factory.
//
// This is the ONLY production entry point to a repository. It takes no
// arguments: the owner namespace is derived from the trusted identity source,
// never from a caller. A UI component cannot choose which namespace it
// operates on, and it cannot supply an AuthContext-shaped object to fake one.

import { resolveIdentity } from "./identity";
import { acquireOwnerWriterLease } from "./locks";
import { IndexedDBNoteStorage } from "./storage";
import { isIndexedDBAvailable } from "./idb";
import { NOTES_ERROR_CODES, NotesError } from "./errors";
import { createNoteRepositoryInternal, type NoteRepository } from "./repository";

/**
 * Create a repository for the current owner.
 *
 * Fails closed:
 *  * IndexedDB unavailable → NOTES_IDENTITY_UNAVAILABLE.
 *  * The anonymous identity cannot be established → NOTES_IDENTITY_UNAVAILABLE.
 *
 * There is no in-memory fallback in production.
 *
 * The returned repository is read-only until this tab holds the owner write
 * lease; `repo.status` reports which state it is in.
 */
export async function createNoteRepository(): Promise<NoteRepository> {
  if (!isIndexedDBAvailable()) {
    throw new NotesError(
      NOTES_ERROR_CODES.IDENTITY_UNAVAILABLE,
      "NOTES_IDENTITY_UNAVAILABLE: IndexedDB is not available in this environment",
    );
  }

  const owner = await resolveIdentity();
  if (!owner) {
    throw new NotesError(
      NOTES_ERROR_CODES.IDENTITY_UNAVAILABLE,
      "NOTES_IDENTITY_UNAVAILABLE: the anonymous identity could not be established",
    );
  }

  const storage = new IndexedDBNoteStorage(owner.id);
  await storage.open();

  const lease = await acquireOwnerWriterLease(owner.id);

  return createNoteRepositoryInternal({ owner, storage, lease });
}
