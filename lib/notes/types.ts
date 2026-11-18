// lib/notes/types.ts
//
// Phase 1B.1 — Storage Foundation types.
//
// Owner scoping: every record belongs to exactly one owner namespace, and the
// owner id is always namespace-prefixed so the anonymous and the
// authenticated namespaces can never collide:
//
//   "anon:<uuid>"          → anonymous namespace
//   "user:<supabase-uid>"  → authenticated namespace
//
// The prefix lives in the stored `ownerId` value. There is no migration in
// Phase 1B.1 because the database has never shipped.

/** Kind of owner namespace a record belongs to. */
export type NotesOwnerKind = "anon" | "user";

/**
 * The owner of a notes namespace.
 *
 * `id` is always prefixed, e.g. `anon:2f1c...`.
 */
export type NotesOwner = {
  readonly kind: NotesOwnerKind;
  readonly id: string;
};

/**
 * Lifecycle state of a repository.
 *
 * - `ready`     → this tab holds the owner write lease.
 * - `read-only` → another tab (or no Web Locks support) holds the write lease.
 * - `disposed`  → the repository was disposed; every operation is rejected.
 */
export type NoteRepositoryStatus = "ready" | "read-only" | "disposed";

/**
 * Geometric shapes drawn with a two-point gesture (start → end).
 *
 * A shape is stored as a Stroke whose `points` is exactly [start, end], so
 * undo/redo, the eraser and the revision guard keep working unchanged.
 */
export type StrokeShape = "line" | "arrow" | "rect" | "ellipse";

/** A single drawing stroke, stable across reloads. */
export type Stroke = {
  id: string;
  tool: "pen" | "ink" | "pencil" | "highlighter";
  color: string;
  thickness: number;
  opacity: number;
  points: [number, number][];
  pressure?: number; // per-point when supported, else 0.5 fallback
  /** Present only for shape strokes — freehand strokes omit it. */
  shape?: StrokeShape;
};

/** A typed text block placed on the page (Arabic/RTL aware). */
export type NoteText = {
  id: string;
  kind: "text";
  text: string;
  /** Top-left corner of the text box, in page coordinates. */
  x: number;
  y: number;
  /** Font size in page pixels. */
  size: number;
  color: string;
  /** CSS font family; falls back to the site body font. */
  font?: string;
};

/** A raster image embedded in the page (stored as a data URL). */
export type NoteImage = {
  id: string;
  kind: "image";
  src: string;
  /** Placement and size, in page coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Everything a page can contain, in one immutable snapshot. */
export type PageContent = {
  strokes: Stroke[];
  texts: NoteText[];
  images: NoteImage[];
};

/** Storage record for a notebook. */
export type StorageNotebook = {
  id: string;
  ownerId: string;
  title: string;
  pageIds: string[];
  currentPageId: string | null;
  /**
   * Monotonic revision of this record.
   *
   * Legacy records (written before Phase 1B.2) have no revision and are
   * read as revision 0. The first revision written by Phase 1B.2 is
   * therefore strictly greater than the legacy one.
   */
  revision: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Page background template.
 *
 * Stored verbatim, so adding a variant is a backwards-compatible change:
 * records written with an older variant keep validating.
 */
export type NotesTemplate = "lined" | "grid" | "dotted" | "blank";

/** Storage record for a page. */
export type StoragePage = {
  id: string;
  ownerId: string;
  notebookId: string;
  template: NotesTemplate;
  // Opaque in Phase 1B.1 — validated as object only.
  persistedSnapshot: unknown;
  // Opaque in Phase 1B.1 — validated as array only.
  localJournal: unknown[];
  quarantined: boolean;
  /** Monotonic revision — see StorageNotebook.revision. */
  revision: number;
  createdAt: string;
  updatedAt: string;
};

/** Outcome of a revision-aware write. */
export type RevisionWriteOutcome = "applied" | "unchanged" | "stale" | "conflict";

/** Result of a revision-aware write. */
export type RevisionWriteResult = {
  /** What the write did. */
  outcome: RevisionWriteOutcome;
  /** The revision that is stored after the write. */
  revision: number;
};

/** Storage record for a page backup. */
export type StorageBackup = StoragePage & {
  backupRevision: number;
  backupChecksum: string;
  backupCreatedAt: string;
};

/** Storage record for metadata. */
export type StorageMeta = {
  key: string;
  value: unknown;
};

/** Validation result. */
export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

/** A single validation error with path. */
export type ValidationError = {
  path: string;
  message: string;
};

/**
 * Owner-bound storage contract.
 *
 * A storage instance is created for exactly one owner namespace. It refuses to
 * read or write records that belong to a different owner, so a leaked
 * reference can never be pointed at another namespace.
 *
 * Implementation note: the storage layer is deliberately NOT the place where
 * record validation lives (see validation.ts) — the repository owns that.
 */
export interface NoteStorage {
  /** The owner namespace this storage instance is bound to. */
  readonly ownerId: string;

  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;

  getNotebook(id: string): Promise<StorageNotebook | null>;
  listNotebooks(): Promise<StorageNotebook[]>;
  /**
   * Write a notebook with a revision guard: the write is applied only when
   * the incoming revision is newer than the stored one. A write with the
   * same revision and identical content is an idempotent no-op; the same
   * revision with different content is rejected as a revision conflict.
   */
  putNotebook(nb: StorageNotebook): Promise<RevisionWriteResult>;
  /**
   * Delete a notebook and every page that belongs to it inside ONE IndexedDB
   * transaction. Ownership is verified inside the transaction; any ownership
   * inconsistency aborts the whole transaction.
   */
  deleteNotebookCascade(notebookId: string): Promise<void>;

  getPage(id: string): Promise<StoragePage | null>;
  listPages(notebookId?: string): Promise<StoragePage[]>;
  /** Write a page with a revision guard — see putNotebook. */
  putPage(page: StoragePage): Promise<RevisionWriteResult>;
  deletePage(id: string): Promise<void>;

  getBackup(id: string): Promise<StorageBackup | null>;
  putBackup(backup: StorageBackup): Promise<void>;
  deleteBackup(id: string): Promise<void>;

  getMeta(key: string): Promise<unknown>;
  putMeta(key: string, value: unknown): Promise<void>;
  deleteMeta(key: string): Promise<void>;
}