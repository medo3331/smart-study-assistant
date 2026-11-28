// lib/notes/agent-import.ts
//
// استيراد مخرجات Magic Agent إلى النوتة (Notes).
//
// لما الوكيل يولّد ملف أو اختبار، الطالب يقدر يفتحه في النوتة كصفحة منظمة:
// notebook جديد + صفحات فيها النصوص مترتبة (عنوان + أقسام ملونة).
//
// ⚠️ Client-side فقط — بيستخدم IndexedDB عبر الـ factory الموثوق.

import { createNoteRepository } from "./factory";
import { DEFAULT_PAGE_FORMAT } from "./canvas";
import type { NoteText, NotesTemplate, PageContent, StorageNotebook, StoragePage } from "./types";

export interface AgentImportBlock {
  heading: string;
  body: string;
}

/** لف النص الطويل على سطور قصيرة تلاقيها صفحة النوتة. */
function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

interface LaidOutText {
  text: string;
  size: number;
  color: string;
  bold: boolean;
}

/** ترتيب المحتوى على سطور بعناوين ملونة. */
function layoutBlocks(title: string, blocks: AgentImportBlock[]): LaidOutText[] {
  const out: LaidOutText[] = [{ text: title, size: 30, color: "#6B21A8", bold: true }];
  out.push({ text: "—", size: 14, color: "#94A3B8", bold: false });
  for (const b of blocks) {
    if (b.heading) out.push({ text: b.heading, size: 21, color: "#7C3AED", bold: true });
    for (const rawLine of b.body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      for (const wrapped of wrapLine(line, 62)) {
        out.push({ text: wrapped, size: 16, color: "#1E293B", bold: false });
      }
    }
    out.push({ text: "", size: 10, color: "#94A3B8", bold: false });
  }
  return out;
}

/**
 * إنشاء نوتة جديدة فيها محتوى الـ artifact — بيرجّع id الـ notebook.
 * المحتوى الطويل بيتقسم على صفحات متعددة تلقائيًا.
 */
export async function importArtifactToNotes(
  title: string,
  blocks: AgentImportBlock[],
  opts?: { template?: NotesTemplate },
): Promise<string> {
  const repo = await createNoteRepository();
  const now = new Date().toISOString();
  const newId = (): string =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const laidOut = layoutBlocks(title, blocks);

  // تقسيم السطور على صفحات — كل صفحة ~24 سطر.
  const LINES_PER_PAGE = 24;
  const pagesContent: LaidOutText[][] = [];
  for (let i = 0; i < laidOut.length; i += LINES_PER_PAGE) {
    pagesContent.push(laidOut.slice(i, i + LINES_PER_PAGE));
  }

  const notebookId = newId();
  const pageIds: string[] = [];
  const pages: StoragePage[] = [];

  for (const lines of pagesContent) {
    const pageId = newId();
    pageIds.push(pageId);
    const texts: NoteText[] = lines.map((l, li) => ({
      id: newId(),
      kind: "text",
      text: l.text,
      x: 60,
      y: 70 + li * 28,
      size: l.size,
      color: l.color,
    }));
    const snapshot: PageContent = { strokes: [], texts, images: [] };
    pages.push({
      id: pageId,
      ownerId: repo.owner.id,
      notebookId,
      template: opts?.template ?? "arabic",
      persistedSnapshot: snapshot,
      localJournal: [],
      quarantined: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  const notebook: StorageNotebook = {
    id: notebookId,
    ownerId: repo.owner.id,
    title: title.slice(0, 120) || "من Magic Agent",
    pageIds,
    pageFormat: DEFAULT_PAGE_FORMAT,
    currentPageId: pageIds[0] ?? null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  await repo.saveNotebook(notebook);
  for (const p of pages) {
    await repo.savePage(p);
  }

  return notebookId;
}
