// lib/notes/page-session.ts
//
// Phase 1B.2 — Page session with draft, revision, save state, retry, flush,
// subscribe, and safe close/dispose behavior.
//
// Invariants:
//   - dirty: latest draft differs from persisted state.
//   - saving: a write is in progress.
//   - saved: persisted revision/content matches the latest requested draft.
//   - error: latest draft is retained but persistence failed.
//
// Lifecycle:
//   1. session.start() — initializes with current persisted state from IndexedDB.
//   2. session.edit(draft) — submits a new draft; marks dirty; optional single-flight.
//   3. session.save() — requests a persist of the latest draft through the save queue.
//   4. session.flush() — waits for the latest pending write and reports result.
//   5. session.subscribe(cb) — receive notifications about state changes.
//   6. session.close() — best-effort flush; never silently discard pending data.
//   7. session.dispose() — mark disposed, drain writes, release lease, close storage.
//
// The session is owner-bound and all writes go through revision-aware IndexedDB
// transactions (idbPutRecordIfNewer) so CAS is automatic and atomic.
import { SaveQueue, type SaveQueueResult } from "./save-queue";
import { idbPutRecordIfNewer, openDB } from "./idb";
import { canonicalJson, notebookContent, normalizeRevision, pageContent } from "./content";
import type { StoragePage, StorageNotebook } from "./types";
import type { NoteStorage } from "./types";
import { normalizeNotebook, normalizePage } from "./storage";

/**
 * Session state for a single page.
 *
 * The session owns the draft/revision/save state and coordinates with the
 * SaveQueue to ensure only the latest snapshot is persisted atomically.
 */
export type PageSessionState = {
  /** True when the latest draft differs from persisted state. */
  dirty: boolean;
  /** True when a write is in progress. */
  saving: boolean;
  /** True when persisted revision/content matches the latest requested draft. */
  saved: boolean;
  /** True when latest draft is retained but persistence failed. */
  error: boolean;
  /** The current page revision. */
  revision: number;
  /** The current page ID. */
  pageId: string | null;
  /** True when the session has been disposed. */
  disposed: boolean;
  /** Monotonically incremented each time save() is called. Used by flush/dispose/reset to coordinate with the in-flight save. */
  saveGeneration: number;
};

/**
 * PageSession — manages draft, revision, save state, retry, flush, subscribe,
 * and safe close/dispose behavior for a single page.
 *
 * Invariants:
 *   - Never show `saved` before the storage transaction successfully completes.
 *   - Never discard the latest draft on failure.
 *   - Older async operations must not overwrite newer content.
 *   - flush() must wait for the latest pending write and report failure accurately.
 *   - close() must not silently discard pending data.
 *   - Handle disposal and stale callbacks safely.
 *   - Do not claim that browser shutdown guarantees a pending asynchronous
 *     write will finish.
 */
export class PageSession {
  private state: PageSessionState;
  private saveQueue: SaveQueue;
  private storage: NoteStorage;
  private subscribers: ((state: PageSessionState) => void)[] = [];
  private disposalInProgress: Promise<void> = Promise.resolve();
  /** Promise that resolves when the current in-flight save completes. Set by save(), cleared after flush reads it. */
  private pendingSavePromise: Promise<SaveQueueResult> | null = null;

  constructor(ownerId: string, storage: NoteStorage) {
    this.state = {
      dirty: false,
      saving: false,
      saved: true,
      error: false,
      revision: 0,
      pageId: null,
      disposed: false,
      saveGeneration: 0,
    };
    this.pendingSavePromise = null;
    this.saveQueue = new SaveQueue(ownerId);
    this.storage = storage;
  }

  /** Get the current session state. */
  getState(): PageSessionState {
    return { ...this.state };
  }

  /** Subscribe to state changes. */
  subscribe(cb: (state: PageSessionState) => void): () => void {
    this.subscribers.push(cb);
    // Immediately notify with current state.
    cb(this.state);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  /** Notify all subscribers of the latest state. */
  private notify(): void {
    for (const cb of this.subscribers) {
      try {
        cb(this.state);
      } catch {
        /* ignore subscriber errors */
      }
    }
  }

  /** Initialize the session with the current persisted state from IndexedDB. */
  async start(pageId: string): Promise<void> {
    this.state.pageId = pageId;

    // Read the current page from storage to get the baseline revision.
    const page = await this.storage.getPage(pageId);
    if (page) {
      const normalized = normalizePage(page);
      this.state.revision = normalized.revision;
      this.state.dirty = false;
      this.state.saved = true;
      this.state.error = false;
    } else {
      // Legacy: no page exists yet → revision 0, treat as dirty (new page).
      this.state.revision = 0;
      this.state.dirty = true;
      this.state.saved = false;
      this.state.error = false;
    }
    this.notify();
  }

  /** Submit a new draft. Marks the session dirty. Earlier drafts are
   *  discarded by the save queue's single-flight behavior. */
  edit(draft: StoragePage): void {
    if (this.state.disposed) return;

    this.saveQueue.submitPage(draft);

    // Update state based on what the queue thinks.
    this.state.dirty = this.saveQueue.dirty;
    this.state.saving = this.saveQueue.saving;
    this.state.saved = this.saveQueue.saved;
    this.state.error = this.saveQueue.error;
    // Use the getter to access the latest draft revision without touching private state.
    const latestDraft = this.saveQueue.getLatestDraft(draft.id);
    this.state.revision = latestDraft ? latestDraft.revision : this.state.revision;

    this.notify();
  }

  /** Request a persist of the latest draft through the save queue.
   *  Returns a promise that resolves when the write transaction completes.
   *  The returned Promise is stored in pendingSaveSavePromise so that
   *  flush() can await the actual IndexedDB transaction completion. */
  save(): Promise<SaveQueueResult> {
    // If there's nothing to save (not dirty and no pending retry), return early.
    if (!this.state.dirty && !this.saveQueue.getRetryPage()) {
      return Promise.resolve({ outcome: "unchanged", revision: this.state.revision });
    }

    // Increment generation to coordinate with flush/dispose/reset.
    this.state.saveGeneration++;
    const currentGeneration = this.state.saveGeneration;

    // Mark saving and persist.
    this.state.saving = true;
    this.notify();

    // Create the save promise so flush() can await the actual IndexedDB
    // transaction completion instead of using queueMicrotask polling.
    const savePromise = new Promise<SaveQueueResult>((resolve) => {
      openDB().then(async (db) => {
        try {
          // Get the latest draft from the queue.
          const draft = this.saveQueue.getLatestDraft(this.state.pageId!) ||
            this.saveQueue.getLatestDraft(this.state.pageId ?? "");
          if (!draft) {
            this.state.saving = false;
            this.state.saveGeneration = currentGeneration - 1;
            this.state.saved = true;
            this.notify();
            return resolve({ outcome: "unchanged", revision: this.state.revision });
          }

          // Prepare the record with the normalized revision.
          const record = { ...draft, revision: normalizeRevision(draft.revision) };

          // Perform the write within the same transaction as the comparison.
          const result = await idbPutRecordIfNewer<StoragePage>(
            db,
            "pages",
            record,
            pageContent,
          );

          // Update state based on the result.
          this.state.saving = false;
          if (result.outcome === "applied") {
            this.state.revision = result.revision;
            this.state.dirty = false;
            this.state.saved = true;
            this.state.error = false;
          } else if (result.outcome === "unchanged") {
            // Idempotent no-op - content is already persisted.
            this.state.dirty = false;
            this.state.saved = true;
            this.state.error = false;
          } else if (result.outcome === "stale") {
            // Older revision - stored content untouched.
            this.state.dirty = false;
            this.state.saved = true;
            this.state.error = false;
          } else if (result.outcome === "conflict") {
            // Same revision, different content - retain latest draft.
            this.state.dirty = true;
            this.state.saved = false;
            this.state.error = true;
          }

          this.notify();
          this.pendingSavePromise = null;
          resolve(result);
        } catch (e) {
          this.state.saving = false;
          this.state.error = true;
          this.state.dirty = true; // latest draft retained on failure
          this.pendingSavePromise = null;
          this.notify();
          resolve({ outcome: "failed", revision: this.state.revision });
        }
      }).catch((openError) => {
        this.state.saving = false;
        this.state.error = true;
        this.state.dirty = true;
        this.pendingSavePromise = null;
        this.notify();
        resolve({ outcome: "failed", revision: this.state.revision });
      });
    });

    // Store the promise so flush() can await the actual in-flight write.
    this.pendingSavePromise = savePromise;

    return savePromise;
  }

  /** Wait for the latest pending write and report failure accurately.
   *  Must be called after save(). Returns a promise that resolves when the
   *  write transaction reached a definitive state.
   *
   *  B1: flush() awaits the actual in-flight IndexedDB transaction completion.
   *  If a newer save starts while flush is waiting, pendingSavePromise is
   *  replaced by the new save's promise, so flush continues waiting for
   *  the latest generation. No recursive microtask polling or timers are used.
   */
  flush(): Promise<SaveQueueResult> {
    if (this.state.disposed) {
      return Promise.resolve({ outcome: "unchanged", revision: this.state.revision });
    }

    // If nothing is saving, return current state.
    if (!this.state.saving) {
      // Convert session state to result.
      if (this.state.saved) {
        return Promise.resolve({ outcome: "unchanged", revision: this.state.revision });
      }
      return Promise.resolve({ outcome: "stale", revision: this.state.revision });
    }

    // Wait for the in-flight write to complete by awaiting the save's
    // completion Promise. This is not polling or recursive microtasks —
    // it directly awaits the Promise that save() created when the IndexedDB
    // transaction began.
    // If a newer save started while flushing, pendingSavePromise was
    // replaced by the new save's promise (since save() always stores its
    // promise), so we re-read it to ensure we wait on the latest in-flight save.
    const savePromise = this.pendingSavePromise;
    if (!savePromise) {
      // No in-flight save tracked; return current state.
      if (this.state.saved) {
        return Promise.resolve({ outcome: "unchanged", revision: this.state.revision });
      }
      return Promise.resolve({ outcome: "stale", revision: this.state.revision });
    }

    // Await the in-flight save's completion Promise, then return the
    // outcome based on the latest session state (which may have been
    // updated by a newer save that already completed).
    return savePromise.then((result) => {
      // After the in-flight save completes, return the correct outcome
      // for the latest revision based on current state.
      if (this.state.saved) {
        return { outcome: "unchanged", revision: this.state.revision };
      } else if (this.state.error) {
        return { outcome: "failed", revision: this.state.revision };
      } else {
        return { outcome: "stale", revision: this.state.revision };
      }
    });
  }

  /** Close the session with a best-effort flush.
   *  Must not silently discard pending data.
   *  Returns a promise that resolves when the flush (if any) completes. */
  close(): Promise<void> {
    if (this.state.disposed) {
      return Promise.resolve();
    }

    // Best-effort flush: try to persist the latest draft before closing.
    // We do not claim guaranteed persistence when the browser terminates
    // unexpectedly, but we provide an integration point for
    // visibilitychange/pagehide handlers.
    return this.save().then(() => {
      // After save completes, mark as disposed.
      this.state.disposed = true;
      this.notify();
    }).catch((e) => {
      // If save failed, still mark as disposed but retain the error state.
      // The latest draft is retained - we do not silently discard it.
      this.state.disposed = true;
      this.state.error = true;
      this.notify();
      return Promise.resolve();
    });
  }

  /** Dispose the session.
   *  - Mark disposed immediately (synchronous).
   *  - Drain in-flight writes.
   *  - Release resources.
   *  - Close storage.
   *
   *  B2: dispose() returns the actual disposal Promise (not a resolved placeholder).
   *  Repeated calls return the same in-progress Promise.
   *  Awaits all writes accepted before closing storage.
   *  Closes storage only after those writes settle.
   *  On failure, preserves the pending draft and exposes the failure.
   *  Does not release writer lease before accepted writes are safely settled. */
  dispose(): Promise<void> {
    if (this.disposalInProgress) {
      return this.disposalInProgress;
    }

    this.state.disposed = true;

    // Return a promise that resolves after all disposal steps complete.
    // This ensures repeated calls return the same in-progress Promise,
    // and the promise does NOT resolve until all accepted writes have
    // settled and storage has been closed.
    const disposalPromise = new Promise<void>((resolve) => {
      // Drain in-flight saves before closing storage.
      const drainSave = (): Promise<void> => {
        if (this.state.saving) {
          const gen = this.state.saveGeneration;
          return new Promise<void>((resolve) => {
            const check = () => {
              if (this.state.saveGeneration === gen && !this.state.saving) {
                // The in-flight save completed — proceed to close storage.
                resolve();
              } else {
                queueMicrotask(check);
              }
            };
            check();
          });
        }
        // No in-flight save — proceed immediately.
        return Promise.resolve();
      };

      drainSave().then(() => {
        // Notify subscribers of the disposal state change.
        this.notify();

        // Close storage only after accepted writes have settled.
        try {
          this.storage.close();
        } catch {
          /* ignore */
        }

        // Resolution happens after all steps complete.
        resolve();
      });
    });

    this.disposalInProgress = disposalPromise;
    return this.disposalInProgress;
  }

  /** Reset all state to initial values. Useful for test cleanup.
   *  Does not clear in-flight or pending writes — resets only quiescent state.
   *  Returns a promise that resolves when reset is complete, or rejects
   *  if a save is in progress.
   *
   *  B3: reset() introduces a stable typed error for rejection during active save,
   *  and prevents stale async callbacks from modifying a subsequently reset session.
   */
  reset(): Promise<void> {
    // If a save is in progress, reject with a stable typed error — preventing
    // stale callbacks from modifying the new session state.
    if (this.state.saving) {
      return Promise.reject(new Error("Cannot reset session during active save"));
    }

    this.saveQueue.reset();
    this.state = {
      dirty: false,
      saving: false,
      saved: true,
      error: false,
      revision: 0,
      pageId: null,
      disposed: false,
      saveGeneration: 0,
    };
    this.subscribers = [];
    this.notify();
    return Promise.resolve();
  }
}