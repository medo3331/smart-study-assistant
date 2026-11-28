// lib/notes/global-search.ts
//
// 🔍 بحث شامل عبر كل نوتات الطالب — pure، بدون React.
//
// البحث بيمشي على: أسماء النوتات، أسماء الصفحات، والنصوص المطبوعة.
// المساحات غير الفارغة بتتحمل عربي/إنجليزي وأي حالة (bail لو الاستعلام قصير).

import type { NoteRepository } from "./repository";
import type { StorageNotebook, StoragePage } from "./types";

export interface GlobalSearchHit {
  pageId: string;
  /** 0-based index of the page inside the notebook. */
  pageIndex: number;
  /** مكان الإيجاد — اسم الصفحة أو نص مطبوع. */
  kind: "name" | "text";
  /** مقطع من النص حوالين الإيجاد. */
  snippet: string;
}

export interface GlobalSearchResult {
  notebookId: string;
  notebookTitle: string;
  updatedAt: string;
  hits: GlobalSearchHit[];
}

const SNIPPET_RADIUS = 24;

/** مقطع مختصر حوالين أول إيجاد للنص. */
function snippetAround(text: string, needle: string): string {
  const at = text.indexOf(needle);
  if (at < 0) return text.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + needle.length + SNIPPET_RADIUS);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + body + (end < text.length ? "…" : "");
}

/** نصوص الصفحة القابلة للبحث — النصوص المطبوعة اللي جوه الـ snapshot. */
function pageSearchTexts(page: StoragePage): string[] {
  const texts: string[] = [];
  const snapshot = page.persistedSnapshot as
    | {
        texts?: Array<{ text?: unknown; value?: unknown }>;
        content?: { texts?: Array<{ text?: unknown; value?: unknown }> };
      }
    | null;
  if (snapshot && typeof snapshot === "object") {
    for (const text of snapshot.texts ?? snapshot.content?.texts ?? []) {
      const value = text?.text ?? text?.value;
      if (typeof value === "string" && value.trim()) {
        texts.push(value.trim());
      }
    }
  }
  return texts;
}

/** ⬇ يبني محتوى بحث كامل (نوتات×صفحات×نصوص) من مستودع واحد — بيعدي كل النوتات. */
export async function buildSearchIndex(
  repo: NoteRepository,
): Promise<Array<{ notebook: StorageNotebook; pages: StoragePage[] }>> {
  const notebooks = await repo.listNotebooks();
  const indexed: Array<{ notebook: StorageNotebook; pages: StoragePage[] }> = [];
  for (const notebook of notebooks) {
    const pages: StoragePage[] = [];
    for (const pageId of notebook.pageIds) {
      const page = await repo.getPage(pageId).catch(() => null);
      if (page) pages.push(page);
    }
    indexed.push({ notebook, pages });
  }
  return indexed;
}

/** 🔍 يبحث في الـ index المبنى — بيرجّع النتائج جماعية حسب النوتة. */
export function searchIndex(
  index: Array<{ notebook: StorageNotebook; pages: StoragePage[] }>,
  rawQuery: string,
): GlobalSearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];
  const results: GlobalSearchResult[] = [];
  for (const { notebook, pages } of index) {
    const hits: GlobalSearchHit[] = [];
    pages.forEach((page, pageIndex) => {
      const pageName = notebook.pageNames?.[page.id]?.trim().toLowerCase();
      if (pageName && pageName.includes(query)) {
        hits.push({
          pageId: page.id,
          pageIndex,
          kind: "name",
          snippet: notebook.pageNames?.[page.id] ?? "",
        });
      }
      for (const text of pageSearchTexts(page)) {
        if (text.toLowerCase().includes(query)) {
          hits.push({ pageId: page.id, pageIndex, kind: "text", snippet: snippetAround(text, query) });
          break; // مقطع واحد من الصفحة كفاية
        }
      }
    });
    if (hits.length > 0 || notebook.title.toLowerCase().includes(query)) {
      results.push({
        notebookId: notebook.id,
        notebookTitle: notebook.title,
        updatedAt: notebook.updatedAt,
        hits: hits.slice(0, 8),
      });
    }
  }
  return results.slice(0, 20);
}
