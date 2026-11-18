// lib/notes/storage.ts
//
// Phase 1B.1 — Storage implementations.
//
// Both implementations are owner-bound: an instance is created for exactly one
// owner namespace and refuses to read or write records belonging to another
// one. The bound owner is also the value written into every record.

import {
  openDB,
  closeDB,
  isDBOpen,
  idbGet,
  idbGetAllByIndex,
  idbPut,
  idbDelete,
  idbGetMeta,
  idbPutMeta,
  idbDeleteMeta,
  idbDeleteNotebookCascade,
  idbPutRecordIfNewer,
} from "./idb";
import { getStorageTestHooks } from "./test-hooks";
import { NOTES_ERROR_CODES, NotesError } from "./errors";
import {
  canonicalJson,
  notebookContent,
  normalizeRevision,
  pageContent,
} from "./content";
import type {
  NoteStorage,
  RevisionWriteResult,
  StorageNotebook,
  StoragePage,
  StorageBackup,
} from "./types";

export type { StorageNotebook, StoragePage };

function assertOwner(ownerId: string, boundOwnerId: string, what: string): void {
  if (ownerId !== boundOwnerId) {
    throw new NotesError(
      NOTES_ERROR_CODES.OWNER_MISMATCH,
      `OWNER_MISMATCH: ${what} belongs to another owner namespace`,
    );
  }
}

/**
 * Run the test-only pre-write hook, if any.
 *
 * It is awaited OUTSIDE of any transaction, so a hook may delay or fail a
 * write without keeping a transaction alive.
 */
async function runBeforeWrite(operation: string): Promise<void> {
  const hook = getStorageTestHooks()?.beforeWrite;
  if (!hook) return;
  await hook(operation);
}

/**
 * Transform a caller key into an owner-scoped meta key.
 *
 * The `meta` store holds both the GLOBAL identity key (written by
 * identity.ts through the raw idb helpers, untouched by this transformation)
 * and owner-scoped keys. Every owner-scoped read, write and delete goes
 * through this ONE function, so a key can never be read or overwritten by
 * another owner namespace.
 */
export function ownerScopedMetaKey(ownerId: string, key: string): string {
  return `${ownerId}:${key}`;
}

/**
 * Normalise a legacy record: records written before Phase 1B.2 have no
 * revision and are read as revision 0. Their content is never lost.
 */
export function normalizeNotebook(nb: StorageNotebook): StorageNotebook {
  return { ...nb, revision: normalizeRevision(nb.revision) };
}

/** Normalise a legacy page record — see normalizeNotebook. */
export function normalizePage(page: StoragePage): StoragePage {
  return { ...page, revision: normalizeRevision(page.revision) };
}

/** IndexedDB-backed storage, bound to one owner namespace. */
export class IndexedDBNoteStorage implements NoteStorage {
  readonly ownerId: string;

  constructor(ownerId: string) {
    this.ownerId = ownerId;
  }

  async open(): Promise<void> {
    await openDB();
  }

  close(): void {
    closeDB();
  }

  isOpen(): boolean {
    return isDBOpen();
  }

  async getNotebook(id: string): Promise<StorageNotebook | null> {
    const nb = await idbGet<StorageNotebook>("notebooks", id);
    if (!nb) return null;
    assertOwner(nb.ownerId, this.ownerId, "The notebook");
    return normalizeNotebook(nb);
  }

  async listNotebooks(): Promise<StorageNotebook[]> {
    const all = await idbGetAllByIndex<StorageNotebook>(
      "notebooks",
      "ownerId",
      this.ownerId,
    );
    return all
      .filter((nb) => nb.ownerId === this.ownerId)
      .map(normalizeNotebook);
  }

  async putNotebook(nb: StorageNotebook): Promise<RevisionWriteResult> {
    assertOwner(nb.ownerId, this.ownerId, "The notebook");
    await runBeforeWrite("putNotebook");
    const db = await openDB();
    return idbPutRecordIfNewer(
      db,
      "notebooks",
      { ...nb, revision: normalizeRevision(nb.revision) },
      notebookContent,
    );
  }

  async deleteNotebookCascade(notebookId: string): Promise<void> {
    const db = await openDB();
    await idbDeleteNotebookCascade(db, this.ownerId, notebookId);
  }

  async getPage(id: string): Promise<StoragePage | null> {
    const page = await idbGet<StoragePage>("pages", id);
    if (!page) return null;
    assertOwner(page.ownerId, this.ownerId, "The page");
    return normalizePage(page);
  }

  async listPages(notebookId?: string): Promise<StoragePage[]> {
    const all = await idbGetAllByIndex<StoragePage>(
      "pages",
      "ownerId",
      this.ownerId,
    );
    const owned = all
      .filter((p) => p.ownerId === this.ownerId)
      .map(normalizePage);
    if (!notebookId) return owned;
    return owned.filter((p) => p.notebookId === notebookId);
  }

  async putPage(page: StoragePage): Promise<RevisionWriteResult> {
    assertOwner(page.ownerId, this.ownerId, "The page");
    await runBeforeWrite("putPage");
    const db = await openDB();
    return idbPutRecordIfNewer(
      db,
      "pages",
      { ...page, revision: normalizeRevision(page.revision) },
      pageContent,
    );
  }

  async deletePage(id: string): Promise<void> {
    const page = await idbGet<StoragePage>("pages", id);
    if (page) assertOwner(page.ownerId, this.ownerId, "The page");
    await runBeforeWrite("deletePage");
    await idbDelete("pages", id);
  }

  async getBackup(id: string): Promise<StorageBackup | null> {
    const backup = await idbGet<StorageBackup>("pages_backup", id);
    if (backup) assertOwner(backup.ownerId, this.ownerId, "The backup");
    return backup;
  }

  async putBackup(backup: StorageBackup): Promise<void> {
    assertOwner(backup.ownerId, this.ownerId, "The backup");
    await runBeforeWrite("putBackup");
    await idbPut("pages_backup", backup);
  }

  async deleteBackup(id: string): Promise<void> {
    const backup = await idbGet<StorageBackup>("pages_backup", id);
    if (backup) assertOwner(backup.ownerId, this.ownerId, "The backup");
    await runBeforeWrite("deleteBackup");
    await idbDelete("pages_backup", id);
  }

  async getMeta(key: string): Promise<unknown> {
    return idbGetMeta(ownerScopedMetaKey(this.ownerId, key));
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    await runBeforeWrite("putMeta");
    await idbPutMeta(ownerScopedMetaKey(this.ownerId, key), value);
  }

  async deleteMeta(key: string): Promise<void> {
    await runBeforeWrite("deleteMeta");
    await idbDeleteMeta(ownerScopedMetaKey(this.ownerId, key));
  }
}

/**
 * In-memory storage for tests.
 *
 * Test double only — it is NOT exported from lib/notes/index.ts.
 *
 * Like a real IndexedDB database, the records live in a store that is shared
 * by every instance in the process, so two owner-bound instances see the same
 * data (exactly what two tabs of the same origin would see).
 */
export class InMemoryNoteStorage implements NoteStorage {
  readonly ownerId: string;

  private notebooks: Map<string, StorageNotebook>;
  private pages: Map<string, StoragePage>;
  private backups: Map<string, StorageBackup>;
  private meta: Map<string, unknown>;
  private openState = false;

  constructor(ownerId: string, store: InMemoryStore = sharedInMemoryStore) {
    this.ownerId = ownerId;
    this.notebooks = store.notebooks;
    this.pages = store.pages;
    this.backups = store.backups;
    this.meta = store.meta;
  }

  async open(): Promise<void> {
    this.openState = true;
  }

  close(): void {
    this.openState = false;
  }

  isOpen(): boolean {
    return this.openState;
  }

  async getNotebook(id: string): Promise<StorageNotebook | null> {
    const nb = this.notebooks.get(id) ?? null;
    if (!nb) return null;
    assertOwner(nb.ownerId, this.ownerId, "The notebook");
    return normalizeNotebook(nb);
  }

  async listNotebooks(): Promise<StorageNotebook[]> {
    return Array.from(this.notebooks.values())
      .filter((nb) => nb.ownerId === this.ownerId)
      .map(normalizeNotebook);
  }

  async putNotebook(nb: StorageNotebook): Promise<RevisionWriteResult> {
    assertOwner(nb.ownerId, this.ownerId, "The notebook");
    await runBeforeWrite("putNotebook");
    return applyRevisionWrite(
      this.notebooks,
      nb.id,
      { ...nb, revision: normalizeRevision(nb.revision) },
      notebookContent,
    );
  }

  async deleteNotebookCascade(notebookId: string): Promise<void> {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) {
      // No orphan cleanup policy in Phase 1B.1.
      return;
    }
    assertOwner(notebook.ownerId, this.ownerId, "The notebook");

    // Validate every related page BEFORE deleting anything, so the operation
    // is all-or-nothing.
    const related = Array.from(this.pages.values()).filter(
      (p) => p.notebookId === notebookId,
    );
    for (const page of related) {
      assertOwner(page.ownerId, this.ownerId, "A page of the notebook");
    }

    for (const page of related) {
      this.pages.delete(page.id);
    }
    this.notebooks.delete(notebookId);
  }

  async getPage(id: string): Promise<StoragePage | null> {
    const page = this.pages.get(id) ?? null;
    if (!page) return null;
    assertOwner(page.ownerId, this.ownerId, "The page");
    return normalizePage(page);
  }

  async listPages(notebookId?: string): Promise<StoragePage[]> {
    let result = Array.from(this.pages.values())
      .filter((p) => p.ownerId === this.ownerId)
      .map(normalizePage);
    if (notebookId) {
      result = result.filter((p) => p.notebookId === notebookId);
    }
    return result;
  }

  async putPage(page: StoragePage): Promise<RevisionWriteResult> {
    assertOwner(page.ownerId, this.ownerId, "The page");
    await runBeforeWrite("putPage");
    return applyRevisionWrite(
      this.pages,
      page.id,
      { ...page, revision: normalizeRevision(page.revision) },
      pageContent,
    );
  }

  async deletePage(id: string): Promise<void> {
    const page = this.pages.get(id);
    if (page) assertOwner(page.ownerId, this.ownerId, "The page");
    await runBeforeWrite("deletePage");
    this.pages.delete(id);
  }

  async getBackup(id: string): Promise<StorageBackup | null> {
    const backup = this.backups.get(id) ?? null;
    if (backup) assertOwner(backup.ownerId, this.ownerId, "The backup");
    return backup;
  }

  async putBackup(backup: StorageBackup): Promise<void> {
    assertOwner(backup.ownerId, this.ownerId, "The backup");
    await runBeforeWrite("putBackup");
    this.backups.set(backup.id, { ...backup });
  }

  async deleteBackup(id: string): Promise<void> {
    const backup = this.backups.get(id);
    if (backup) assertOwner(backup.ownerId, this.ownerId, "The backup");
    await runBeforeWrite("deleteBackup");
    this.backups.delete(id);
  }

  async getMeta(key: string): Promise<unknown> {
    const scoped = ownerScopedMetaKey(this.ownerId, key);
    return this.meta.has(scoped) ? this.meta.get(scoped) : null;
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    await runBeforeWrite("putMeta");
    this.meta.set(ownerScopedMetaKey(this.ownerId, key), value);
  }

  async deleteMeta(key: string): Promise<void> {
    await runBeforeWrite("deleteMeta");
    this.meta.delete(ownerScopedMetaKey(this.ownerId, key));
  }
}

/** The shared record store used by the in-memory double. */
export type InMemoryStore = {
  notebooks: Map<string, StorageNotebook>;
  pages: Map<string, StoragePage>;
  backups: Map<string, StorageBackup>;
  meta: Map<string, unknown>;
};

/** The store every in-memory instance shares by default. */
export const sharedInMemoryStore: InMemoryStore = {
  notebooks: new Map(),
  pages: new Map(),
  backups: new Map(),
  meta: new Map(),
};

/** Create an isolated store (for tests that need a clean slate). */
export function createInMemoryStore(): InMemoryStore {
  return {
    notebooks: new Map(),
    pages: new Map(),
    backups: new Map(),
    meta: new Map(),
  };
}

/** Empty the shared store. Test-only. */
export function resetInMemoryStore(): void {
  sharedInMemoryStore.notebooks.clear();
  sharedInMemoryStore.pages.clear();
  sharedInMemoryStore.backups.clear();
  sharedInMemoryStore.meta.clear();
}

/** Apply a revision-aware write to a Map-based store (in-memory double).
 *
 *  Rules (mirror idbPutRecordIfNewer logic):
 *    - no record yet                        → applied, store incoming
 *    - incoming revision is newer           → applied, overwrite
 *    - incoming revision is older           → stale, keep stored, no write
 *    - same revision, identical content     → unchanged (idempotent no-op)
 *    - same revision, different content     → conflict, reject, content untouched
 *
 *  Comparison and write happen within the same function call so the decision
 *  can never be made against a stale read.
 */
function applyRevisionWrite<T extends { id: string; revision?: number }>(
  store: Map<string, T>,
  id: string,
  record: T,
  contentOf: (record: T) => unknown,
): RevisionWriteResult {
  const incomingRevision = normalizeRevision(record.revision);
  const incomingContent = canonicalJson(contentOf(record));

  const existing = store.get(id);

  if (!existing) {
    // No current record → apply.
    store.set(id, { ...record, revision: incomingRevision });
    return { outcome: "applied" as const, revision: incomingRevision };
  }

  const currentRevision = normalizeRevision(existing.revision);
  const currentContent = canonicalJson(contentOf(existing));

  if (incomingRevision > currentRevision) {
    // Incoming is newer → apply atomically.
    store.set(id, { ...record, revision: incomingRevision });
    return { outcome: "applied" as const, revision: incomingRevision };
  }

  if (incomingRevision < currentRevision) {
    // Incoming is older → stale, no write.
    return { outcome: "stale" as const, revision: currentRevision };
  }

  // Same revision — compare content.
  if (currentContent === incomingContent) {
    // Idempotent no-op.
    return { outcome: "unchanged" as const, revision: currentRevision };
  }

  // Same revision, different content → conflict.
  return { outcome: "conflict" as const, revision: currentRevision };
}

/** Escape hatch used by the in-memory double to inspect raw state in tests. */
export function rawInMemoryRecords(storage: InMemoryNoteStorage): {
  notebooks: StorageNotebook[];
  pages: StoragePage[];
} {
  const anyStorage = storage as unknown as {
    notebooks: Map<string, StorageNotebook>;
    pages: Map<string, StoragePage>;
  };
  return {
    notebooks: Array.from(anyStorage.notebooks.values()),
    pages: Array.from(anyStorage.pages.values()),
  };
}
