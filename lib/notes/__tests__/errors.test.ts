import { describe, it, expect } from "vitest";
import { classifyNotesError, NOTES_ERROR_CODES, NotesError } from "../errors";

describe("classifyNotesError", () => {
  it("classifies native quota errors", () => {
    expect(classifyNotesError(new DOMException("x", "QuotaExceededError"))).toBe(
      "quota",
    );
  });

  it("classifies native abort errors", () => {
    expect(classifyNotesError(new DOMException("x", "AbortError"))).toBe("abort");
  });

  it("classifies the blocked error", () => {
    expect(classifyNotesError(new DOMException("x", "BlockedError"))).toBe(
      "blocked",
    );
  });

  it("classifies version and invalid-state errors", () => {
    expect(classifyNotesError(new DOMException("x", "VersionError"))).toBe(
      "version",
    );
    expect(classifyNotesError(new DOMException("x", "InvalidStateError"))).toBe(
      "invalid-state",
    );
  });

  it("classifies application errors by their code", () => {
    expect(
      classifyNotesError(
        new NotesError(NOTES_ERROR_CODES.READ_ONLY, "NOTES_READ_ONLY: x"),
      ),
    ).toBe("read-only");
    expect(
      classifyNotesError(
        new NotesError(NOTES_ERROR_CODES.DISPOSED, "NOTES_DISPOSED: x"),
      ),
    ).toBe("disposed");
    expect(
      classifyNotesError(
        new NotesError(NOTES_ERROR_CODES.OWNER_MISMATCH, "OWNER_MISMATCH: x"),
      ),
    ).toBe("owner-mismatch");
    expect(
      classifyNotesError(
        new NotesError(
          NOTES_ERROR_CODES.IDENTITY_UNAVAILABLE,
          "NOTES_IDENTITY_UNAVAILABLE: x",
        ),
      ),
    ).toBe("identity-unavailable");
    expect(
      classifyNotesError(
        new NotesError(
          NOTES_ERROR_CODES.LOCK_UNAVAILABLE,
          "NOTES_LOCK_UNAVAILABLE: x",
        ),
      ),
    ).toBe("lock-unavailable");
  });

  it("never matches on the message", () => {
    const error = new Error("QuotaExceededError: disk is full");
    expect(classifyNotesError(error)).toBe("unknown");
  });

  it("falls back to unknown", () => {
    expect(classifyNotesError(undefined)).toBe("unknown");
    expect(classifyNotesError("boom")).toBe("unknown");
  });
});
