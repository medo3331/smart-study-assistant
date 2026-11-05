import { describe, it, expect } from "vitest";
import { resolveWorkspaceSource } from "../workspace-source-resolver";

function makeSupabase(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const chain: any = {
        select() { return chain; },
        eq(col: string, val: any) {
          rows = rows.filter((r) => r[col] === val);
          return chain;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          const asc = opts?.ascending !== false;
          rows.sort((a, b) => {
            if (a[col] < b[col]) return asc ? -1 : 1;
            if (a[col] > b[col]) return asc ? 1 : -1;
            return 0;
          });
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(resolve: any) {
          resolve({ data: rows, error: null });
        },
      };
      return chain;
    },
  } as any;
}

const USER = "user-1";
const OTHER = "user-2";

describe("resolveWorkspaceSource — lectures", () => {
  it("resolves lecture ordinal 1 to oldest eligible lecture", async () => {
    const supabase = makeSupabase({
      lectures: [
        { id: "l2", user_id: USER, title: "L2", status: "completed", transcript_text: "t2", created_at: "2024-02-01T00:00:00Z" },
        { id: "l1", user_id: USER, title: "L1", status: "completed", transcript_text: "t1", created_at: "2024-01-01T00:00:00Z" },
        { id: "l0", user_id: USER, title: "empty", status: "completed", transcript_text: "   ", created_at: "2023-12-01T00:00:00Z" },
        { id: "lf", user_id: USER, title: "failed", status: "failed", transcript_text: "tf", created_at: "2023-11-01T00:00:00Z" },
      ],
    });
    const res = await resolveWorkspaceSource({ supabase, userId: USER, message: "اشرح المحاضرة رقم 1" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.source.id).toBe("l1");
      expect(res.source.family).toBe("lecture");
    }
  });

  it("returns not_found for out-of-range ordinal", async () => {
    const supabase = makeSupabase({
      lectures: [
        { id: "l1", user_id: USER, title: "L1", status: "completed", transcript_text: "t1", created_at: "2024-01-01T00:00:00Z" },
      ],
    });
    const res = await resolveWorkspaceSource({ supabase, userId: USER, message: "اشرح المحاضرة رقم 5" });
    expect(res.status).toBe("not_found");
  });

  it("returns ambiguous for duplicate titles", async () => {
    const supabase = makeSupabase({
      lectures: [
        { id: "a", user_id: USER, title: "Lecture 1", status: "completed", transcript_text: "x", created_at: "2024-01-01T00:00:00Z" },
        { id: "b", user_id: USER, title: "Lecture 1", status: "completed", transcript_text: "y", created_at: "2024-02-01T00:00:00Z" },
      ],
    });
    const res = await resolveWorkspaceSource({ supabase, userId: USER, message: "اشرح محاضرة Lecture 1" });
    expect(res.status).toBe("ambiguous");
  });

  it("returns none when no sources", async () => {
    const supabase = makeSupabase({ lectures: [] });
    const res = await resolveWorkspaceSource({ supabase, userId: USER, message: "اشرح المحاضرة رقم 1" });
    expect(res.status).toBe("none");
  });
});

describe("resolveWorkspaceSource — materials", () => {
  it("resolves material ordinal 1 from materials only", async () => {
    const supabase = makeSupabase({
      materials: [
        { id: "m2", user_id: USER, title: "M2", content: "c2", created_at: "2024-02-01T00:00:00Z" },
        { id: "m1", user_id: USER, title: "M1", content: "c1", created_at: "2024-01-01T00:00:00Z" },
      ],
    });
    const res = await resolveWorkspaceSource({ supabase, userId: USER, message: "افتح الملف رقم 1" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.source.id).toBe("m1");
      expect(res.source.family).toBe("material");
    }
  });

  it("does not mix lectures into material ordinal", async () => {
    const supabase = makeSupabase({
      lectures: [
        { id: "l1", user_id: USER, title: "L1", status: "completed", transcript_text: "t1", created_at: "2023-01-01T00:00:00Z" },
      ],
      materials: [
        { id: "m1", user_id: USER, title: "M1", content: "c1", created_at: "2024-01-01T00:00:00Z" },
      ],
    });
    const res = await resolveWorkspaceSource({ supabase, userId: USER, message: "افتح الملف رقم 1" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") expect(res.source.id).toBe("m1");
  });
});

describe("resolveWorkspaceSource — security", () => {
  it("does not resolve another user's source", async () => {
    const supabase = makeSupabase({
      lectures: [
        { id: "l1", user_id: OTHER, title: "L1", status: "completed", transcript_text: "t1", created_at: "2024-01-01T00:00:00Z" },
      ],
    });
    const res = await resolveWorkspaceSource({ supabase, userId: USER, message: "اشرح المحاضرة رقم 1" });
    expect(res.status).toBe("none");
  });

  it("invalid previous source returns not_found", async () => {
    const supabase = makeSupabase({
      lectures: [
        { id: "l1", user_id: USER, title: "L1", status: "completed", transcript_text: "t1", created_at: "2024-01-01T00:00:00Z" },
      ],
    });
    const res = await resolveWorkspaceSource({
      supabase,
      userId: USER,
      message: "كمّل شرح المحاضرة السابقة",
      previousSourceId: "does-not-exist",
      previousSourceFamily: "lecture",
    });
    expect(res.status).toBe("not_found");
  });
});
