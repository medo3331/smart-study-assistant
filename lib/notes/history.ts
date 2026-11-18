// lib/notes/history.ts
//
// Bounded undo/redo for one page's stroke list.
//
// The stack stores immutable snapshots. Strokes are plain objects and the
// editor only ever replaces arrays, so a snapshot is a shallow reference and
// costs nothing to keep. The bound matters: a long note can accumulate tens of
// thousands of strokes, and an unbounded history would pin every one of them in
// memory for the lifetime of the tab.

export class UndoStack<T> {
  readonly #limit: number;
  #past: T[] = [];
  #present: T;
  #future: T[] = [];

  constructor(initial: T, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("UndoStack limit must be a positive integer");
    }
    this.#limit = limit;
    this.#present = initial;
  }

  /** The state currently in effect. */
  get current(): T {
    return this.#present;
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** How many undo steps are available. */
  get depth(): number {
    return this.#past.length;
  }

  /**
   * Commit a new state.
   *
   * A new edit invalidates the redo branch — that is what makes undo a linear
   * history instead of a tree, and it is what every editor does.
   */
  push(next: T): void {
    this.#past.push(this.#present);
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#present = next;
    this.#future = [];
  }

  /** Step back. Returns the state now in effect, or null when there is none. */
  undo(): T | null {
    if (this.#past.length === 0) return null;
    const previous = this.#past.pop() as T;
    this.#future.push(this.#present);
    this.#present = previous;
    return this.#present;
  }

  /** Step forward again. Returns the state now in effect, or null. */
  redo(): T | null {
    if (this.#future.length === 0) return null;
    const next = this.#future.pop() as T;
    this.#past.push(this.#present);
    this.#present = next;
    return this.#present;
  }

  /** Replace the state and drop all history (page switch, reload). */
  reset(state: T): void {
    this.#past = [];
    this.#future = [];
    this.#present = state;
  }
}
