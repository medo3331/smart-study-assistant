import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildExamSource, readDocumentText, EXAM_SOURCE_CHUNK_CHARS } from "../exam-sources";

/**
 * مصادر الامتحان — المستندات (PDF/PPTX) كـsource حقيقي جنب المحاضرات.
 *
 * ⚠️ السبب: المولّد كان مربوط بـ`lectures` بس ⇒ امتحان من ملف PDF كان
 *    بيفشل بـ502/503 من غير سبب حقيقي.
 */
type Handler = { data?: unknown; error?: unknown };

function fakeSupabase(handlers: Record<string, Handler>) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        order: () => chain,
        limit: async () => {
          calls.push({ table, filters });
          const handler = handlers[table];
          return { data: handler?.data ?? null, error: handler?.error ?? null };
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("readDocumentText — نص المستند", () => {
  it("بيقرا صفحات knowledge_base بترتيب القراءة", async () => {
    const { client, calls } = fakeSupabase({
      documents: { data: [{ id: "doc-1", title: "ملخص الفصل", material_id: "mat-1", status: "ready" }] },
      knowledge_base: {
        data: [
          { source_page: "2", chunk_index: 0, content: "الصفحة التانية" },
          { source_page: "1", chunk_index: 0, content: "الصفحة الأولى" },
          { source_page: "1", chunk_index: 1, content: "الصفحة الأولى (تابع)" },
        ],
      },
    });

    const result = await readDocumentText(client, { documentId: "doc-1", userId: "user-1" });

    expect(result?.title).toBe("ملخص الفصل");
    expect(result?.text).toContain("الصفحة الأولى");
    expect(result?.text).toContain("الصفحة التانية");
    // ⚠️ الملكية متحقَّق منها (user_id على المستند).
    const docCall = calls.find((call) => call.table === "documents");
    expect(docCall?.filters.user_id).toBe("user-1");
    expect(docCall?.filters.id).toBe("doc-1");
  });

  it("مافيش ملكية ⇒ null (مافيش تسريب نص)", async () => {
    const { client } = fakeSupabase({ documents: { data: [] } });
    const result = await readDocumentText(client, { documentId: "doc-x", userId: "user-1" });
    expect(result).toBeNull();
  });

  it("احتياطي: النص المدمج في materials لو مفيش صفحات", async () => {
    const { client } = fakeSupabase({
      documents: { data: [{ id: "doc-2", title: "ملف", material_id: "mat-2", status: "ready" }] },
      knowledge_base: { data: [] },
      materials: { data: [{ id: "mat-2", title: "ملف", content: "نص مدمج من الاستخراج" }] },
    });

    const result = await readDocumentText(client, { documentId: "doc-2", userId: "user-1" });
    expect(result?.text).toBe("نص مدمج من الاستخراج");
  });
});

describe("buildExamSource — التقطيع قبل الـAI", () => {
  it("نص كبير (50 صفحة) ⇒ بيتقطّع لمجموعات (مش نداء واحد)", () => {
    const text = "ا".repeat(50_000);
    const source = buildExamSource({ kind: "document", title: "كتاب", text });

    expect(source.kind).toBe("document");
    expect(source.chars).toBe(50_000);
    // ⚠️ مافيش نداء واحد بياخد 50 ألف حرف.
    expect(source.chunks.length).toBeGreaterThan(1);
    for (const chunk of source.chunks) {
      expect(chunk.length).toBeLessThanOrEqual(EXAM_SOURCE_CHUNK_CHARS + 1);
    }
  });

  it("نص قصير ⇒ قطعة واحدة", () => {
    const source = buildExamSource({ kind: "recording", title: "محاضرة قصيرة", text: "نص قصير" });
    expect(source.chunks).toEqual(["نص قصير"]);
  });

  it("مصدر المحاضرة بيبقى kind=recording", () => {
    const source = buildExamSource({ kind: "recording", title: "محاضرة", text: "نص" });
    expect(source.kind).toBe("recording");
  });
});
