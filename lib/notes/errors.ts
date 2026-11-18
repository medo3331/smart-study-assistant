// lib/notes/errors.ts
//
// Phase 1B.1 — Error taxonomy.
//
// Two rules drive this module:
//
//  1. Native IndexedDB errors are never wrapped. A quota failure reaches the
//     caller as the original DOMException, so `error.name === "QuotaExceededError"`
//     keeps working.
//  2. Classification never inspects error messages. It only looks at the
//     `code` of a NotesError or at the `name` of a DOMException.
//
// There is deliberately no automatic retry anywhere in the storage path:
// a quota failure is not fixed by trying again.

/** Stable, machine-readable codes for application-level (non-IndexedDB) errors. */
export const NOTES_ERROR_CODES = {
  /** The repository has been disposed; no further operation is accepted. */
  DISPOSED: "NOTES_DISPOSED",
  /** This tab does not hold the owner write lease. */
  READ_ONLY: "NOTES_READ_ONLY",
  /** A record belongs to a different owner namespace. */
  OWNER_MISMATCH: "OWNER_MISMATCH",
  /** The anonymous identity could not be established. */
  IDENTITY_UNAVAILABLE: "NOTES_IDENTITY_UNAVAILABLE",
  /** Web Locks are unavailable, so no tab can ever hold the write lease. */
  LOCK_UNAVAILABLE: "NOTES_LOCK_UNAVAILABLE",
  /** The writer lease was released or cancelled before this tab was promoted. */
  WRITER_LEASE_CANCELLED: "NOTES_WRITER_LEASE_CANCELLED",
  /**
   * A write carried the same revision as the stored record but different
   * content. The stored content is untouched.
   */
  REVISION_CONFLICT: "NOTES_REVISION_CONFLICT",
  /** Disposal could not drain the in-flight writes; the lease is retained. */
  DISPOSAL_FAILED: "NOTES_DISPOSAL_FAILED",
} as const;

export type NotesErrorCode = (typeof NOTES_ERROR_CODES)[keyof typeof NOTES_ERROR_CODES];

/**
 * Application-level error raised by the notes layer.
 *
 * The `code` is the contract; the message is for humans only.
 */
export class NotesError extends Error {
  readonly code: NotesErrorCode;

  constructor(code: NotesErrorCode, message: string) {
    super(message);
    this.name = "NotesError";
    this.code = code;
  }
}

/** Normalised classification of any error raised by the notes layer. */
export type NotesErrorKind =
  | "quota"
  | "abort"
  | "blocked"
  | "version"
  | "invalid-state"
  | "read-only"
  | "disposed"
  | "owner-mismatch"
  | "identity-unavailable"
  | "lock-unavailable"
  | "writer-lease-cancelled"
  | "revision-conflict"
  | "unknown";

const CODE_TO_KIND: Record<NotesErrorCode, NotesErrorKind> = {
  NOTES_DISPOSED: "disposed",
  NOTES_READ_ONLY: "read-only",
  OWNER_MISMATCH: "owner-mismatch",
  NOTES_IDENTITY_UNAVAILABLE: "identity-unavailable",
  NOTES_LOCK_UNAVAILABLE: "lock-unavailable",
  NOTES_WRITER_LEASE_CANCELLED: "writer-lease-cancelled",
  NOTES_REVISION_CONFLICT: "revision-conflict",
  NOTES_DISPOSAL_FAILED: "unknown",
};

function readName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

/**
 * Classify an error without ever matching on its message.
 *
 * Native IndexedDB errors are recognised by their DOMException `name`:
 * `QuotaExceededError`, `AbortError`, `BlockedError`, `VersionError` and
 * `InvalidStateError`.
 */
export function classifyNotesError(error: unknown): NotesErrorKind {
  if (error instanceof NotesError) {
    return CODE_TO_KIND[error.code] ?? "unknown";
  }

  switch (readName(error)) {
    case "QuotaExceededError":
      return "quota";
    case "AbortError":
      return "abort";
    case "BlockedError":
      return "blocked";
    case "VersionError":
      return "version";
    case "InvalidStateError":
      return "invalid-state";
    default:
      return "unknown";
  }
}
