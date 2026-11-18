import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryNoteStorage,
  createInMemoryStore,
  rawInMemoryRecords,
} from "../storage";
import type { InMemoryStore } from "../storage";
import { setStorageTestHooks } from "../test-hooks";

const OWNER_A = "anon:owner-a";
const OWNER_B = "anon:owner-b";
const NOW = "2026-01-01T00:00:00.000Z";

describe("NoteStorage contract (owner-bound)", () => {
  let storage: InMemoryNoteStorage;
  let store: InMemoryStore;

  beforeEach(async () => {
    setStorageTestHooks(null);
    store = createInMemoryStore();
    storage = new InMemoryNoteStorage(OWNER_A, store);
    await storage.open();
  });

  it("exposes the owner it is bound to", () => {
    expect(storage.ownerId).toBe(OWNER_A);
  });

  it("refuses to read a record that belongs to another owner", async () => {
    const other = new InMemoryNoteStorage(OWNER_B, store);
    await other.putPage({
      id: "pB",
      ownerId: OWNER_B,
      notebookId: "nb1",
      template: "lined",
      persistedSnapshot: {},
      localJournal: [],
      quarantined: false,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await expect(storage.getPage("pB")).rejects.toThrow("OWNER_MISMATCH");
  });

  it("refuses to write a record that belongs to another owner", async () => {
    await expect(
      storage.putNotebook({
        id: "nbB",
        ownerId: OWNER_B,
        title: "x",
        pageIds: [],

        currentPageId: null,

        revision: 0,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).rejects.toThrow("OWNER_MISMATCH");
  });

  it("lists only its own records", async () => {
    await storage.putNotebook({
      id: "nbA",
      ownerId: OWNER_A,
      title: "x",
      pageIds: [],

      currentPageId: null,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const other = new InMemoryNoteStorage(OWNER_B, store);
    await other.putNotebook({
      id: "nbB",
      ownerId: OWNER_B,
      title: "y",
      pageIds: [],

      currentPageId: null,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const list = await storage.listNotebooks();
    expect(list.map((nb) => nb.id)).toEqual(["nbA"]);
  });

  it("deletes a notebook and its pages atomically", async () => {
    await storage.putNotebook({
      id: "nb1",
      ownerId: OWNER_A,
      title: "x",
      pageIds: [],

      currentPageId: null,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    for (const id of ["p1", "p2"]) {
      await storage.putPage({
        id,
        ownerId: OWNER_A,
        notebookId: "nb1",
        template: "lined",
        persistedSnapshot: {},
        localJournal: [],
        quarantined: false,

        revision: 0,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }

    await storage.deleteNotebookCascade("nb1");

    expect(await storage.getNotebook("nb1")).toBeNull();
    expect(await storage.getPage("p1")).toBeNull();
    expect(await storage.getPage("p2")).toBeNull();
  });

  it("deletes nothing when a related page belongs to another owner", async () => {
    await storage.putNotebook({
      id: "nb1",
      ownerId: OWNER_A,
      title: "x",
      pageIds: [],

      currentPageId: null,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await storage.putPage({
      id: "pOwn",
      ownerId: OWNER_A,
      notebookId: "nb1",
      template: "lined",
      persistedSnapshot: {},
      localJournal: [],
      quarantined: false,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const other = new InMemoryNoteStorage(OWNER_B, store);
    await other.putPage({
      id: "pForeign",
      ownerId: OWNER_B,
      notebookId: "nb1",
      template: "lined",
      persistedSnapshot: {},
      localJournal: [],
      quarantined: false,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(storage.deleteNotebookCascade("nb1")).rejects.toThrow(
      "OWNER_MISMATCH",
    );

    // Nothing may have been deleted.
    const raw = rawInMemoryRecords(storage);
    expect(raw.notebooks.map((nb) => nb.id)).toContain("nb1");
    expect(raw.pages.map((p) => p.id)).toContain("pOwn");
    expect(raw.pages.map((p) => p.id)).toContain("pForeign");
  });

  it("does not delete orphan records when the notebook is missing", async () => {
    await storage.putPage({
      id: "orphan",
      ownerId: OWNER_A,
      notebookId: "missing",
      template: "lined",
      persistedSnapshot: {},
      localJournal: [],
      quarantined: false,

      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await storage.deleteNotebookCascade("missing");
    expect(await storage.getPage("orphan")).not.toBeNull();
  });

  it("namespaces meta keys by owner (P1-03)", async () => {
    const other = new InMemoryNoteStorage(OWNER_B, store);

    await storage.putMeta("settings", { theme: "dark" });
    expect(await storage.getMeta("settings")).toEqual({ theme: "dark" });

    // Another owner namespace must not see it.
    expect(await other.getMeta("settings")).toBeNull();

    // ... and must not be able to overwrite or delete it.
    await other.putMeta("settings", { theme: "light" });
    expect(await storage.getMeta("settings")).toEqual({ theme: "dark" });
    await other.deleteMeta("settings");
    expect(await storage.getMeta("settings")).toEqual({ theme: "dark" });
  });
});
