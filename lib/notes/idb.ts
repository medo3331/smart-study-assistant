// lib/notes/idb.ts
//
// Phase 1B.1 — Native IndexedDB wrapper.
//
// Invariants enforced here:
//
//  * A single shared pending-open Promise. Two concurrent openDB() calls
//    never open two connections; `dbInstance` alone is NOT enough to prevent
//    that race, because the instance is only assigned once the open resolves.
//  * `versionchange` and `close` are handled per connection. A handler must
//    never close a different connection than the one that raised the event.
//  * Native DOMException instances are propagated unchanged. A quota failure
//    stays a QuotaExceededError.
//  * A promise settles only once its transaction reached a definitive state
//    (complete or aborted) — never in between.
//  * No `await` of arbitrary asynchronous work inside an active transaction.
//    Only IDB request callbacks are used.

import { getStorageTestHooks } from "./test-hooks";
import { NOTES_ERROR_CODES, NotesError } from "./errors";
import { canonicalJson, decideRevisionWrite, normalizeRevision } from "./content";
import type { StorageNotebook, StoragePage } from "./types";
import type { RevisionWriteOutcome, RevisionWriteResult } from "./types";

const DB_NAME = "magicly-notes";
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let openPromise: Promise<IDBDatabase> | null = null;
let connectionEpoch = 0;

function isInvalidStateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "InvalidStateError"
  );
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

/**
 * Open (or create) the IndexedDB database.
 *
 * Concurrent calls share one pending-open Promise, so the database is opened
 * exactly once per epoch.
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (openPromise) return openPromise;

  const openedEpoch = connectionEpoch;

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new DOMException(
          "IndexedDB is not available in this environment",
          "NotSupportedError",
        ),
      );
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains("notebooks")) {
        const ns = db.createObjectStore("notebooks", { keyPath: "id" });
        ns.createIndex("ownerId", "ownerId", { unique: false });
      }

      if (!db.objectStoreNames.contains("pages")) {
        const ps = db.createObjectStore("pages", { keyPath: "id" });
        ps.createIndex("ownerId", "ownerId", { unique: false });
        ps.createIndex("notebookId", "notebookId", { unique: false });
      }

      if (!db.objectStoreNames.contains("pages_backup")) {
        const bs = db.createObjectStore("pages_backup", { keyPath: "id" });
        bs.createIndex("ownerId", "ownerId", { unique: false });
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }

      void oldVersion;
    };

    request.onsuccess = () => {
      const db = request.result;

      if (openedEpoch !== connectionEpoch) {
        // The connection was invalidated while it was opening (closeDB or a
        // forced close). Do not install a stale connection.
        try {
          db.close();
        } catch {
          /* ignore */
        }
        reject(abortError("Database connection was closed while opening"));
        return;
      }

      dbInstance = db;

      // Connection-specific: close THIS connection, never a shared one.
      db.onversionchange = () => {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        if (dbInstance === db) {
          dbInstance = null;
          connectionEpoch += 1;
        }
      };

      // Fired only when the connection is closed unexpectedly — it is NOT
      // fired by close(). The explicit close path invalidates the instance
      // itself, so both paths are covered.
      db.onclose = () => {
        if (dbInstance === db) {
          dbInstance = null;
          connectionEpoch += 1;
        }
      };

      resolve(db);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new DOMException("Failed to open IndexedDB", "UnknownError"),
      );
    };

    request.onblocked = () => {
      reject(
        new DOMException(
          "IndexedDB open blocked — another tab is holding an older version",
          "BlockedError",
        ),
      );
    };
  });

  openPromise = pending;
  void pending.then(
    () => {
      if (openPromise === pending) openPromise = null;
    },
    () => {
      if (openPromise === pending) openPromise = null;
    },
  );

  return pending;
}

/**
 * Close the database connection and invalidate it.
 *
 * Any in-flight open is invalidated too: when it resolves it closes the
 * freshly opened connection instead of installing it.
 */
export function closeDB(): void {
  connectionEpoch += 1;
  const db = dbInstance;
  dbInstance = null;
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

/** Check if a connection is currently held. */
export function isDBOpen(): boolean {
  return dbInstance !== null;
}

/** Drop the cached connection without closing it (used after a forced close). */
function invalidateConnection(db: IDBDatabase): void {
  if (dbInstance === db) {
    dbInstance = null;
    connectionEpoch += 1;
  }
}

/**
 * Run one request in one transaction.
 *
 * The returned promise settles only after the transaction reached a definitive
 * state. A request-level error is captured from the request itself so the
 * native DOMException (e.g. QuotaExceededError) survives.
 */
async function runStoreTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  makeRequest: (store: IDBObjectStore) => IDBRequest,
  readResult: (request: IDBRequest) => T,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const db = await openDB();

    try {
      return await new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(storeName, mode);
        } catch (error) {
          reject(error);
          return;
        }

        let failure: unknown = null;
        let requestError: DOMException | null = null;
        let request: IDBRequest | null = null;

        // The transaction handlers are registered BEFORE the request is
        // created: a request that fails synchronously must still reach a
        // definitive transaction state, otherwise the promise never settles.
        tx.oncomplete = () => {
          if (failure ?? requestError) {
            reject(failure ?? requestError);
            return;
          }
          resolve(readResult(request as IDBRequest));
        };

        // The error event bubbles up from the request; the transaction aborts
        // right after, and onabort reports the definitive state.
        tx.onerror = () => {
          /* the abort that follows is what settles the promise */
        };

        tx.onabort = () => {
          reject(
            failure ??
              requestError ??
              tx.error ??
              abortError("IndexedDB transaction aborted"),
          );
        };

        try {
          request = makeRequest(tx.objectStore(storeName));
        } catch (error) {
          // A synchronous failure (e.g. a clone error) happened before any
          // request was created. The transaction therefore has nothing to
          // commit: it commits empty and oncomplete reports the failure.
          // Rejecting here would report the error before the transaction
          // reached a definitive state.
          failure = error;
          return;
        }

        request.onerror = () => {
          requestError = request?.error ?? null;
        };
      });
    } catch (error) {
      if (attempt === 0 && isInvalidStateError(error)) {
        // The connection died between openDB() and the transaction call.
        // Drop it and retry once against a fresh connection.
        invalidateConnection(db);
        continue;
      }
      throw error;
    }
  }

  throw new DOMException("IndexedDB transaction failed", "UnknownError");
}

/**
 * Write a record with a revision guard, inside ONE transaction.
 *
 * The comparison and the write happen in the same transaction, so the
 * decision can never be made against a stale read:
 *
 *   - no record yet                     → applied
 *   - incoming revision is newer        → applied
 *   - incoming revision is older        → stale   (stored content untouched)
 *   - same revision, identical content  → unchanged (idempotent no-op)
 *   - same revision, different content  → conflict (rejected, content untouched)
 *
 * `contentOf` projects the durable content of a record; timestamps are
 * excluded so that a retry of the same revision stays idempotent.
 */
export function idbPutRecordIfNewer<T extends { id: string; revision?: number }>(
  db: IDBDatabase,
  storeName: string,
  record: T,
  contentOf: (record: T) => unknown,
): Promise<RevisionWriteResult> {
  const incomingRevision = normalizeRevision(record.revision);
  const incomingContent = canonicalJson(contentOf(record));

  return new Promise<RevisionWriteResult>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, "readwrite");
    } catch (error) {
      reject(error);
      return;
    }

    let decision: RevisionWriteOutcome | "conflict" | null = null;
    let storedRevision = incomingRevision;
    let failure: unknown = null;
    let requestError: DOMException | null = null;

    tx.oncomplete = () => {
      if (failure) {
        reject(failure);
        return;
      }
      resolve({ outcome: decision as RevisionWriteOutcome, revision: storedRevision });
    };

    tx.onerror = () => {
      /* the abort that follows settles the promise */
    };

    tx.onabort = () => {
      reject(
        failure ??
          requestError ??
          tx.error ??
          abortError("IndexedDB transaction aborted"),
      );
    };

    const store = tx.objectStore(storeName);
    const getRequest = store.get(record.id);

    getRequest.onerror = () => {
      requestError = getRequest.error;
    };

    getRequest.onsuccess = () => {
      const current = getRequest.result as T | undefined;
      const currentRevision = current ? normalizeRevision(current.revision) : null;
      const currentContent = current
        ? canonicalJson(contentOf(current))
        : null;

      const verdict = decideRevisionWrite(
        currentRevision,
        currentContent,
        incomingRevision,
        incomingContent,
      );

      if (verdict === "conflict") {
        failure = new NotesError(
          NOTES_ERROR_CODES.REVISION_CONFLICT,
          "NOTES_REVISION_CONFLICT: the record already holds this revision with different content",
        );
        try {
          tx.abort();
        } catch {
          /* the abort event settles the promise */
        }
        return;
      }

      if (verdict === "stale" || verdict === "unchanged") {
        decision = verdict;
        storedRevision = currentRevision ?? incomingRevision;
        return;
      }

      // applied — write inside the SAME transaction.
      decision = "applied";
      storedRevision = incomingRevision;
      const putRequest = store.put({ ...record, revision: incomingRevision });
      putRequest.onerror = () => {
        requestError = putRequest.error;
      };
    };
  });
}

/** Get a record by key from a store. */
export function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  return runStoreTx(
    storeName,
    "readonly",
    (store) => store.get(key),
    (request) => (request.result as T | undefined) ?? null,
  );
}

/** Get all records from a store matching an index value. */
export function idbGetAllByIndex<T>(
  storeName: string,
  indexName: string,
  value: string,
): Promise<T[]> {
  return runStoreTx(
    storeName,
    "readonly",
    (store) => store.index(indexName).getAll(value),
    (request) => (request.result as T[] | undefined) ?? [],
  );
}

/** Get all records from a store. */
export function idbGetAll<T>(storeName: string): Promise<T[]> {
  return runStoreTx(
    storeName,
    "readonly",
    (store) => store.getAll(),
    (request) => (request.result as T[] | undefined) ?? [],
  );
}

/** Put (insert or update) a record in a store. */
export function idbPut<T extends { id?: string; key?: string }>(
  storeName: string,
  record: T,
): Promise<void> {
  return runStoreTx(
    storeName,
    "readwrite",
    (store) => store.put(record),
    () => undefined,
  );
}

/** Delete a record by key from a store. */
export function idbDelete(storeName: string, key: string): Promise<void> {
  return runStoreTx(
    storeName,
    "readwrite",
    (store) => store.delete(key),
    () => undefined,
  );
}

/** Get a meta value by key. */
export function idbGetMeta(key: string): Promise<unknown> {
  return runStoreTx(
    "meta",
    "readonly",
    (store) => store.get(key),
    (request) => {
      const row = request.result as { value?: unknown } | undefined;
      return row ? (row.value ?? null) : null;
    },
  );
}

/** Put a meta value. */
export function idbPutMeta(key: string, value: unknown): Promise<void> {
  return runStoreTx(
    "meta",
    "readwrite",
    (store) => store.put({ key, value }),
    () => undefined,
  );
}

/** Delete a meta value. */
export function idbDeleteMeta(key: string): Promise<void> {
  return runStoreTx(
    "meta",
    "readwrite",
    (store) => store.delete(key),
    () => undefined,
  );
}

/**
 * Delete a notebook and every page that belongs to it in ONE transaction.
 *
 * Rules:
 *  * The notebook ownership is verified INSIDE the transaction.
 *  * A page that references the notebook but belongs to another owner aborts
 *    the whole transaction — foreign records are never silently skipped.
 *  * If the notebook does not exist nothing is deleted: there is no approved
 *    orphan-cleanup policy in Phase 1B.1.
 *  * The promise settles only when the transaction completed or aborted.
 */
export function idbDeleteNotebookCascade(
  db: IDBDatabase,
  ownerId: string,
  notebookId: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(["pages", "notebooks"], "readwrite");
    } catch (error) {
      reject(error);
      return;
    }

    let failure: unknown = null;
    let requestError: DOMException | null = null;

    tx.oncomplete = () => {
      if (failure) {
        reject(failure);
        return;
      }
      resolve();
    };

    tx.onerror = () => {
      /* the abort that follows settles the promise */
    };

    tx.onabort = () => {
      reject(
        failure ??
          requestError ??
          tx.error ??
          abortError("IndexedDB transaction aborted"),
      );
    };

    const notebooks = tx.objectStore("notebooks");
    const pages = tx.objectStore("pages");

    // Test-only seam: a hook may abort the transaction before anything is
    // deleted. In production no hook is installed, so this is a no-op.
    runCascadeTestHook(tx);

    let getRequest: IDBRequest;
    try {
      getRequest = notebooks.get(notebookId);
    } catch {
      // The transaction can no longer accept requests — it was aborted (e.g.
      // by a test hook). The abort event settles the promise with the
      // original transaction error.
      return;
    }
    getRequest.onerror = () => {
      requestError = getRequest.error;
    };
    getRequest.onsuccess = () => {
      const notebook = getRequest.result as StorageNotebook | undefined;

      if (!notebook) {
        // Nothing to delete. Orphan pages are left alone on purpose.
        return;
      }

      if (notebook.ownerId !== ownerId) {
        failure = new NotesError(
          NOTES_ERROR_CODES.OWNER_MISMATCH,
          "OWNER_MISMATCH: the notebook belongs to another owner namespace",
        );
        try {
          tx.abort();
        } catch {
          /* the abort event settles the promise */
        }
        return;
      }

      const cursorRequest = pages
        .index("notebookId")
        .openCursor(IDBKeyRange.only(notebookId));

      cursorRequest.onerror = () => {
        requestError = cursorRequest.error;
      };

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          // Every page of this notebook was removed → remove the notebook.
          notebooks.delete(notebookId);
          return;
        }

        const page = cursor.value as StoragePage;
        if (page.ownerId !== ownerId) {
          // Ownership inconsistency → abort everything, delete nothing.
          failure = new NotesError(
            NOTES_ERROR_CODES.OWNER_MISMATCH,
            "OWNER_MISMATCH: a page of this notebook belongs to another owner namespace",
          );
          try {
            tx.abort();
          } catch {
            /* the abort event settles the promise */
          }
          return;
        }

        cursor.delete();
        cursor.continue();
      };
    };
  });
}

/**
 * Run the test-only cascade hook (if any) inside the transaction.
 * Production installs no hook, so this is a no-op.
 */
export function runCascadeTestHook(tx: IDBTransaction): void {
  const hook = getStorageTestHooks()?.beforeCascadeDelete;
  if (hook) hook(tx);
}

/** Check if IndexedDB is available. */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
