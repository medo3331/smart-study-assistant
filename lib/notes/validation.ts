// lib/notes/validation.ts
//
// Phase 1B.1 — Structural storage-record validation.
// Phase 1B.2 adds integrity validation (relationships, checksums, duplicate detection).

import type {
  NotesTemplate,
  PageFormat,
  StorageNotebook,
  StoragePage,
  StorageBackup,
  StorageMeta,
  ValidationResult,
} from "./types";

/** Every page size the storage layer accepts. */
export const VALID_PAGE_FORMATS: readonly PageFormat[] = ["a4", "wide", "slide"];

/** Every template value the storage layer accepts. */
export const VALID_TEMPLATES: readonly NotesTemplate[] = [
  "lined",
  "grid",
  "dotted",
  "blank",
  "cornell",
  "arabic",
  "columns",
  "planner",
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && !isNaN(Date.parse(s));
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// --- Notebook validation ---

export function validateNotebook(record: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(record)) {
    return { valid: false, errors: ["Record is not a plain object"] };
  }
  const r = record as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) errors.push("id must be a non-empty string");
  if (!isNonEmptyString(r.ownerId)) errors.push("ownerId must be a non-empty string");
  if (typeof r.title !== "string") errors.push("title must be a string");
  if (!Array.isArray(r.pageIds)) errors.push("pageIds must be an array");
  else if (!r.pageIds.every((id: unknown) => typeof id === "string")) {
    errors.push("pageIds must contain only strings");
  }
  // pageNames اختياري (نوتات قديمة مالوش) — لو موجود لازم خريطة نصوص.
  if (r.pageNames !== undefined && !isPlainObject(r.pageNames)) {
    errors.push("pageNames must be a plain object when present");
  } else if (isPlainObject(r.pageNames)) {
    const names = r.pageNames as Record<string, unknown>;
    if (!Object.values(names).every((value) => typeof value === "string")) {
      errors.push("pageNames values must be strings");
    }
  }
  // pageFormat اختياري (نوتات قديمة مالوش) — لو موجود لازم يكون مقاس معروف.
  if (r.pageFormat !== undefined && !VALID_PAGE_FORMATS.includes(r.pageFormat as PageFormat)) {
    errors.push(`pageFormat must be one of: ${VALID_PAGE_FORMATS.join(", ")}`);
  }
  if (!isValidDate(r.createdAt)) errors.push("createdAt must be a valid ISO date");
  if (!isValidDate(r.updatedAt)) errors.push("updatedAt must be a valid ISO date");

  return { valid: errors.length === 0, errors };
}

// --- Page validation ---

export function validatePage(record: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(record)) {
    return { valid: false, errors: ["Record is not a plain object"] };
  }
  const r = record as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) errors.push("id must be a non-empty string");
  if (!isNonEmptyString(r.ownerId)) errors.push("ownerId must be a non-empty string");
  if (!isNonEmptyString(r.notebookId)) errors.push("notebookId must be a non-empty string");
  if (!VALID_TEMPLATES.includes(r.template as NotesTemplate)) {
    errors.push(`template must be one of: ${VALID_TEMPLATES.join(", ")}`);
  }
  if (!isPlainObject(r.persistedSnapshot)) {
    errors.push("persistedSnapshot must be a plain object");
  }
  if (!Array.isArray(r.localJournal)) {
    errors.push("localJournal must be an array");
  }
  if (typeof r.quarantined !== "boolean") {
    errors.push("quarantined must be a boolean");
  }
  if (!isValidDate(r.createdAt)) errors.push("createdAt must be a valid ISO date");
  if (!isValidDate(r.updatedAt)) errors.push("updatedAt must be a valid ISO date");

  return { valid: errors.length === 0, errors };
}

// --- Backup validation ---

export function validateBackup(record: unknown): ValidationResult {
  const base = validatePage(record);
  if (!base.valid) return base;

  const r = record as Record<string, unknown>;
  const errors: string[] = [...base.errors];

  if (typeof r.backupRevision !== "number" || r.backupRevision < 0 || !Number.isInteger(r.backupRevision)) {
    errors.push("backupRevision must be a non-negative integer");
  }
  if (!isNonEmptyString(r.backupChecksum)) {
    errors.push("backupChecksum must be a non-empty string");
  }
  if (!isValidDate(r.backupCreatedAt)) {
    errors.push("backupCreatedAt must be a valid ISO date");
  }

  return { valid: errors.length === 0, errors };
}

// --- Meta validation ---

export function validateMeta(record: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(record)) {
    return { valid: false, errors: ["Record is not a plain object"] };
  }
  const r = record as Record<string, unknown>;

  if (!isNonEmptyString(r.key)) errors.push("key must be a non-empty string");
  if (r.value === undefined) errors.push("value must be defined");

  return { valid: errors.length === 0, errors };
}

// --- Store name → validator mapping ---

export function validateStorageRecord(storeName: string, record: unknown): ValidationResult {
  switch (storeName) {
    case "notebooks":
      return validateNotebook(record);
    case "pages":
      return validatePage(record);
    case "pages_backup":
      return validateBackup(record);
    case "meta":
      return validateMeta(record);
    default:
      return { valid: false, errors: [`Unknown store: ${storeName}`] };
  }
}
