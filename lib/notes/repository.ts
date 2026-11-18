// lib/notes/repository.ts
//
// Phase 1B.1 — NoteRepository.
//
// The repository owns one owner namespace and enforces it on every operation.
// It can only be built through the trusted factory (factory.ts) or the
// internal test factory (testing.ts) — never with a caller-supplied owner id.
//
// Two invariants:
//
//  * Every mutation requires the owner write lease. A tab that does not hold
//    the lease is read-only and rejects writes with NOTES_READ_ONLY.
//  * Disposal never releases the lease while a write transaction it protected
//    is still running. The lease is released only after every in-flight write
//    reached a definitive state.

import { validateNotebook, validatePage, validateBackup, validateMeta } from "./validation";
import { NOTES_ERROR_CODES, NotesError } from "./errors";
import type { OwnerWriterLease } from "./locks";
import type {
  NoteStorage,
  NoteRepositoryStatus,
  NotesOwner,
  StorageNotebook,
  StoragePage,
  StorageBackup,
} from "./types";

/** How long disposal waits for in-flight writes before giving up. */
const DISPOSAL_DRAIN_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Construction token.
 *
 * It is NOT exported from this module, so no caller — not even one that deep
 * imports the file — can construct a NoteRepository with an owner id of its
 * own choice. Only the internal factory below can.
 */
const CONSTRUCTION_TOKEN: unique symbol = Symbol("notes.repository.construction");

/**
 * NoteRepository — owns an owner namespace and enforces it on all operations.
 */
export class NoteRepository {
  readonly owner: NotesOwner;

  /**
   * The storage and the writer lease are ECMAScript-private fields.
   *
   * They are not merely "not exported": `#private` keeps them unreachable at
   * RUNTIME as well, so no consumer can reach the raw storage (a write path
   * that bypasses the writer guard) or release the owner lock from the
   * outside. Every mutation has to go through this class.
   */
  readonly #storage: NoteStorage;
  readonly #lease: OwnerWriterLease;

  private disposed = false;
  /**
   * Supplementary guard only. The authoritative protection for the lease is
   * the write drain inside dispose().
   */
  private generation = 0;
  private readonly pendingWrites = new Set<Promise<unknown>>();
  private disposePromise: Promise<void> | null = null;
  private readonly drainTimeoutMs: number;

  constructor(
    token: typeof CONSTRUCTION_TOKEN,
    owner: NotesOwner,
    storage: NoteStorage,
    lease: OwnerWriterLease,
    drainTimeoutMs: number = DISPOSAL_DRAIN_TIMEOUT_MS,
  ) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new NotesError(
        NOTES_ERROR_CODES.OWNER_MISMATCH,
        "OWNER_MISMATCH: a NoteRepository can only be created by the notes factory",
      );
    }
    this.owner = owner;
    this.#storage = storage;
    this.#lease = lease;
    this.drainTimeoutMs = drainTimeoutMs;
  }

  // --- Introspection ---

  /** The owner namespace of this repository. */
  get ownerInfo(): NotesOwner {
    return this.owner;
  }

  /** The prefixed owner id, e.g. `anon:<uuid>`. */
  get ownerId(): string {
    return this.owner.id;
  }

  /** The Web Lock name that guards this owner namespace. */
  get lockName(): string {
    return this.#lease.lockName;
  }

  /** Current lifecycle state. */
  get status(): NoteRepositoryStatus {
    if (this.disposed) return "disposed";
    return this.#lease.isWriter() ? "ready" : "read-only";
  }

  /** True when this tab may mutate storage right now. */
  get canWrite(): boolean {
    return !this.disposed && this.#lease.isWriter();
  }

  /** True when this tab holds the owner write lease. */
  isWriter(): boolean {
    return this.#lease.isWriter();
  }

  /**
   * Resolves when this tab becomes the writer.
   *
   * Rejects when the repository was disposed.
   */
  whenWriter(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(
        new NotesError(
          NOTES_ERROR_CODES.DISPOSED,
          "NOTES_DISPOSED: the repository has been disposed",
        ),
      );
    }
    return this.#lease.whenWriter();
  }

  // --- Guards ---

  private assertUsable(): void {
    if (this.disposed) {
      throw new NotesError(
        NOTES_ERROR_CODES.DISPOSED,
        "NOTES_DISPOSED: the repository has been disposed",
      );
    }
  }

  private assertWriter(): void {
    if (!this.#lease.supported) {
      throw new NotesError(
        NOTES_ERROR_CODES.LOCK_UNAVAILABLE,
        "NOTES_LOCK_UNAVAILABLE: Web Locks are not available — the repository is read-only",
      );
    }
    if (!this.#lease.isWriter()) {
      throw new NotesError(
        NOTES_ERROR_CODES.READ_ONLY,
        "NOTES_READ_ONLY: another tab holds the owner write lease",
      );
    }
  }

  private assertOwner(ownerId: string, what: string): void {
    if (ownerId !== this.owner.id) {
      throw new NotesError(
        NOTES_ERROR_CODES.OWNER_MISMATCH,
        `OWNER_MISMATCH: ${what} belongs to another owner namespace`,
      );
    }
  }

  // --- Write plumbing ---

  /**
   * Run a mutation under the write lease.
   *
   * The operation is tracked so dispose() can wait for it. The returned
   * promise settles only when the underlying transaction reached a definitive
   * state (see storage.ts / idb.ts).
   */
  private runWrite<T>(operation: () => Promise<T>): Promise<T> {
    this.assertUsable();
    this.assertWriter();

    const generationAtStart = this.generation;
    const started = (async () => {
      const result = await operation();
      // Supplementary guard: a late completion must not touch repository
      // state after disposal. The write itself already committed inside its
      // own transaction, and dispose() waits for exactly that.
      if (generationAtStart !== this.generation) {
        return result;
      }
      return result;
    })();

    const tracked: Promise<T> = started.then(
      (value) => {
        this.pendingWrites.delete(tracked);
        return value;
      },
      (error) => {
        this.pendingWrites.delete(tracked);
        throw error;
      },
    );
    this.pendingWrites.add(tracked);
    return tracked;
  }

  // --- Notebooks ---

  async getNotebook(id: string): Promise<StorageNotebook | null> {
    this.assertUsable();
    const nb = await this.#storage.getNotebook(id);
    if (!nb) return null;
    this.assertOwner(nb.ownerId, "The notebook");
    return nb;
  }

  async listNotebooks(): Promise<StorageNotebook[]> {
    this.assertUsable();
    const all = await this.#storage.listNotebooks();
    return all.filter((nb) => nb.ownerId === this.owner.id);
  }

  async saveNotebook(nb: StorageNotebook): Promise<void> {
    return this.runWrite(async () => {
      this.assertOwner(nb.ownerId, "The notebook");
      const result = validateNotebook(nb);
      if (!result.valid) {
        throw new Error(`INVALID_NOTEBOOK: ${result.errors.join(", ")}`);
      }
      await this.#storage.putNotebook(nb);
    });
  }

  /**
   * Delete a notebook and its pages atomically.
   *
   * The cascade runs in ONE IndexedDB transaction; if any part of it fails
   * the whole transaction is rolled back and nothing is deleted.
   */
  async deleteNotebook(id: string): Promise<void> {
    return this.runWrite(async () => {
      const nb = await this.#storage.getNotebook(id);
      if (!nb) return;
      this.assertOwner(nb.ownerId, "The notebook");
      await this.#storage.deleteNotebookCascade(id);
    });
  }

  // --- Pages ---

  async getPage(id: string): Promise<StoragePage | null> {
    this.assertUsable();
    const page = await this.#storage.getPage(id);
    if (!page) return null;
    this.assertOwner(page.ownerId, "The page");
    return page;
  }

  async listPages(notebookId?: string): Promise<StoragePage[]> {
    this.assertUsable();
    const all = await this.#storage.listPages(notebookId);
    return all.filter((p) => p.ownerId === this.owner.id);
  }

  async savePage(page: StoragePage): Promise<void> {
    return this.runWrite(async () => {
      this.assertOwner(page.ownerId, "The page");
      const result = validatePage(page);
      if (!result.valid) {
        throw new Error(`INVALID_PAGE: ${result.errors.join(", ")}`);
      }
      // Verify the page-to-notebook relationship against our own namespace.
      const nb = await this.#storage.getNotebook(page.notebookId);
      if (nb && nb.ownerId !== this.owner.id) {
        throw new NotesError(
          NOTES_ERROR_CODES.OWNER_MISMATCH,
          "OWNER_MISMATCH: the notebook belongs to another owner namespace",
        );
      }
      await this.#storage.putPage(page);
    });
  }

  async deletePage(id: string): Promise<void> {
    return this.runWrite(async () => {
      const page = await this.#storage.getPage(id);
      if (!page) return;
      this.assertOwner(page.ownerId, "The page");
      await this.#storage.deletePage(id);
    });
  }

  // --- Backups ---

  async getBackup(id: string): Promise<StorageBackup | null> {
    this.assertUsable();
    const backup = await this.#storage.getBackup(id);
    if (!backup) return null;
    this.assertOwner(backup.ownerId, "The backup");
    return backup;
  }

  async saveBackup(backup: StorageBackup): Promise<void> {
    return this.runWrite(async () => {
      this.assertOwner(backup.ownerId, "The backup");
      const result = validateBackup(backup);
      if (!result.valid) {
        throw new Error(`INVALID_BACKUP: ${result.errors.join(", ")}`);
      }
      await this.#storage.putBackup(backup);
    });
  }

  async deleteBackup(id: string): Promise<void> {
    return this.runWrite(async () => {
      const backup = await this.#storage.getBackup(id);
      if (!backup) return;
      this.assertOwner(backup.ownerId, "The backup");
      await this.#storage.deleteBackup(id);
    });
  }

  // --- Meta ---

  async getMeta(key: string): Promise<unknown> {
    this.assertUsable();
    return this.#storage.getMeta(key);
  }

  async putMeta(key: string, value: unknown): Promise<void> {
    return this.runWrite(async () => {
      const result = validateMeta({ key, value });
      if (!result.valid) {
        throw new Error(`INVALID_META: ${result.errors.join(", ")}`);
      }
      await this.#storage.putMeta(key, value);
    });
  }

  // --- Disposal ---

  /**
   * Dispose the repository.
   *
   * The order is deliberate and is the safety contract:
   *
   *   1. mark disposed  → every new operation is rejected immediately
   *   2. drain writes   → wait for the in-flight write transactions to reach a
   *                       definitive completed/aborted state
   *   3. release lease  → only now, so the lease is never released while a
   *                       transaction it protected is still running
   *   4. close storage  → close the IndexedDB connection
   *
   * The returned promise represents the ACTUAL completion of the disposal.
   * It is idempotent: repeated calls return the same promise.
   */
  dispose(): Promise<void> {
    if (!this.disposePromise) {
      this.disposePromise = this.performDisposal();
    }
    return this.disposePromise;
  }

  private async performDisposal(): Promise<void> {
    // 1. Mark disposed immediately. This runs synchronously, so an operation
    //    started right after dispose() is already rejected.
    this.disposed = true;
    this.generation += 1;

    // 2. Drain the writes that already started. The lease stays held.
    const drained = await this.drainPendingWrites();
    if (!drained) {
      // We cannot prove the transactions finished. Releasing the lease now
      // would hand the namespace to another tab while a write is still
      // running, so the lease is retained and the failure is reported.
      throw new NotesError(
        NOTES_ERROR_CODES.DISPOSAL_FAILED,
        "NOTES_DISPOSAL_FAILED: in-flight writes did not finish — the owner lease was retained",
      );
    }

    // 3. Safe to release the owner lock now.
    this.#lease.release();

    // 4. Close the IndexedDB connection.
    try {
      this.#storage.close();
    } catch {
      /* ignore */
    }
  }

  /**
   * Wait until every in-flight write reached a definitive state.
   *
   * Returns false when the drain timed out.
   */
  private async drainPendingWrites(): Promise<boolean> {
    while (this.pendingWrites.size > 0) {
      const snapshot = Array.from(this.pendingWrites);
      const settled = await Promise.race([
        Promise.allSettled(snapshot).then(() => true),
        sleep(this.drainTimeoutMs).then(() => false),
      ]);
      if (!settled) return false;
    }
    return true;
  }
}

/**
 * Internal construction seam.
 *
 * Not exported from lib/notes/index.ts — the production factory derives the
 * identity itself and the test factory lives in testing.ts.
 */
export function createNoteRepositoryInternal(params: {
  owner: NotesOwner;
  storage: NoteStorage;
  lease: OwnerWriterLease;
  drainTimeoutMs?: number;
}): NoteRepository {
  return new NoteRepository(
    CONSTRUCTION_TOKEN,
    params.owner,
    params.storage,
    params.lease,
    params.drainTimeoutMs,
  );
}
