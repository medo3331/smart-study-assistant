import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestNoteRepository,
  createTestOwner,
  createTestWriterLease,
} from "../testing";
import { InMemoryNoteStorage, createInMemoryStore } from "../storage";
import type { InMemoryStore } from "../storage";
import { setStorageTestHooks } from "../test-hooks";
import type { NoteRepository } from "../repository";
import type { StorageNotebook, StoragePage } from "../types";

const OWNER_A = createTestOwner("anon", "owner-a");
const OWNER_B = createTestOwner("anon", "owner-b");

const NOW = "2026-01-01T00:00:00.000Z";

function notebook(id: string, ownerId: string): StorageNotebook {
  return {
    id,
    ownerId,
    title: id,
    pageIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function page(id: string, ownerId: string, notebookId: string): StoragePage {
  return {
    id,
    ownerId,
    notebookId,
    template: "lined",
    persistedSnapshot: {},
    localJournal: [],
    quarantined: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("NoteRepository", () => {
  let storage: InMemoryNoteStorage;
  let store: InMemoryStore;
  let repo: NoteRepository;

  /** A storage bound to another owner namespace, sharing the same records. */
  const foreignStorage = () => new InMemoryNoteStorage(OWNER_B.id, store);

  beforeEach(async () => {
    store = createInMemoryStore();
    storage = new InMemoryNoteStorage(OWNER_A.id, store);
    await storage.open();
    repo = createTestNoteRepository({ owner: OWNER_A, storage });
  });

  afterEach(() => {
    setStorageTestHooks(null);
  });

  // --- Notebook CRUD ---

  it("creates and retrieves a notebook", async () => {
    await repo.saveNotebook(notebook("nb1", OWNER_A.id));
    const retrieved = await repo.getNotebook("nb1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe("nb1");
  });

  it("lists only the owner's notebooks", async () => {
    await repo.saveNotebook(notebook("nbA", OWNER_A.id));
    await foreignStorage().putNotebook(notebook("nbB", OWNER_B.id));
    const list = await repo.listNotebooks();
    expect(list.map((nb) => nb.id)).toEqual(["nbA"]);
  });

  it("rejects saving a notebook with a foreign owner", async () => {
    await expect(repo.saveNotebook(notebook("nbX", OWNER_B.id))).rejects.toThrow(
      "OWNER_MISMATCH",
    );
  });

  it("returns null for a non-existent notebook", async () => {
    expect(await repo.getNotebook("nonexistent")).toBeNull();
  });

  // --- Page CRUD ---

  it("creates and retrieves a page", async () => {
    await repo.savePage(page("p1", OWNER_A.id, "nb1"));
    const retrieved = await repo.getPage("p1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.template).toBe("lined");
  });

  it("lists only the owner's pages", async () => {
    await repo.savePage(page("pA", OWNER_A.id, "nb1"));
    await foreignStorage().putPage(page("pB", OWNER_B.id, "nb1"));
    const list = await repo.listPages();
    expect(list.map((p) => p.id)).toEqual(["pA"]);
  });

  it("rejects saving a page with a foreign owner", async () => {
    await expect(repo.savePage(page("pX", OWNER_B.id, "nb1"))).rejects.toThrow(
      "OWNER_MISMATCH",
    );
  });

  it("rejects saving a page whose notebook belongs to another owner", async () => {
    await foreignStorage().putNotebook(notebook("nbForeign", OWNER_B.id));
    await expect(
      repo.savePage(page("pX", OWNER_A.id, "nbForeign")),
    ).rejects.toThrow("OWNER_MISMATCH");
  });

  it("deletes a page", async () => {
    await repo.savePage(page("p1", OWNER_A.id, "nb1"));
    await repo.deletePage("p1");
    expect(await repo.getPage("p1")).toBeNull();
  });

  // --- Ownership isolation ---

  it("owner A cannot read owner B's page", async () => {
    await foreignStorage().putPage(page("pB", OWNER_B.id, "nb1"));
    await expect(repo.getPage("pB")).rejects.toThrow("OWNER_MISMATCH");
  });

  it("owner A cannot delete owner B's page", async () => {
    await foreignStorage().putPage(page("pB", OWNER_B.id, "nb1"));
    await expect(repo.deletePage("pB")).rejects.toThrow("OWNER_MISMATCH");
    expect(await foreignStorage().getPage("pB")).not.toBeNull();
  });

  // --- Backups and meta ---

  it("saves and retrieves a backup", async () => {
    const backup = {
      ...page("p1", OWNER_A.id, "nb1"),
      backupRevision: 1,
      backupChecksum: "abc",
      backupCreatedAt: NOW,
    };
    await repo.saveBackup(backup);
    const retrieved = await repo.getBackup("p1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.backupRevision).toBe(1);
  });

  it("stores and retrieves meta", async () => {
    await repo.putMeta("testKey", { foo: "bar" });
    expect(await repo.getMeta("testKey")).toEqual({ foo: "bar" });
  });

  // --- Atomic cascade delete ---

  it("deletes a notebook together with its pages", async () => {
    await repo.saveNotebook(notebook("nb1", OWNER_A.id));
    await repo.savePage(page("p1", OWNER_A.id, "nb1"));
    await repo.savePage(page("p2", OWNER_A.id, "nb1"));
    await repo.deleteNotebook("nb1");
    expect(await repo.getNotebook("nb1")).toBeNull();
    expect(await repo.getPage("p1")).toBeNull();
    expect(await repo.getPage("p2")).toBeNull();
  });

  it("refuses to delete a notebook that belongs to another owner", async () => {
    await foreignStorage().putNotebook(notebook("nbB", OWNER_B.id));
    await expect(repo.deleteNotebook("nbB")).rejects.toThrow("OWNER_MISMATCH");
    expect(await foreignStorage().getNotebook("nbB")).not.toBeNull();
  });

  it("does not delete orphan pages when the notebook does not exist", async () => {
    await storage.putPage(page("orphan", OWNER_A.id, "missing-nb"));
    await repo.deleteNotebook("missing-nb");
    expect(await storage.getPage("orphan")).not.toBeNull();
  });

  // --- Write lease ---

  it("rejects every mutation when the lease is not held", async () => {
    const lease = createTestWriterLease({ granted: false });
    const readOnlyRepo = createTestNoteRepository({
      owner: OWNER_A,
      storage,
      lease,
    });
    expect(readOnlyRepo.status).toBe("read-only");
    expect(readOnlyRepo.canWrite).toBe(false);

    await expect(readOnlyRepo.saveNotebook(notebook("nb1", OWNER_A.id))).rejects.toThrow(
      "NOTES_READ_ONLY",
    );
    await expect(readOnlyRepo.savePage(page("p1", OWNER_A.id, "nb1"))).rejects.toThrow(
      "NOTES_READ_ONLY",
    );
    await expect(readOnlyRepo.deleteNotebook("nb1")).rejects.toThrow(
      "NOTES_READ_ONLY",
    );
    await expect(readOnlyRepo.putMeta("k", 1)).rejects.toThrow("NOTES_READ_ONLY");
  });

  it("still allows reads when the lease is not held", async () => {
    await repo.saveNotebook(notebook("nb1", OWNER_A.id));
    const readOnlyRepo = createTestNoteRepository({
      owner: OWNER_A,
      storage,
      lease: createTestWriterLease({ granted: false }),
    });
    expect(await readOnlyRepo.getNotebook("nb1")).not.toBeNull();
  });

  it("reports lock-unavailable when Web Locks are unsupported", async () => {
    const lease = createTestWriterLease({ granted: false, supported: false });
    const repoWithoutLocks = createTestNoteRepository({
      owner: OWNER_A,
      storage,
      lease,
    });
    expect(repoWithoutLocks.status).toBe("read-only");
    await expect(
      repoWithoutLocks.saveNotebook(notebook("nb1", OWNER_A.id)),
    ).rejects.toThrow("NOTES_LOCK_UNAVAILABLE");
  });

  it("becomes writable once the lease is granted", async () => {
    const lease = createTestWriterLease({ granted: false });
    const promotedRepo = createTestNoteRepository({
      owner: OWNER_A,
      storage,
      lease,
    });
    expect(promotedRepo.status).toBe("read-only");
    lease.setGranted(true);
    expect(promotedRepo.status).toBe("ready");
    await promotedRepo.saveNotebook(notebook("nb1", OWNER_A.id));
    expect(await promotedRepo.getNotebook("nb1")).not.toBeNull();
  });

  // --- Encapsulation (P1-01) ---

  it("does not expose the raw storage or the writer lease at runtime", () => {
    const exposed = repo as unknown as Record<string, unknown>;
    expect(exposed.storage).toBeUndefined();
    expect(exposed.lease).toBeUndefined();
    expect(Object.getOwnPropertyNames(repo)).not.toContain("storage");
    expect(Object.getOwnPropertyNames(repo)).not.toContain("lease");
  });

  it("does not expose the raw storage or the writer lease to TypeScript", () => {
    // @ts-expect-error — the raw storage is not part of the public surface
    void repo.storage;
    // @ts-expect-error — the writer lease is not part of the public surface
    void repo.lease;
    expect(true).toBe(true);
  });

  // --- Meta owner isolation (P1-03) ---

  it("namespaces meta keys by owner", async () => {
    const other = foreignStorage();
    await repo.putMeta("settings", { theme: "dark" });
    expect(await repo.getMeta("settings")).toEqual({ theme: "dark" });

    // Another owner must not see it ...
    const otherRepo = createTestNoteRepository({
      owner: OWNER_B,
      storage: other,
    });
    expect(await otherRepo.getMeta("settings")).toBeNull();

    // ... and must not be able to overwrite it.
    await other.putMeta("settings", { theme: "light" });
    expect(await repo.getMeta("settings")).toEqual({ theme: "dark" });

    // A delete from the other namespace must not touch this one.
    await other.deleteMeta("settings");
    expect(await repo.getMeta("settings")).toEqual({ theme: "dark" });
  });

  // --- Writer promotion promise (P2-01) ---

  it("resolves the promotion promise only when the lease is granted", async () => {
    const lease = createTestWriterLease({ granted: false });
    const waiting = createTestNoteRepository({
      owner: OWNER_A,
      storage,
      lease,
    });
    const promotion = waiting.whenWriter();

    let state = "pending";
    void promotion.then(
      () => {
        state = "resolved";
      },
      () => {
        state = "rejected";
      },
    );
    await Promise.resolve();
    expect(state).toBe("pending");

    lease.setGranted(true);
    await expect(promotion).resolves.toBeUndefined();
    expect(state).toBe("resolved");
  });

  it("rejects the promotion promise when a waiting repository is disposed", async () => {
    const lease = createTestWriterLease({ granted: false });
    const waiting = createTestNoteRepository({
      owner: OWNER_A,
      storage,
      lease,
    });
    const promotion = waiting.whenWriter();

    await waiting.dispose();

    await expect(promotion).rejects.toThrow("NOTES_WRITER_LEASE_CANCELLED");
    expect(lease.isWriter()).toBe(false);
  });

  it("keeps an already granted promotion resolved when the lease is released", async () => {
    const lease = createTestWriterLease({ granted: true });
    const writer = createTestNoteRepository({ owner: OWNER_A, storage, lease });
    const promotion = writer.whenWriter();
    await expect(promotion).resolves.toBeUndefined();

    await writer.dispose();
    await expect(promotion).resolves.toBeUndefined();
  });

  // --- Disposal ---

  it("rejects new operations immediately after disposal starts", async () => {
    const disposal = repo.dispose();
    await expect(repo.getNotebook("nb1")).rejects.toThrow("NOTES_DISPOSED");
    await expect(repo.saveNotebook(notebook("nb1", OWNER_A.id))).rejects.toThrow(
      "NOTES_DISPOSED",
    );
    await disposal;
    expect(repo.status).toBe("disposed");
  });

  it("is idempotent and resolves only after the disposal completed", async () => {
    const first = repo.dispose();
    const second = repo.dispose();
    expect(second).toBe(first);
    await first;
    expect(repo.status).toBe("disposed");
  });

  it("keeps the lease while an in-flight write is still running", async () => {
    const lease = createTestWriterLease();
    const tracked = createTestNoteRepository({ owner: OWNER_A, storage, lease });

    const order: string[] = [];
    setStorageTestHooks({
      beforeWrite: async () => {
        order.push("write-start");
        await new Promise((resolve) => setTimeout(resolve, 60));
        order.push("write-end");
      },
    });

    const write = tracked.savePage(page("p1", OWNER_A.id, "nb1"));
    const disposal = tracked.dispose();

    await write;
    // The write finished, but the disposal has not released the lease yet.
    expect(lease.isWriter()).toBe(true);
    expect(order).toEqual(["write-start", "write-end"]);

    await disposal;
    expect(lease.isWriter()).toBe(false);
  });

  it("retains the lease and reports the failure when a write cannot be drained", async () => {
    const lease = createTestWriterLease();
    const stuck = createTestNoteRepository({
      owner: OWNER_A,
      storage,
      lease,
      drainTimeoutMs: 40,
    });

    setStorageTestHooks({
      beforeWrite: () => new Promise<void>(() => {}),
    });

    void stuck.savePage(page("p1", OWNER_A.id, "nb1")).catch(() => undefined);

    await expect(stuck.dispose()).rejects.toThrow("NOTES_DISPOSAL_FAILED");
    // The lease must NOT have been released.
    expect(lease.isWriter()).toBe(true);
  });
});
