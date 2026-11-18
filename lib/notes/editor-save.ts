// lib/notes/editor-save.ts
//
// The editor's save path, consolidated.
//
// Why this exists: the notebook editor used to drive persistence with a bare
// debounce + repo.savePage call. That path is CAS-safe (the revision guard in
// storage handles ordering), but it had no notion of "dirty", no retry, and
// no protection against two saves racing through runWrite at once. This
// coordinator adds exactly that, on top of the repository — never around it.
//
// What it deliberately does NOT do:
//  - It never writes to IndexedDB directly. Every write goes through
//    repo.savePage, so the writer lease, owner checks, record validation and
//    the revision CAS stay authoritative.
//  - It never discards content. On failure the latest content stays in the
//    editor's refs; retry() rebuilds the record from it.

import type { NoteRepository } from "./repository";
import type { StoragePage } from "./types";

export type EditorSaveStatus = "idle" | "saving" | "saved" | "error";

export type EditorSaveState = {
  status: EditorSaveStatus;
  /** True while there is content not yet persisted. */
  dirty: boolean;
};

export type SaveCoordinatorOptions = {
  repo: NoteRepository;
  /**
   * Build the record to persist from the editor's current state. Returning
   * null means "nothing to save" (no active page, read-only, etc.). Called
   * at write time, so it always sees the newest content.
   */
  buildRecord: () => Promise<StoragePage | null>;
  onState: (state: EditorSaveState) => void;
};

/**
 * Coalesced, retryable save pipeline for one open notebook editor.
 *
 * - schedule(delay) debounces rapid edits (autosave).
 * - saveNow() persists immediately; when a write is already running, it
 *   queues exactly one follow-up that rebuilds the record from the latest
 *   content, then awaits full drainage.
 * - retry() re-attempts after a failure.
 * - flush() resolves once nothing is pending — used by page switching and
 *   the pagehide/visibilitychange flush.
 */
export class SaveCoordinator {
  private readonly repo: NoteRepository;
  private readonly buildRecord: () => Promise<StoragePage | null>;
  private readonly onState: (state: EditorSaveState) => void;

  private status: EditorSaveStatus = "idle";
  private dirty = false;
  private running = false;
  /** A save was requested while a write was in flight. */
  private queued = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SaveCoordinatorOptions) {
    this.repo = options.repo;
    this.buildRecord = options.buildRecord;
    this.onState = options.onState;
  }

  /** The last emitted state. */
  getState(): EditorSaveState {
    return { status: this.status, dirty: this.dirty };
  }

  /** Debounced autosave. Rapid calls collapse into one delayed write. */
  schedule(delayMs = 600): void {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
    this.emit();
  }

  /** Persist immediately, coalescing with any in-flight write. */
  async saveNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // When a write is already running, run() queues a follow-up and returns
    // immediately; flush() then waits until the whole queue has drained, so
    // callers can safely switch pages right after this resolves.
    await this.run();
    await this.flush();
  }

  /** Re-attempt after a failure. No-op when the last write succeeded. */
  retry(): Promise<void> {
    if (this.status !== "error") return Promise.resolve();
    return this.run();
  }

  /**
   * Resolve when nothing is running or queued.
   *
   * Page switching awaits this before swapping the editor's content refs, so
   * the record built inside a draining write still describes the OLD page.
   */
  flush(): Promise<void> {
    if (!this.running && !this.queued) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.running && !this.queued) resolve();
        else queueMicrotask(check);
      };
      queueMicrotask(check);
    });
  }

  /** Cancel a pending debounce. In-flight writes are untouched. */
  cancelScheduled(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    this.onState({ status: this.status, dirty: this.dirty });
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.queued = true;
      return;
    }
    if (!this.repo.canWrite) {
      // Read-only tab: keep the dirty flag honest, report the failure.
      this.dirty = true;
      this.status = "error";
      this.emit();
      return;
    }

    this.running = true;
    this.status = "saving";
    this.emit();

    try {
      // The loop rebuilds the record each pass, so a queued follow-up always
      // persists the LATEST content, not a stale copy captured earlier.
      for (;;) {
        const record = await this.buildRecord();
        if (!record) break;
        await this.repo.savePage(record);
        if (!this.queued) break;
        this.queued = false;
      }
      this.status = "saved";
      this.dirty = false;
    } catch {
      // Keep dirty: the editor still holds the content; retry() can rebuild.
      this.status = "error";
      this.dirty = true;
    } finally {
      const followUp = this.queued;
      this.queued = false;
      this.running = false;
      this.emit();
      if (followUp) void this.run();
    }
  }
}
