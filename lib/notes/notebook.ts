// lib/notes/notebook.ts
//
// Phase 1C-4 — Notebook bootstrapping, extracted from the editor.
//
// Why this module exists: the original editor ran this logic inline, inside a
// React effect, where it could not be tested. That is exactly where the silent
// data-loss bug lived — new pages were added to React state but never written,
// so every later save found nothing to update. Keeping the decisions here, with
// all I/O pushed through `NoteRepository`, makes the persistence pipeline
// verifiable against the in-memory storage double.
//
// Nothing in this module touches React, the DOM or IndexedDB directly.

import { pageContentStrokes } from "./content";
import type { NoteRepository } from "./repository";
import type {
  NoteImage,
  NoteText,
  NotesTemplate,
  PageContent,
  StorageNotebook,
  StoragePage,
  Stroke,
} from "./types";

/** What the editor should render after bootstrapping. */
export type NotebookBoot =
  | {
      status: "ready";
      notebook: StorageNotebook;
      pages: StoragePage[];
      activePageId: string | null;
    }
  /** The requested notebook id does not exist (deleted in another tab?). */
  | { status: "missing" }
  /** Nothing exists yet and this tab may not create it. */
  | { status: "read-only-empty"; reason: "no-notebooks" | "no-pages" };

export type EnsureNotebookOptions = {
  /** Open this notebook instead of the most recently updated one. */
  requestedNotebookId?: string | null;
  /** Injected so the module stays deterministic in tests. */
  newId: () => string;
  now: () => string;
  defaultTitle?: string;
  defaultTemplate?: NotesTemplate;
};

const DEFAULT_TITLE = "دفتر";
const DEFAULT_TEMPLATE: NotesTemplate = "lined";

/** Newest first. A notebook with an unparsable date sorts last, never first. */
export function sortNotebooksByRecency(
  notebooks: readonly StorageNotebook[],
): StorageNotebook[] {
  return [...notebooks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Oldest page first: pages are stored with a stable creation order. */
export function sortPagesByCreation(pages: readonly StoragePage[]): StoragePage[] {
  return [...pages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Order pages the way the notebook record says (its pageIds list), falling
 * back to creation order for any page the list does not mention yet.
 *
 * Reordering writes the new order into `StorageNotebook.pageIds`; honoring it
 * here is what makes a manual reordering survive a reload.
 */
export function orderPagesForNotebook(
  pages: readonly StoragePage[],
  pageIds: readonly string[],
): StoragePage[] {
  const byId = new Map(pages.map((page) => [page.id, page] as const));
  const listed = pageIds
    .map((id) => byId.get(id))
    .filter((page): page is StoragePage => page != null);
  const mentioned = new Set(pageIds);
  const rest = sortPagesByCreation(pages.filter((page) => !mentioned.has(page.id)));
  return [...listed, ...rest];
}

/**
 * Rehydrate strokes from a persisted snapshot.
 *
 * The snapshot is opaque to the storage layer, so a record written by an older
 * build — or by a future one — must never crash the editor. Anything that does
 * not look like a stroke is dropped.
 */
export function strokesFromSnapshot(snapshot: unknown): Stroke[] {
  if (snapshot == null || typeof snapshot !== "object") return [];
  const candidate = (snapshot as { strokes?: unknown }).strokes;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (stroke): stroke is Stroke =>
      stroke != null &&
      typeof stroke === "object" &&
      Array.isArray((stroke as Stroke).points) &&
      (stroke as Stroke).points.length > 0,
  );
}

/**
 * Rehydrate the full page content (strokes + texts + images) from a persisted
 * snapshot.
 *
 * The snapshot is opaque to the storage layer, so a record written by an older
 * build — or by a future one — must never crash the editor. Anything that does
 * not look like the expected shape is dropped. Texts and images are optional:
 * records written before they existed rehydrate as empty arrays.
 */
export function contentFromSnapshot(snapshot: unknown): PageContent {
  if (snapshot == null || typeof snapshot !== "object") {
    return { strokes: [], texts: [], images: [], originalStrokes: [] };
  }
  const candidate = snapshot as {
    strokes?: unknown;
    texts?: unknown;
    images?: unknown;
    originalStrokes?: unknown;
  };

  const strokes = strokesFromSnapshot(snapshot);

  const texts: NoteText[] = Array.isArray(candidate.texts)
    ? candidate.texts.filter(
        (text): text is NoteText =>
          text != null &&
          typeof text === "object" &&
          typeof (text as NoteText).id === "string" &&
          typeof (text as NoteText).text === "string" &&
          typeof (text as NoteText).x === "number" &&
          typeof (text as NoteText).y === "number" &&
          typeof (text as NoteText).size === "number" &&
          (text as NoteText).size > 0,
      )
    : [];

  const images: NoteImage[] = Array.isArray(candidate.images)
    ? candidate.images.filter(
        (image): image is NoteImage =>
          image != null &&
          typeof image === "object" &&
          typeof (image as NoteImage).id === "string" &&
          typeof (image as NoteImage).src === "string" &&
          typeof (image as NoteImage).x === "number" &&
          typeof (image as NoteImage).y === "number" &&
          typeof (image as NoteImage).width === "number" &&
          typeof (image as NoteImage).height === "number",
      )
    : [];

  // Beautified pages keep the pristine strokes next to the enhanced copy.
  const originalStrokes = Array.isArray(candidate.originalStrokes)
    ? strokesFromSnapshot({ strokes: candidate.originalStrokes })
    : [];

  return { strokes, texts, images, originalStrokes };
}

/** A brand-new empty page record, revision 1. */
export function buildEmptyPage(params: {
  ownerId: string;
  notebookId: string;
  pageId: string;
  template: NotesTemplate;
  now: string;
  persistedSnapshot: unknown;
}): StoragePage {
  return {
    id: params.pageId,
    ownerId: params.ownerId,
    notebookId: params.notebookId,
    template: params.template,
    persistedSnapshot: params.persistedSnapshot,
    localJournal: [],
    quarantined: false,
    revision: 1,
    createdAt: params.now,
    updatedAt: params.now,
  };
}

/**
 * The record to write when saving an existing page.
 *
 * `createdAt` is preserved (it defines page order) and `revision` is strictly
 * greater than the stored one, which is what the storage revision guard
 * requires. Passing the stored record through keeps `localJournal` intact —
 * dropping it would silently discard the journal.
 */
export function buildPageSave(params: {
  ownerId: string;
  notebookId: string;
  pageId: string;
  template: NotesTemplate;
  strokes: readonly Stroke[];
  persistedSnapshot: unknown;
  existing: StoragePage | null;
  now: string;
}): StoragePage {
  const { existing } = params;
  return {
    id: params.pageId,
    ownerId: params.ownerId,
    notebookId: params.notebookId,
    template: params.template,
    persistedSnapshot: params.persistedSnapshot,
    localJournal: existing?.localJournal ?? [],
    quarantined: false,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? params.now,
    updatedAt: params.now,
  };
}

/** The record to write when saving notebook metadata. */
export function buildNotebookSave(params: {
  ownerId: string;
  notebookId: string;
  title: string;
  pageIds: string[];
  activePageId: string | null;
  existing: StorageNotebook | null;
  now: string;
  pageNames?: Record<string, string> | null;
}): StorageNotebook {
  const { existing } = params;
  // الأسماء الفاضية مش بتتخزن — والدفاتر القديمة من غير أسماء زي ما هي.
  const pageNames =
    params.pageNames && Object.keys(params.pageNames).length > 0
      ? params.pageNames
      : undefined;
  return {
    id: params.notebookId,
    ownerId: params.ownerId,
    title: params.title,
    pageIds: params.pageIds,
    ...(pageNames ? { pageNames } : {}),
    currentPageId: params.activePageId,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? params.now,
    updatedAt: params.now,
  };
}

/**
 * Resolve (or create) the notebook the editor should open.
 *
 * Creation order matters: the page record is written FIRST, then the notebook
 * that references it. The reverse order would leave a notebook pointing at a
 * pageId that does not exist whenever the second write fails.
 */
export async function ensureNotebook(
  repo: NoteRepository,
  options: EnsureNotebookOptions,
): Promise<NotebookBoot> {
  const {
    requestedNotebookId = null,
    newId,
    now,
    defaultTitle = DEFAULT_TITLE,
    defaultTemplate = DEFAULT_TEMPLATE,
  } = options;

  const notebooks = await repo.listNotebooks();
  const sorted = sortNotebooksByRecency(notebooks);

  const target = requestedNotebookId
    ? sorted.find((candidate) => candidate.id === requestedNotebookId) ?? null
    : sorted[0] ?? null;

  if (requestedNotebookId && !target) return { status: "missing" };

  if (target) {
    const pages = orderPagesForNotebook(
      await repo.listPages(target.id),
      target.pageIds,
    );

    if (pages.length === 0) {
      if (!repo.canWrite) return { status: "read-only-empty", reason: "no-pages" };

      const timestamp = now();
      const pageId = newId();
      const page = buildEmptyPage({
        ownerId: repo.ownerId,
        notebookId: target.id,
        pageId,
        template: defaultTemplate,
        now: timestamp,
        persistedSnapshot: pageContentStrokes(defaultTemplate, []),
      });
      await repo.savePage(page);
      await repo.saveNotebook(
        buildNotebookSave({
          ownerId: repo.ownerId,
          notebookId: target.id,
          title: target.title,
          pageIds: [pageId],
          activePageId: pageId,
          existing: target,
          now: timestamp,
        }),
      );

      return {
        status: "ready",
        notebook: { ...target, pageIds: [pageId], currentPageId: pageId },
        pages: [page],
        activePageId: pageId,
      };
    }

    const activePageId =
      pages.find((page) => page.id === target.currentPageId)?.id ?? pages[0].id;

    return { status: "ready", notebook: target, pages, activePageId };
  }

  if (!repo.canWrite) return { status: "read-only-empty", reason: "no-notebooks" };

  const timestamp = now();
  const notebookId = newId();
  const pageId = newId();

  const page = buildEmptyPage({
    ownerId: repo.ownerId,
    notebookId,
    pageId,
    template: defaultTemplate,
    now: timestamp,
    persistedSnapshot: pageContentStrokes(defaultTemplate, []),
  });
  await repo.savePage(page);

  const notebook = buildNotebookSave({
    ownerId: repo.ownerId,
    notebookId,
    title: defaultTitle,
    pageIds: [pageId],
    activePageId: pageId,
    existing: null,
    now: timestamp,
  });
  await repo.saveNotebook(notebook);

  return { status: "ready", notebook, pages: [page], activePageId: pageId };
}
