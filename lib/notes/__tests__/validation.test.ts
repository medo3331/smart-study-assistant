import { describe, it, expect } from "vitest";
import { validateNotebook, validatePage, validateBackup, validateMeta } from "../validation";

describe("validateNotebook", () => {
  it("accepts a valid notebook", () => {
    const nb = {
      id: "nb1",
      ownerId: "owner1",
      title: "My Notebook",
      pageIds: ["p1", "p2"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validateNotebook(nb).valid).toBe(true);
  });

  it("rejects null", () => {
    expect(validateNotebook(null).valid).toBe(false);
  });

  it("rejects array", () => {
    expect(validateNotebook([]).valid).toBe(false);
  });

  it("rejects missing id", () => {
    const nb = { ownerId: "o", title: "t", pageIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(validateNotebook(nb).valid).toBe(false);
  });

  it("rejects empty ownerId", () => {
    const nb = { id: "nb1", ownerId: "", title: "t", pageIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(validateNotebook(nb).valid).toBe(false);
  });

  it("rejects invalid date", () => {
    const nb = { id: "nb1", ownerId: "o", title: "t", pageIds: [], createdAt: "not-a-date", updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(validateNotebook(nb).valid).toBe(false);
  });

  it("rejects non-string pageIds", () => {
    const nb = { id: "nb1", ownerId: "o", title: "t", pageIds: [123], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(validateNotebook(nb).valid).toBe(false);
  });
});

describe("validatePage", () => {
  it("accepts a valid page", () => {
    const page = {
      id: "p1",
      ownerId: "owner1",
      notebookId: "nb1",
      template: "lined",
      persistedSnapshot: {},
      localJournal: [],
      quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validatePage(page).valid).toBe(true);
  });

  it("rejects null", () => {
    expect(validatePage(null).valid).toBe(false);
  });

  it("rejects array", () => {
    expect(validatePage([]).valid).toBe(false);
  });

  it("rejects invalid template", () => {
    const page = {
      id: "p1", ownerId: "o", notebookId: "nb1", template: "fancy",
      persistedSnapshot: {}, localJournal: [], quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validatePage(page).valid).toBe(false);
  });

  it("rejects non-object persistedSnapshot", () => {
    const page = {
      id: "p1", ownerId: "o", notebookId: "nb1", template: "lined",
      persistedSnapshot: null, localJournal: [], quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validatePage(page).valid).toBe(false);
  });

  it("rejects non-array localJournal", () => {
    const page = {
      id: "p1", ownerId: "o", notebookId: "nb1", template: "lined",
      persistedSnapshot: {}, localJournal: "not-array", quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validatePage(page).valid).toBe(false);
  });

  it("rejects missing ownerId", () => {
    const page = {
      id: "p1", notebookId: "nb1", template: "lined",
      persistedSnapshot: {}, localJournal: [], quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validatePage(page).valid).toBe(false);
  });
});

describe("validateBackup", () => {
  it("accepts a valid backup", () => {
    const backup = {
      id: "p1", ownerId: "o", notebookId: "nb1", template: "lined",
      persistedSnapshot: {}, localJournal: [], quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      backupRevision: 1, backupChecksum: "abc123", backupCreatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validateBackup(backup).valid).toBe(true);
  });

  it("rejects missing backupRevision", () => {
    const backup = {
      id: "p1", ownerId: "o", notebookId: "nb1", template: "lined",
      persistedSnapshot: {}, localJournal: [], quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      backupChecksum: "abc", backupCreatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validateBackup(backup).valid).toBe(false);
  });

  it("rejects negative backupRevision", () => {
    const backup = {
      id: "p1", ownerId: "o", notebookId: "nb1", template: "lined",
      persistedSnapshot: {}, localJournal: [], quarantined: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      backupRevision: -1, backupChecksum: "abc", backupCreatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(validateBackup(backup).valid).toBe(false);
  });
});

describe("validateMeta", () => {
  it("accepts valid meta", () => {
    expect(validateMeta({ key: "k", value: "v" }).valid).toBe(true);
  });

  it("rejects null", () => {
    expect(validateMeta(null).valid).toBe(false);
  });

  it("rejects missing key", () => {
    expect(validateMeta({ value: "v" }).valid).toBe(false);
  });

  it("rejects empty key", () => {
    expect(validateMeta({ key: "", value: "v" }).valid).toBe(false);
  });

  it("rejects undefined value", () => {
    expect(validateMeta({ key: "k", value: undefined }).valid).toBe(false);
  });
});
