// lib/notes/content.ts
//
// Phase 1B.2 — Content identity and revision decisions.
//
// Two rules:
//  * The revision is a MONOTONIC INTEGER supplied by the caller. Timestamps
//    are never used as a version: two writes can land in the same
//    millisecond and clocks can move backwards.
//  * "Same content" is decided by a CANONICAL serialisation, so two
//    structurally equal snapshots with a different key order are equal, while
//    a different payload at the same revision is a conflict.
//
// This module is shared by the IndexedDB storage and the in-memory double so
// both make exactly the same decision for the same inputs.

import type {
  NoteImage,
  NoteText,
  NotesTemplate,
  PageContent,
  StorageNotebook,
  StoragePage,
  Stroke,
} from "./types";

/** Normalise a revision: legacy records without one are revision 0. */
export function normalizeRevision(value: unknown): number {
  if (typeof value !== "number") return 0;
  if (!Number.isInteger(value) || value < 0) return 0;
  return value;
}

/** Recursively sort object keys so the serialisation is stable. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) result[key] = canonicalize(source[key]);
    }
    return result;
  }
  return value;
}

/** A deterministic serialisation of a JSON-compatible value. */
export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  return serialized === undefined ? "null" : serialized;
}

/** True when two payloads are structurally identical. */
export function sameContent(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * The durable content of a page: the persisted snapshot, the reserved
 * journal and the integrity flag. Timestamps are EXCLUDED on purpose — a
 * retry of the same revision must stay idempotent even though it carries a
 * fresh `updatedAt`.
 */
export function pageContent(page: StoragePage): unknown {
  return {
    persistedSnapshot: page.persistedSnapshot,
    localJournal: page.localJournal,
    quarantined: page.quarantined,
  };
}

/**
 * Serialize a page's full content into a persistedSnapshot-compatible value.
 *
 * This is the canonical source of truth for a page's drawing content; CAS
 * comparisons in `idbPutRecordIfNewer` use `canonicalJson(pageContent(record))`,
 * so the returned shape must be serializable via `canonicalJson` and stable
 * across sessions. Texts and images are optional — older callers that only
 * pass strokes keep producing the exact same bytes as before.
 */
export function pageContentStrokes(
  template: NotesTemplate,
  strokes: Stroke[],
  texts: NoteText[] = [],
  images: NoteImage[] = [],
  /** Pristine strokes preserved when the student adopts a beautified copy. */
  originalStrokes?: Stroke[],
): unknown {
  return {
    template,
    strokes,
    texts,
    images,
    ...(originalStrokes && originalStrokes.length > 0
      ? { originalStrokes }
      : {}),
  };
}

/** The empty content of a brand-new page. */
export function emptyPageContent(): PageContent {
  return { strokes: [], texts: [], images: [] };
}

/**
 * The durable content of a notebook: its name and its page list.
 * `createdAt`/`updatedAt` are excluded for the same reason as above.
 */
export function notebookContent(notebook: StorageNotebook): unknown {
  return {
    title: notebook.title,
    pageIds: notebook.pageIds,
  };
}

/** What a revision-aware write should do. */
export type RevisionDecision = "applied" | "unchanged" | "stale" | "conflict";

/**
 * Decide what a write must do.
 *
 * - no current record            → apply
 * - incoming revision is newer   → apply
 * - incoming revision is older   → stale (no write, stored content untouched)
 * - same revision, same content  → unchanged (idempotent no-op)
 * - same revision, other content → conflict (rejected, stored content untouched)
 */
export function decideRevisionWrite(
  currentRevision: number | null,
  currentContent: string | null,
  incomingRevision: number,
  incomingContent: string,
): RevisionDecision {
  if (currentRevision === null) return "applied";
  if (incomingRevision > currentRevision) return "applied";
  if (incomingRevision < currentRevision) return "stale";
  return currentContent === incomingContent ? "unchanged" : "conflict";
}