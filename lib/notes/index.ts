// lib/notes/index.ts
//
// Phase 1B.1 — Storage Foundation public API.
//
// The barrel is deliberately narrow:
//
//  * no raw IndexedDB primitives — they are write paths that bypass the
//    owner write lease
//  * no InMemoryNoteStorage — a test double
//  * no identity injection and no testing factories — the identity is derived
//    inside the factory and can never be supplied by a caller
//
// The module boundaries are an organisational aid, not a security boundary:
// deep imports remain possible. The goal is that the supported write path is
// narrow and obvious.

export { createNoteRepository } from "./factory";
export { NoteRepository } from "./repository";
export { NotesError, NOTES_ERROR_CODES, classifyNotesError } from "./errors";
export type { NotesErrorCode, NotesErrorKind } from "./errors";
export type {
  NoteRepositoryStatus,
  NotesOwner,
  NotesOwnerKind,
  StorageBackup,
  StorageMeta,
  StorageNotebook,
  StoragePage,
} from "./types";
