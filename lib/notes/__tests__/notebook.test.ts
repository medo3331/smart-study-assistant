import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestNoteRepository,
  createTestOwner,
  createTestWriterLease,
} from "../testing";
import { InMemoryNoteStorage, createInMemoryStore } from "../storage";
import type { InMemoryStore } from "../storage";
import type { NoteRepository } from "../repository";
import type { StorageNotebook, StoragePage, Stroke } from "../types";
import {
  buildEmptyPage,
  buildNotebookSave,
  buildPageSave,
  contentFromSnapshot,
  ensureNotebook,
  sortNotebooksByRecency,
  sortPagesByCreation,
  strokesFromSnapshot,
} from "../notebook";
import { pageContentStrokes } from "../content";

const OWNER = createTestOwner("anon", "n1");
const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

let counter = 0;
const nextId = () => `id-${(counter += 1)}`;

function notebook(id: string, updatedAt = NOW): StorageNotebook {
  return {
    id,
    ownerId: OWNER.id,
    title: id,
    pageIds: [],
    currentPageId: null,
    revision: 1,
    createdAt: NOW,
    updatedAt,
  };
}

function page(id: string, notebookId: string, createdAt = NOW): StoragePage {
  return {
    id,
    ownerId: OWNER.id,
    notebookId,
    template: "lined",
    persistedSnapshot: { strokes: [] },
    localJournal: [],
    quarantined: false,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("ensureNotebook", () => {
  let store: InMemoryStore;
  let repo: NoteRepository;

  beforeEach(async () => {
    counter = 0;
    store = createInMemoryStore();
    const storage = new InMemoryNoteStorage(OWNER.id, store);
    await storage.open();
    repo = createTestNoteRepository({ owner: OWNER, storage });
  });

  const options = () => ({
    newId: nextId,
    now: () => NOW,
    defaultTitle: "دفتر",
  });

  it("creates a notebook AND its first page in storage when none exist", async () => {
    // Regression: the old editor only created the page in React state, so the
    // notebook referenced a pageId that was never written and every later save
    // silently skipped the page.
    const boot = await ensureNotebook(repo, options());

    expect(boot.status).toBe("ready");
    if (boot.status !== "ready") return;

    // The page must be readable from storage, not just present in the result.
    const storedPage = await repo.getPage(boot.pages[0].id);
    expect(storedPage).not.toBeNull();
    expect(storedPage!.notebookId).toBe(boot.notebook.id);

    // ...and the notebook must actually reference it.
    const storedNotebook = await repo.getNotebook(boot.notebook.id);
    expect(storedNotebook!.pageIds).toEqual([boot.pages[0].id]);
    expect(storedNotebook!.currentPageId).toBe(boot.pages[0].id);
    expect(boot.activePageId).toBe(boot.pages[0].id);
  });

  it("opens the most recently updated notebook", async () => {
    await repo.saveNotebook(notebook("old", NOW));
    await repo.savePage(page("p-old", "old"));
    await repo.saveNotebook(notebook("new", LATER));
    await repo.savePage(page("p-new", "new"));

    const boot = await ensureNotebook(repo, options());
    expect(boot.status).toBe("ready");
    if (boot.status !== "ready") return;
    expect(boot.notebook.id).toBe("new");
  });

  it("opens the explicitly requested notebook", async () => {
    await repo.saveNotebook(notebook("old", NOW));
    await repo.savePage(page("p-old", "old"));
    await repo.saveNotebook(notebook("new", LATER));
    await repo.savePage(page("p-new", "new"));

    const boot = await ensureNotebook(repo, {
      ...options(),
      requestedNotebookId: "old",
    });
    expect(boot.status).toBe("ready");
    if (boot.status !== "ready") return;
    expect(boot.notebook.id).toBe("old");
  });

  it("reports a missing notebook and creates nothing", async () => {
    const boot = await ensureNotebook(repo, {
      ...options(),
      requestedNotebookId: "nope",
    });

    expect(boot).toEqual({ status: "missing" });
    expect(await repo.listNotebooks()).toHaveLength(0);
    expect(await repo.listPages()).toHaveLength(0);
  });

  it("backfills a first page for a notebook that has none", async () => {
    await repo.saveNotebook(notebook("nb"));

    const boot = await ensureNotebook(repo, options());
    expect(boot.status).toBe("ready");
    if (boot.status !== "ready") return;

    expect(boot.pages).toHaveLength(1);
    const stored = await repo.getNotebook("nb");
    expect(stored!.pageIds).toEqual([boot.pages[0].id]);
    expect(await repo.getPage(boot.pages[0].id)).not.toBeNull();
  });

  it("prefers the notebook's currentPageId over the first page", async () => {
    await repo.savePage(page("p1", "nb", NOW));
    await repo.savePage(page("p2", "nb", LATER));
    await repo.saveNotebook({
      ...notebook("nb"),
      pageIds: ["p1", "p2"],
      currentPageId: "p2",
    });

    const boot = await ensureNotebook(repo, options());
    expect(boot.status).toBe("ready");
    if (boot.status !== "ready") return;
    expect(boot.activePageId).toBe("p2");
  });

  it("falls back to the oldest page when currentPageId is stale", async () => {
    await repo.savePage(page("p1", "nb", NOW));
    await repo.savePage(page("p2", "nb", LATER));
    await repo.saveNotebook({
      ...notebook("nb"),
      pageIds: ["p1", "p2"],
      currentPageId: "deleted-page",
    });

    const boot = await ensureNotebook(repo, options());
    expect(boot.status).toBe("ready");
    if (boot.status !== "ready") return;
    expect(boot.activePageId).toBe("p1");
  });

  it("refuses to create anything when this tab is read-only", async () => {
    const readOnlyRepo = createTestNoteRepository({
      owner: OWNER,
      storage: new InMemoryNoteStorage(OWNER.id, store),
      lease: createTestWriterLease({ granted: false }),
    });

    const boot = await ensureNotebook(readOnlyRepo, options());
    expect(boot).toEqual({ status: "read-only-empty", reason: "no-notebooks" });
    expect(await readOnlyRepo.listNotebooks()).toHaveLength(0);
  });

  it("reports no-pages when a read-only tab opens an empty notebook", async () => {
    await repo.saveNotebook(notebook("nb"));

    const readOnlyRepo = createTestNoteRepository({
      owner: OWNER,
      storage: new InMemoryNoteStorage(OWNER.id, store),
      lease: createTestWriterLease({ granted: false }),
    });

    const boot = await ensureNotebook(readOnlyRepo, options());
    expect(boot).toEqual({ status: "read-only-empty", reason: "no-pages" });
    expect(await readOnlyRepo.listPages("nb")).toHaveLength(0);
  });
});

describe("buildPageSave", () => {
  it("increments revision and preserves createdAt and the journal", () => {
    const existing = {
      ...page("p1", "nb", NOW),
      revision: 7,
      localJournal: [{ op: "keep-me" }],
    };

    const next = buildPageSave({
      ownerId: OWNER.id,
      notebookId: "nb",
      pageId: "p1",
      template: "grid",
      strokes: [{ id: "s", tool: "pen", color: "#000", thickness: 2, opacity: 1, points: [[0, 0]] }],
      persistedSnapshot: { template: "grid", strokes: [] },
      existing,
      now: LATER,
    });

    expect(next.revision).toBe(8);
    expect(next.createdAt).toBe(NOW);
    expect(next.updatedAt).toBe(LATER);
    expect(next.localJournal).toEqual([{ op: "keep-me" }]);
    expect(next.template).toBe("grid");
  });

  it("starts a new record at revision 1", () => {
    const next = buildPageSave({
      ownerId: OWNER.id,
      notebookId: "nb",
      pageId: "p9",
      template: "lined",
      strokes: [],
      persistedSnapshot: { strokes: [] },
      existing: null,
      now: NOW,
    });
    expect(next.revision).toBe(1);
    expect(next.createdAt).toBe(NOW);
  });
});

describe("buildNotebookSave", () => {
  it("increments revision and keeps createdAt", () => {
    const next = buildNotebookSave({
      ownerId: OWNER.id,
      notebookId: "nb",
      title: "renamed",
      pageIds: ["p1", "p2"],
      activePageId: "p2",
      existing: { ...notebook("nb"), revision: 3 },
      now: LATER,
    });

    expect(next.revision).toBe(4);
    expect(next.createdAt).toBe(NOW);
    expect(next.updatedAt).toBe(LATER);
    expect(next.title).toBe("renamed");
    expect(next.currentPageId).toBe("p2");
  });
});

describe("strokesFromSnapshot", () => {
  it("returns strokes from a valid snapshot", () => {
    const strokes = [
      { id: "s1", tool: "pen" as const, color: "#111", thickness: 2, opacity: 1, points: [[1, 2]] },
    ];
    expect(strokesFromSnapshot({ template: "lined", strokes })).toEqual(strokes);
  });

  it("drops anything that is not a stroke", () => {
    const strokes = strokesFromSnapshot({
      strokes: [
        null,
        "nope",
        { id: "no-points" },
        { id: "empty-points", points: [] },
        { id: "ok", points: [[0, 0]] },
      ],
    });
    expect(strokes).toHaveLength(1);
    expect(strokes[0].id).toBe("ok");
  });

  it("tolerates junk snapshots", () => {
    expect(strokesFromSnapshot(null)).toEqual([]);
    expect(strokesFromSnapshot("string")).toEqual([]);
    expect(strokesFromSnapshot({})).toEqual([]);
    expect(strokesFromSnapshot({ strokes: "not-an-array" })).toEqual([]);
  });
});

describe("ordering helpers", () => {
  it("sorts notebooks newest first", () => {
    const sorted = sortNotebooksByRecency([notebook("a", NOW), notebook("b", LATER)]);
    expect(sorted.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("sorts pages oldest first", () => {
    const sorted = sortPagesByCreation([
      page("p2", "nb", LATER),
      page("p1", "nb", NOW),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("buildEmptyPage", () => {
  it("produces a validating, revision-1 record", () => {
    const record = buildEmptyPage({
      ownerId: OWNER.id,
      notebookId: "nb",
      pageId: "p1",
      template: "dotted",
      now: NOW,
      persistedSnapshot: { template: "dotted", strokes: [] },
    });

    expect(record.revision).toBe(1);
    expect(record.template).toBe("dotted");
    expect(record.ownerId).toBe(OWNER.id);
    expect(record.quarantined).toBe(false);
    expect(record.localJournal).toEqual([]);
  });
});

describe("contentFromSnapshot", () => {
  it("round-trips strokes, texts and images", () => {
    const strokes: Stroke[] = [
      { id: "s1", tool: "pen" as const, color: "#111", thickness: 2, opacity: 1, points: [[1, 2]] },
      {
        id: "s2",
        tool: "pen" as const,
        color: "#111",
        thickness: 2,
        opacity: 1,
        points: [[0, 0], [10, 10]],
        shape: "arrow" as const,
      },
    ];
    const texts = [
      { id: "t1", kind: "text" as const, text: "مرحبا", x: 10, y: 20, size: 28, color: "#111" },
    ];
    const images = [
      { id: "i1", kind: "image" as const, src: "data:image/png;base64,x", x: 5, y: 5, width: 100, height: 80 },
    ];
    const snapshot = pageContentStrokes("lined", strokes, texts, images);
    const content = contentFromSnapshot(snapshot);
    expect(content.strokes).toEqual(strokes);
    expect(content.texts).toEqual(texts);
    expect(content.images).toEqual(images);
  });

  it("drops malformed texts and images but keeps valid strokes", () => {
    const content = contentFromSnapshot({
      strokes: [{ id: "s1", tool: "pen", color: "#111", thickness: 2, opacity: 1, points: [[0, 0]] }],
      texts: [null, "nope", { id: "x" }, { id: "t1", kind: "text", text: "ok", x: 1, y: 2, size: 20 }],
      images: [{ id: "i1", kind: "image", src: "data:x", x: 1, y: 2, width: 10, height: 10 }, "junk"],
    });
    expect(content.strokes).toHaveLength(1);
    expect(content.texts).toHaveLength(1);
    expect(content.images).toHaveLength(1);
  });

  it("tolerates legacy snapshots without texts or images", () => {
    const content = contentFromSnapshot({
      template: "lined",
      strokes: [{ id: "s1", tool: "pen", color: "#111", thickness: 2, opacity: 1, points: [[0, 0]] }],
    });
    expect(content.strokes).toHaveLength(1);
    expect(content.texts).toEqual([]);
    expect(content.images).toEqual([]);
  });

  it("tolerates junk snapshots", () => {
    expect(contentFromSnapshot(null)).toEqual({ strokes: [], texts: [], images: [] });
    expect(contentFromSnapshot(42)).toEqual({ strokes: [], texts: [], images: [] });
  });
});
