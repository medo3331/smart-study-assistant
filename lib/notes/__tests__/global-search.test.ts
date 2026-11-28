// lib/notes/__tests__/global-search.test.ts
//
// 🔍 اختبارات البحث الشامل — تجميع النتائج والمقاطع والعتبة.

import { describe, expect, it } from "vitest";

import { searchIndex } from "../global-search";
import { pageContentStrokes } from "../content";
import type { StorageNotebook, StoragePage } from "../types";

const page = (id: string, lines: string[]): StoragePage => ({
  id,
  ownerId: "u1",
  notebookId: "nb1",
  template: "lined",
  persistedSnapshot: pageContentStrokes(
    "lined",
    [],
    lines.map((line, index) => ({
      id: `t${index}`,
      kind: "text" as const,
      text: line,
      x: 10,
      y: 10 + index * 30,
      size: 18,
      color: "#000",
    })),
  ),
  localJournal: [],
  quarantined: false,
  revision: 1,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

const notebook = (id: string, title: string, pages: StoragePage[], pageNames?: Record<string, string>): StorageNotebook => ({
  id,
  ownerId: "u1",
  title,
  pageIds: pages.map((p) => p.id),
  ...(pageNames ? { pageNames } : {}),
  currentPageId: pages[0]?.id ?? null,
  revision: 1,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
});

describe("global-search", () => {
  const index = [
    {
      notebook: notebook("nb1", "رياضيات", [
        page("p1", ["معادلة الدرجة الثانية"]),
        page("p2", ["جدول التفاضل"]),
      ], { p1: "المحاضرة الأولى" }),
      pages: [
        page("p1", ["معادلة الدرجة الثانية"]),
        page("p2", ["جدول التفاضل"]),
      ],
    },
    {
      notebook: notebook("nb2", "فيزياء", [
        page("p3", ["قانون نيوتن الثاني"]),
      ]),
      pages: [page("p3", ["قانون نيوتن الثاني"])],
    },
  ];

  it("يرجّع مفيش للاستعلام القصير جداً", () => {
    expect(searchIndex(index, "ر")).toEqual([]);
  });

  it("بيلاقي نص مطبوع في صفحة", () => {
    const results = searchIndex(index, "نيوتن");
    expect(results).toHaveLength(1);
    expect(results[0].notebookTitle).toBe("فيزياء");
    expect(results[0].hits[0]).toMatchObject({ pageId: "p3", kind: "text" });
  });

  it("بيلاقي اسم الصفحة", () => {
    const results = searchIndex(index, "محاضرة");
    expect(results[0].hits[0]).toMatchObject({ pageId: "p1", kind: "name" });
  });

  it("بيطابق عنوان النوتة لو مفيش hits", () => {
    const results = searchIndex(index, "رياضيات");
    expect(results).toHaveLength(1);
    expect(results[0].notebookId).toBe("nb1");
    expect(results[0].hits).toHaveLength(0);
  });

  it("المقطع بيلف النص بالسهام لو مقطوع", () => {
    const results = searchIndex(index, "التفاضل");
    expect(results[0].hits[0].snippet).toContain("التفاضل");
  });

  it("مش بيرجّع نتايج لكلام مش موجود", () => {
    expect(searchIndex(index, "كيمياء")).toEqual([]);
  });
});
