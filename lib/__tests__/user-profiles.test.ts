import { describe, expect, it } from "vitest";
import { defaultProfileForUser, normalizePersona } from "../user-profiles";

describe("normalizePersona — المُطبِّع الوحيد لقيم persona من الـ DB", () => {
  it('maps DB "grad" → "graduate" (نفس تحويل العمود المولّد)', () => {
    expect(normalizePersona("grad")).toBe("graduate");
  });

  it('keeps "student" as "student"', () => {
    expect(normalizePersona("student")).toBe("student");
  });

  it('keeps "freelancer" as "freelancer"', () => {
    expect(normalizePersona("freelancer")).toBe("freelancer");
  });

  it('unknown values (e.g. "teacher") fall back to "student"', () => {
    expect(normalizePersona("teacher")).toBe("student");
  });

  it("null / undefined fall back to student", () => {
    expect(normalizePersona(null)).toBe("student");
    expect(normalizePersona(undefined)).toBe("student");
  });
});

describe("defaultProfileForUser — regression: الخريج كان بياخد بروفايل طالب صامت", () => {
  it('returns "graduate" for DB persona "grad"', () => {
    expect(defaultProfileForUser("grad")).toBe("graduate");
  });

  it('returns "student" for empty persona', () => {
    expect(defaultProfileForUser(null)).toBe("student");
  });
});