import { describe, it, expect, vi } from "vitest";
import { SaveCoordinator, type EditorSaveState } from "../editor-save";
import { createTestNoteRepository, createTestOwner } from "../testing";
import { InMemoryNoteStorage, createInMemoryStore } from "../storage";
import type { NoteRepository } from "../repository";
import type { StoragePage } from "../types";

const OWNER = createTestOwner("anon", "save-coord");

function makeRecord(revision: number): StoragePage {
  return {
    id: "p1",
    ownerId: OWNER.id,
    notebookId: "nb1",
    template: "lined",
    persistedSnapshot: { template: "lined", strokes: [], texts: [], images: [] },
    localJournal: [],
    quarantined: false,
    revision,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * A repo double that counts writes and can be made to fail.
 * `holdNext()` makes the NEXT write hang until `release()` is called —
 * built into the double (no spying), so the timing is deterministic.
 */
function makeRepoDouble(failNext = false): {
  repo: Pick<NoteRepository, "canWrite" | "savePage">;
  writes: () => number;
  fail: () => void;
  holdNext: () => void;
  release: () => void;
} {
  let writes = 0;
  let failing = failNext;
  let gate: Promise<void> | null = null;
  let releaseGate: (() => void) | null = null;
  return {
    repo: {
      get canWrite() {
        return true;
      },
      async savePage() {
        if (gate) {
          const held = gate;
          gate = null;
          await held;
        }
        writes += 1;
        if (failing) {
          failing = false;
          throw new Error("boom");
        }
      },
    } as unknown as NoteRepository,
    writes: () => writes,
    fail: () => {
      failing = true;
    },
    holdNext: () => {
      gate = new Promise((resolve) => {
        releaseGate = resolve;
      });
    },
    release: () => {
      releaseGate?.();
      releaseGate = null;
    },
  };
}

describe("SaveCoordinator", () => {
  it("persists through the repository and reports saved", async () => {
    const { repo, writes } = makeRepoDouble();
    const states: EditorSaveState[] = [];
    const coordinator = new SaveCoordinator({
      repo: repo as NoteRepository,
      buildRecord: async () => makeRecord(1),
      onState: (state) => states.push(state),
    });

    await coordinator.saveNow();

    expect(writes()).toBe(1);
    expect(coordinator.getState()).toEqual({ status: "saved", dirty: false });
    expect(states.at(-1)).toEqual({ status: "saved", dirty: false });
  });

  it("keeps dirty and reports error when the write fails, and retry recovers", async () => {
    const { repo, writes, fail } = makeRepoDouble();
    const coordinator = new SaveCoordinator({
      repo: repo as NoteRepository,
      buildRecord: async () => makeRecord(1),
      onState: () => undefined,
    });

    fail();
    await coordinator.saveNow();
    expect(coordinator.getState()).toEqual({ status: "error", dirty: true });

    await coordinator.retry();
    expect(coordinator.getState()).toEqual({ status: "saved", dirty: false });
    expect(writes()).toBe(2);
  });

  it("retry is a no-op when the last save succeeded", async () => {
    const { repo, writes } = makeRepoDouble();
    const coordinator = new SaveCoordinator({
      repo: repo as NoteRepository,
      buildRecord: async () => makeRecord(1),
      onState: () => undefined,
    });

    await coordinator.saveNow();
    await coordinator.retry();
    expect(writes()).toBe(1);
  });

  it("coalesces a save requested during an in-flight write", async () => {
    const { repo, writes, holdNext, release } = makeRepoDouble();
    let latestRevision = 1;
    const coordinator = new SaveCoordinator({
      repo: repo as NoteRepository,
      buildRecord: async () => makeRecord(latestRevision),
      onState: () => undefined,
    });

    // Hold the first write, bump the content mid-flight, then release.
    holdNext();
    const first = coordinator.saveNow();
    expect(coordinator.getState().status).toBe("saving");

    // New content arrives while the first write is still in flight.
    latestRevision = 2;
    const second = coordinator.saveNow();
    release();
    await Promise.all([first, second]);

    // The queued follow-up rebuilt the record: two writes, latest persisted.
    expect(writes()).toBe(2);
    expect(coordinator.getState()).toEqual({ status: "saved", dirty: false });
  });

  it("flush() waits for an in-flight write", async () => {
    const { repo, holdNext, release } = makeRepoDouble();
    const coordinator = new SaveCoordinator({
      repo: repo as NoteRepository,
      buildRecord: async () => makeRecord(1),
      onState: () => undefined,
    });

    holdNext();
    let flushed = false;
    const flushPromise = coordinator.saveNow().then(() => {
      flushed = true;
    });

    await Promise.resolve();
    expect(flushed).toBe(false);
    release();
    await flushPromise;
    expect(flushed).toBe(true);
  });

  it("reports error without writing in a read-only tab", async () => {
    const repo = {
      get canWrite() {
        return false;
      },
      savePage: vi.fn(),
    } as unknown as NoteRepository;
    const coordinator = new SaveCoordinator({
      repo,
      buildRecord: async () => makeRecord(1),
      onState: () => undefined,
    });

    await coordinator.saveNow();
    expect(coordinator.getState()).toEqual({ status: "error", dirty: true });
    expect(repo.savePage).not.toHaveBeenCalled();
  });

  it("uses a real in-memory repository end-to-end", async () => {
    const store = createInMemoryStore();
    const storage = new InMemoryNoteStorage(OWNER.id, store);
    await storage.open();
    const repo = createTestNoteRepository({ owner: OWNER, storage });
    const coordinator = new SaveCoordinator({
      repo,
      buildRecord: async () => makeRecord(1),
      onState: () => undefined,
    });

    await coordinator.saveNow();
    expect((await repo.getPage("p1"))?.revision).toBe(1);

    // A newer revision applies through the same coordinator.
    const coordinator2 = new SaveCoordinator({
      repo,
      buildRecord: async () => makeRecord(2),
      onState: () => undefined,
    });
    await coordinator2.saveNow();
    expect((await repo.getPage("p1"))?.revision).toBe(2);

    await repo.dispose();
  });
});
