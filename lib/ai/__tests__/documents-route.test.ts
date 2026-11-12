/**
 * 📄 اختبار راوت `/api/documents` — Phase 5
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🎯 **الادعاء اللي الملف ده بياثبته:**
 *
 *   الـ API بيرجّع المادة **بشكل `Material`** (camelCase) — **مش** الصف
 *   الخام من القاعدة (snake_case).
 *
 * ⚠️ **ليه ده مهم:** الـ workspace بيحطّ المادة الجديدة في الـ state
 *    على طول (`setMaterials((prev) => [created, ...prev])`) — وبيقرا
 *    منها `fileType` و`createdAt`.
 *
 *   لو رجعنا الصف الخام:
 *     `fileType === undefined`  ⇒ زرار «عرض» (العرض التقديمي) **مش
 *                                بيظهر خالص** لحد ما الصفحة تتحدّث،
 *     `createdAt === undefined` ⇒ التاريخ «Invalid Date».
 *
 *   ⇒ صفر مرجع في الـ UI، وفي Feature زعلانة (silent). بالظبط النوع ده
 *   من الباجات اللي بتعدّي الـ unit tests.
 *
 * كل الاعتماديات بتعمل بـ mock — مافيش نداء شبكي ولا Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── mocks ── */
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
const kbInsertCalls: Array<Record<string, unknown>[]> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => (globalThis as unknown as { __sb: unknown }).__sb,
}));

vi.mock("@/lib/api-guard", () => ({
  requireUser: async () => ({
    user: { id: "user-1" },
    supabase: (globalThis as unknown as { __sb: unknown }).__sb,
    response: null,
  }),
  checkRateLimit: async () => null,
}));

vi.mock("@/lib/extract-text", () => ({
  extractDocument: async () => ({
    text: "نص المستند المستخرج",
    pages: [
      { index: 0, number: 1, text: "نص المستند المستخرج", kind: "page", viaOcr: false, empty: false },
    ],
    pageCount: 1,
    kind: "pdf",
    unread: [],
  }),
}));

import { POST } from "@/app/api/documents/route";

/** صف المادة الخام كما بيرجعه PostgREST (snake_case). */
const RAW_MATERIAL_ROW = {
  id: "mat-1",
  title: "محاضرة.pdf",
  file_type: "application/pdf",
  file_size: 1234,
  content: "نص المستند المستخرج",
  summary: null,
  note: "",
  created_at: "2026-11-12T10:00:00.000Z",
};

function makeSupabase() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };

  return {
    from: (table: string) => {
      if (table === "materials") {
        return {
          insert: (values: Record<string, unknown>) => {
            insertCalls.push({ table, values });
            return {
              select: () => ({
                single: async () => ({ data: RAW_MATERIAL_ROW, error: null }),
              }),
            };
          },
        };
      }
      if (table === "documents") {
        return {
          insert: (values: Record<string, unknown>) => {
            insertCalls.push({ table, values });
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: "doc-1",
                    title: "محاضرة.pdf",
                    file_type: "application/pdf",
                    page_count: 1,
                    status: "ready",
                    unread_pages: [],
                  },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "knowledge_base") {
        return {
          insert: (rows: Record<string, unknown>[]) => {
            kbInsertCalls.push(rows);
            return { error: null };
          },
        };
      }
      return builder;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

function makeFile() {
  return new File([new Uint8Array([1, 2, 3])], "محاضرة.pdf", {
    type: "application/pdf",
  });
}

beforeEach(() => {
  insertCalls.length = 0;
  kbInsertCalls.length = 0;
  (globalThis as unknown as { __sb: unknown }).__sb = makeSupabase();
});

describe("/api/documents — شكل رد الـ API", () => {
  it("✅ الـ material بيرجع بشكل Material (camelCase)", async () => {
    const formData = new FormData();
    formData.append("file", makeFile());

    const res = await POST(
      new Request("http://localhost/api/documents", { method: "POST", body: formData }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const m = body.material as Record<string, unknown>;
    // ⚠️ الأهم: `fileType` لازم يبقى موجود — الـ workspace بيقراه عشان
    //    يقرّر يظهر زرار «عرض» ولا لأ.
    expect(m.fileType).toBe("application/pdf");
    expect(m.fileSize).toBe(1234);
    expect(m.createdAt).toBe(RAW_MATERIAL_ROW.created_at);
    expect(m.note).toBe("");
    expect(m.content).toBe("نص المستند المستخرج");
    expect(m.id).toBe("mat-1");
  });

  it("⛔ مافيش مفاتيح snake_case في رد الـ material", async () => {
    // ⚠️ الـ UI بتقرأ camelCase بس — لو رجع snake_case الـ shape غلط.
    const formData = new FormData();
    formData.append("file", makeFile());

    const res = await POST(
      new Request("http://localhost/api/documents", { method: "POST", body: formData }),
    );
    const body = await res.json();

    const m = body.material as Record<string, unknown>;
    expect(m.file_type).toBeUndefined();
    expect(m.file_size).toBeUndefined();
    expect(m.created_at).toBeUndefined();
  });

  it("✅ الـ document بيرجع snake_case (الـ DeckPanel بيقرأها كده)", async () => {
    const formData = new FormData();
    formData.append("file", makeFile());

    const res = await POST(
      new Request("http://localhost/api/documents", { method: "POST", body: formData }),
    );
    const body = await res.json();

    const d = body.document as Record<string, unknown>;
    // ⚠️ `DeckPanel` نوعه `DocumentRow` بـ `file_type`/`page_count`/
    //    `unread_pages` — لازم يفضل snake_case.
    expect(d.file_type).toBe("application/pdf");
    expect(d.page_count).toBe(1);
    expect(d.unread_pages).toEqual([]);
  });

  it("✅ الصفحات بتتخزّن بـ source_type/source_kind المسموح بيهم", async () => {
    const formData = new FormData();
    formData.append("file", makeFile());

    await POST(
      new Request("http://localhost/api/documents", { method: "POST", body: formData }),
    );

    expect(kbInsertCalls).toHaveLength(1);
    const row = kbInsertCalls[0][0];
    // ⚠️ CHECK constraint في القاعدة بيقبل (user, material|lecture) بس.
    expect(row.source_type).toBe("user");
    expect(row.source_kind).toBe("material");
    expect(row.source_id).toBe("doc-1");
    expect(row.source_page).toBe("1");
    // ⚠️ v1: مافيش embeddings (الـ RAG شغل منفصل).
    expect(row.embedding).toBeUndefined();
  });

  it("✅ الـ material مرتبط بالـ document (material_id)", async () => {
    const formData = new FormData();
    formData.append("file", makeFile());

    await POST(
      new Request("http://localhost/api/documents", { method: "POST", body: formData }),
    );

    const docInsert = insertCalls.find((c) => c.table === "documents");
    expect(docInsert?.values.material_id).toBe("mat-1");
    expect(docInsert?.values.user_id).toBe("user-1");
  });
});
