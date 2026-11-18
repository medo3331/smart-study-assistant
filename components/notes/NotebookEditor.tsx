"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { emptyPageContent, pageContentStrokes } from "@/lib/notes/content";
import { classifyNotesError } from "@/lib/notes/errors";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  TEMPLATE_OPTIONS,
  imageAt,
  paintPageBackground,
  paintSelectionOutline,
  paintShapeStroke,
  paintStroke,
  pointInRect,
  renderPageContent,
  shapeOutlinePoints,
  strokeAt,
  textAt,
  textBounds,
} from "@/lib/notes/canvas";
import { UndoStack } from "@/lib/notes/history";
import {
  buildEmptyPage,
  buildNotebookSave,
  buildPageSave,
  contentFromSnapshot,
  ensureNotebook,
} from "@/lib/notes/notebook";
import type { NoteRepository } from "@/lib/notes/repository";
import type {
  NoteImage,
  NoteText,
  NotesTemplate,
  PageContent,
  Stroke,
  StrokeShape,
} from "@/lib/notes/types";
import type { SaveStatus } from "@/hooks/useNoteRepository";
import { useTheme } from "@/theme/ThemeProvider";
import { NotesChip, NotesThemeToggle } from "@/components/notes/NotesHeader";
import NotesGuide from "@/components/notes/NotesGuide";
import PageThumbs from "@/components/notes/PageThumbs";

/**
 * The notebook editor.
 *
 * Coordinates: strokes, texts and images are stored in PAGE space (794×1123,
 * i.e. A4 at 96dpi), never in viewport pixels. Zoom and pan are a view
 * transform applied at paint time, so a page drawn at 100% and the same page
 * reopened at 250% persist identical geometry.
 *
 * Every mutation produces a new PageContent object, which is what makes undo
 * a matter of swapping references instead of diffing objects.
 *
 * The chrome uses the site's design tokens (see app/notes.css) so the editor
 * follows all eight site themes; the paper itself stays white — it is content,
 * not chrome, and dark ink on a dark sheet would be unreadable.
 */

type Tool =
  | Stroke["tool"]
  | "eraser"
  | "select"
  | "text"
  | StrokeShape;

/** What the user has selected with the select tool. */
type Selection =
  | { kind: "stroke"; id: string }
  | { kind: "text"; id: string }
  | { kind: "image"; id: string }
  | null;

/** In-progress text editing, positioned in page coordinates. */
type TextDraft = {
  /** null → creating a new text block. */
  id: string | null;
  x: number;
  y: number;
  value: string;
};

type UiPage = {
  id: string;
  template: NotesTemplate;
  content: PageContent;
  revision: number;
};

const PALETTE = ["#111827", "#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed"];
const AUTOSAVE_DELAY_MS = 600;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;
const ERASER_TOLERANCE = 6;
/** Images larger than this (page px) get scaled down on insert. */
const MAX_IMAGE_DIMENSION = 1400;

const TOOL_OPTIONS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: "select", label: "تحديد", icon: "⬚", key: "v" },
  { id: "pen", label: "قلم", icon: "🖊️", key: "1" },
  { id: "ink", label: "حبر", icon: "🖋️", key: "2" },
  { id: "pencil", label: "رصاص", icon: "✏️", key: "3" },
  { id: "highlighter", label: "تظليل", icon: "🖍️", key: "4" },
  { id: "eraser", label: "ممحاة", icon: "🧽", key: "5" },
];

const SHAPE_OPTIONS: { id: StrokeShape; label: string; icon: string }[] = [
  { id: "line", label: "خط", icon: "／" },
  { id: "arrow", label: "سهم", icon: "↗" },
  { id: "rect", label: "مستطيل", icon: "▭" },
  { id: "ellipse", label: "دايرة", icon: "◯" },
];

const FONT_OPTIONS: { id: string; label: string }[] = [
  { id: "system-ui, 'Segoe UI', Tahoma, sans-serif", label: "افتراضي" },
  { id: "'Segoe UI', Tahoma, sans-serif", label: "Segoe UI" },
  { id: "Tahoma, 'Noto Naskh Arabic', serif", label: "نسخ" },
  { id: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { id: "'Courier New', monospace", label: "Monospace" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Bounding box of a stroke (its outline geometry). */
function strokeBounds(stroke: Stroke): { x: number; y: number; width: number; height: number } {
  const points = shapeOutlinePoints(stroke);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const isShapeTool = (candidate: Tool): candidate is StrokeShape =>
  candidate === "line" || candidate === "arrow" || candidate === "rect" || candidate === "ellipse";

export default function NotebookEditor({
  repo,
  notebookId: requestedNotebookId,
  canWrite,
}: {
  repo: NoteRepository;
  /** When provided, opens that notebook instead of the most recent one. */
  notebookId?: string | null;
  canWrite: boolean;
}) {
  const { theme } = useTheme();

  // ---- Document state ----
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [notebookTitle, setNotebookTitle] = useState("دفتر");
  const [pages, setPages] = useState<UiPage[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // ---- Tool state ----
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(PALETTE[0]);
  const [thickness, setThickness] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [textSize, setTextSize] = useState(28);
  const [textFont, setTextFont] = useState(FONT_OPTIONS[0].id);

  // ---- Selection / interaction state ----
  const [selection, setSelection] = useState<Selection>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  /** Mirrors templateRef for rendering; the ref stays the paint-side truth. */
  const [template, setTemplateState] = useState<NotesTemplate>("lined");

  // ---- View state ----
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });

  // ---- PDF export state ----
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfSelected, setPdfSelected] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);

  // ---- In-notebook text search state ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // ---- Refs: the drawing hot path must not depend on render closures ----
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dprRef = useRef(1);
  const contentRef = useRef<PageContent>(emptyPageContent());
  const templateRef = useRef<NotesTemplate>("lined");
  const currentStrokeRef = useRef<Stroke | null>(null);
  const shapeStartRef = useRef<[number, number] | null>(null);
  const isDrawingRef = useRef(false);
  const erasingRef = useRef(false);
  const erasedRef = useRef(false);
  const spaceRef = useRef(false);
  const backdropRef = useRef("#eef1f5");
  const selectionRef = useRef<Selection>(null);
  /** Active select-tool drag: moving an existing element. */
  const dragRef = useRef<{
    kind: "stroke" | "text" | "image";
    id: string;
    start: [number, number];
    original: Stroke | NoteText | NoteImage;
  } | null>(null);
  /** Active image resize from the bottom-right handle. */
  const resizeRef = useRef<{ id: string; original: NoteImage } | null>(null);
  /** Decoded image cache: data URL → ready-to-draw element. */
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const notebookIdRef = useRef<string | null>(null);
  const currentPageIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<UndoStack<PageContent>>(new UndoStack<PageContent>(emptyPageContent()));
  const fittedRef = useRef(false);
  const textDraftRef = useRef<TextDraft | null>(null);
  /** True once a select-drag or resize actually changed something. */
  const movedRef = useRef(false);

  useEffect(() => {
    notebookIdRef.current = notebookId;
  }, [notebookId]);

  useEffect(() => {
    currentPageIdRef.current = currentPageId;
  }, [currentPageId]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // ---- Painting ----

  const lookupImage = useCallback((src: string): CanvasImageSource | null => {
    const image = imageCacheRef.current.get(src);
    return image && image.complete && image.naturalWidth > 0 ? image : null;
  }, []);

  const selectionRect = useCallback((): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null => {
    const current = selectionRef.current;
    if (!current) return null;
    const content = contentRef.current;
    if (current.kind === "image") {
      return content.images.find((image) => image.id === current.id) ?? null;
    }
    if (current.kind === "text") {
      const text = content.texts.find((candidate) => candidate.id === current.id);
      if (!text) return null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) return textBounds(ctx, text);
      // Fallback without a measuring context: rough per-character estimate.
      const widestLine = Math.max(...text.text.split("\n").map((line) => line.length), 1);
      return {
        x: text.x,
        y: text.y,
        width: text.size * widestLine * 0.55,
        height: text.size * 1.5 * text.text.split("\n").length,
      };
    }
    const stroke = content.strokes.find((candidate) => candidate.id === current.id);
    return stroke ? strokeBounds(stroke) : null;
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = dprRef.current;
    const viewWidth = canvas.width / dpr;
    const viewHeight = canvas.height / dpr;
    const viewZoom = zoomRef.current;
    const pan = panRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    ctx.fillStyle = backdropRef.current;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    ctx.setTransform(dpr * viewZoom, 0, 0, dpr * viewZoom, dpr * pan.x, dpr * pan.y);

    // Paper drop shadow, so the sheet reads as a page on a desk.
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.28)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    ctx.clip();
    paintPageBackground(ctx, templateRef.current, PAGE_WIDTH, PAGE_HEIGHT);
    const content = contentRef.current;
    for (const image of content.images) {
      const decoded = lookupImage(image.src);
      if (decoded) {
        ctx.drawImage(decoded, image.x, image.y, image.width, image.height);
      }
    }
    for (const stroke of content.strokes) {
      if (stroke.shape) paintShapeStroke(ctx, stroke);
      else paintStroke(ctx, stroke);
    }
    for (const text of content.texts) {
      ctx.save();
      ctx.fillStyle = text.color;
      ctx.font = `${text.size}px ${text.font || "system-ui, 'Segoe UI', Tahoma, sans-serif"}`;
      ctx.textBaseline = "top";
      if ("direction" in ctx) {
        (ctx as CanvasRenderingContext2D & { direction: CanvasDirection }).direction = "rtl";
      }
      ctx.textAlign = "right";
      const lineHeight = text.size * 1.5;
      text.text.split("\n").forEach((line, index) => {
        ctx.fillText(line, text.x + 4, text.y + index * lineHeight + 4);
      });
      ctx.restore();
    }

    // Live shape preview while dragging.
    const preview = currentStrokeRef.current;
    if (preview && preview.shape) paintShapeStroke(ctx, preview);

    const rect = selectionRect();
    if (rect && !textDraftRef.current) paintSelectionOutline(ctx, rect);
    ctx.restore();
  }, [lookupImage, selectionRect]);

  // Re-read the theme's surface colour whenever the theme changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = getComputedStyle(canvas).getPropertyValue("--paper-3").trim();
    if (value) backdropRef.current = value;
    paint();
  }, [theme, paint]);

  // Paint once after mount, and keep text-draft changes from hiding the
  // selection outline while editing.
  useEffect(() => {
    textDraftRef.current = textDraft;
    paint();
  }, [textDraft, paint]);

  const syncHistory = useCallback(() => {
    setHistoryState({
      canUndo: historyRef.current.canUndo,
      canRedo: historyRef.current.canRedo,
    });
  }, []);

  const applyView = useCallback(
    (nextZoom: number, nextPan: { x: number; y: number }) => {
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setView({ zoom: nextZoom, panX: nextPan.x, panY: nextPan.y });
      paint();
    },
    [paint],
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    if (!fittedRef.current && rect.width > 0) {
      fittedRef.current = true;
      const fit = clamp((rect.width - 64) / PAGE_WIDTH, MIN_ZOOM, MAX_ZOOM);
      zoomRef.current = fit;
      panRef.current = { x: (rect.width - PAGE_WIDTH * fit) / 2, y: 24 };
      setView({ zoom: fit, panX: panRef.current.x, panY: 24 });
    }
    paint();
  }, [paint]);

  useEffect(() => {
    resizeCanvas();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(container);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  // ---- Image cache ----

  /** Decode data URLs into the cache; resolves once every image is drawable. */
  const ensureImagesLoaded = useCallback(
    (sources: readonly string[]): Promise<void> =>
      Promise.all(
        sources.map(
          (src) =>
            new Promise<void>((resolve) => {
              if (!src || imageCacheRef.current.has(src)) {
                resolve();
                return;
              }
              const image = new Image();
              image.onload = () => {
                imageCacheRef.current.set(src, image);
                resolve();
              };
              image.onerror = () => resolve();
              image.src = src;
            }),
        ),
      ).then(() => undefined),
    [],
  );

  // ---- Persistence ----

  const saveCurrentPage = useCallback(async () => {
    const pageId = currentPageIdRef.current;
    const nbId = notebookIdRef.current;
    if (!pageId || !nbId) return;
    if (!repo.canWrite) {
      setSaveStatus("error");
      return;
    }

    try {
      setSaveStatus("saving");
      const existing = await repo.getPage(pageId);
      const template = templateRef.current;
      const content = contentRef.current;
      const record = buildPageSave({
        ownerId: repo.ownerId,
        notebookId: nbId,
        pageId,
        template,
        strokes: content.strokes,
        persistedSnapshot: pageContentStrokes(
          template,
          content.strokes,
          content.texts,
          content.images,
        ),
        existing,
        now: nowIso(),
      });
      await repo.savePage(record);

      const savedContent = contentRef.current;
      setPages((previous) =>
        previous.map((page) =>
          page.id === pageId
            ? { ...page, template, content: savedContent, revision: record.revision }
            : page,
        ),
      );
      setSaveStatus("saved");
      setMessage(null);
    } catch (error) {
      console.error("[notes] save failed", classifyNotesError(error), error);
      setSaveStatus("error");
      setMessage(`فشل الحفظ (${classifyNotesError(error)}).`);
    }
  }, [repo, setSaveStatus]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveCurrentPage();
    }, AUTOSAVE_DELAY_MS);
  }, [saveCurrentPage]);

  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void saveCurrentPage();
      }
    };
    // A tab that is hidden or closed must not lose the last stroke.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [saveCurrentPage]);

  const saveNotebookRecord = useCallback(
    async (nbId: string, pageIds: string[], activeId: string | null, title: string) => {
      const existing = await repo.getNotebook(nbId);
      const record = buildNotebookSave({
        ownerId: repo.ownerId,
        notebookId: nbId,
        title,
        pageIds,
        activePageId: activeId,
        existing,
        now: nowIso(),
      });
      await repo.saveNotebook(record);
      return record;
    },
    [repo],
  );

  // ---- History ----

  const commitHistory = useCallback(() => {
    historyRef.current.push(contentRef.current);
    syncHistory();
  }, [syncHistory]);

  const applyHistory = useCallback(
    (next: PageContent | null) => {
      if (!next) return;
      contentRef.current = next;
      setSelection(null);
      selectionRef.current = null;
      paint();
      syncHistory();
      scheduleSave();
    },
    [paint, scheduleSave, syncHistory],
  );

  const undo = useCallback(() => {
    applyHistory(historyRef.current.undo());
  }, [applyHistory]);

  const redo = useCallback(() => {
    applyHistory(historyRef.current.redo());
  }, [applyHistory]);

  // ---- Page bootstrap ----

  const activatePage = useCallback(
    (page: UiPage | null, allPages: UiPage[], nbId: string, title: string) => {
      setNotebookId(nbId);
      setNotebookTitle(title);
      setPages(allPages);
      setCurrentPageId(page?.id ?? null);
      notebookIdRef.current = nbId;
      currentPageIdRef.current = page?.id ?? null;
      templateRef.current = page?.template ?? "lined";
      setTemplateState(templateRef.current);
      contentRef.current = page
        ? {
            strokes: [...page.content.strokes],
            texts: [...page.content.texts],
            images: [...page.content.images],
          }
        : emptyPageContent();
      historyRef.current.reset(contentRef.current);
      setSelection(null);
      selectionRef.current = null;
      syncHistory();
      // Decode any embedded images before the first paint of the page.
      void ensureImagesLoaded(contentRef.current.images.map((image) => image.src)).then(() => {
        paint();
      });
      requestAnimationFrame(() => paint());
    },
    [ensureImagesLoaded, paint, syncHistory],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const boot = await ensureNotebook(repo, {
          requestedNotebookId,
          newId,
          now: nowIso,
        });

        if (cancelled) return;

        if (boot.status === "missing") {
          setLoaded(true);
          setMessage("الدفتر المطلوب مش موجود — يمكن اتحذف. ارجع لدفاتري.");
          return;
        }

        if (boot.status === "read-only-empty") {
          setLoaded(true);
          setMessage(
            boot.reason === "no-pages"
              ? "مفيش صفحات محفوظة، والتبويب ده للقراءة فقط."
              : "مفيش دفاتر محفوظة، والتبويب ده للقراءة فقط.",
          );
          return;
        }

        const uiPages: UiPage[] = boot.pages.map((record) => ({
          id: record.id,
          template: record.template,
          content: contentFromSnapshot(record.persistedSnapshot),
          revision: record.revision,
        }));

        // Warm the image cache so the first paint shows every embedded image.
        await ensureImagesLoaded(
          uiPages.flatMap((page) => page.content.images.map((image) => image.src)),
        );

        if (cancelled) return;

        const active =
          uiPages.find((page) => page.id === boot.activePageId) ?? uiPages[0] ?? null;
        activatePage(active, uiPages, boot.notebook.id, boot.notebook.title);
        setLoaded(true);
      } catch (error) {
        if (cancelled) return;
        console.error("[notes] bootstrap failed", classifyNotesError(error), error);
        setMessage(`تعذّر تحميل الدفتر (${classifyNotesError(error)}).`);
        setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repo, requestedNotebookId, activatePage, ensureImagesLoaded]);

  // ---- Page navigation ----

  const selectPage = useCallback(
    async (pageId: string) => {
      if (pageId === currentPageIdRef.current) return;
      const nbId = notebookIdRef.current;
      const page = pages.find((candidate) => candidate.id === pageId);
      if (!nbId || !page) return;

      await saveCurrentPage();

      setCurrentPageId(pageId);
      currentPageIdRef.current = pageId;
      templateRef.current = page.template;
      setTemplateState(page.template);
      contentRef.current = {
        strokes: [...page.content.strokes],
        texts: [...page.content.texts],
        images: [...page.content.images],
      };
      historyRef.current.reset(contentRef.current);
      setSelection(null);
      selectionRef.current = null;
      syncHistory();
      void ensureImagesLoaded(page.content.images.map((image) => image.src)).then(() => paint());
      paint();

      if (repo.canWrite) {
        try {
          await saveNotebookRecord(
            nbId,
            pages.map((candidate) => candidate.id),
            pageId,
            notebookTitle,
          );
        } catch (error) {
          console.error("[notes] failed to save active page", classifyNotesError(error));
        }
      }
    },
    [
      ensureImagesLoaded,
      notebookTitle,
      paint,
      pages,
      repo,
      saveCurrentPage,
      saveNotebookRecord,
      syncHistory,
    ],
  );

  const addPage = useCallback(async () => {
    const nbId = notebookIdRef.current;
    if (!nbId || !repo.canWrite) return;

    try {
      setSaveStatus("saving");
      await saveCurrentPage();

      const timestamp = nowIso();
      const pageId = newId();
      const record = buildEmptyPage({
        ownerId: repo.ownerId,
        notebookId: nbId,
        pageId,
        template: templateRef.current,
        now: timestamp,
        persistedSnapshot: pageContentStrokes(templateRef.current, []),
      });
      await repo.savePage(record);

      const nextPages = [
        ...pages,
        {
          id: pageId,
          template: templateRef.current,
          content: emptyPageContent(),
          revision: record.revision,
        },
      ];
      await saveNotebookRecord(
        nbId,
        nextPages.map((page) => page.id),
        pageId,
        notebookTitle,
      );

      setPages(nextPages);
      setCurrentPageId(pageId);
      currentPageIdRef.current = pageId;
      contentRef.current = emptyPageContent();
      historyRef.current.reset(contentRef.current);
      setSelection(null);
      selectionRef.current = null;
      syncHistory();
      paint();
      setSaveStatus("saved");
    } catch (error) {
      console.error("[notes] add page failed", classifyNotesError(error), error);
      setSaveStatus("error");
    }
  }, [
    notebookTitle,
    paint,
    pages,
    repo,
    saveCurrentPage,
    saveNotebookRecord,
    setSaveStatus,
    syncHistory,
  ]);

  const deletePage = useCallback(async () => {
    const pageId = currentPageIdRef.current;
    const nbId = notebookIdRef.current;
    if (!pageId || !nbId || !repo.canWrite || pages.length <= 1) return;

    try {
      setSaveStatus("saving");
      await repo.deletePage(pageId);

      const remaining = pages.filter((page) => page.id !== pageId);
      const next = remaining[0] ?? null;
      await saveNotebookRecord(
        nbId,
        remaining.map((page) => page.id),
        next?.id ?? null,
        notebookTitle,
      );

      setPages(remaining);
      setCurrentPageId(next?.id ?? null);
      currentPageIdRef.current = next?.id ?? null;
      templateRef.current = next?.template ?? "lined";
      setTemplateState(templateRef.current);
      contentRef.current = next
        ? {
            strokes: [...next.content.strokes],
            texts: [...next.content.texts],
            images: [...next.content.images],
          }
        : emptyPageContent();
      historyRef.current.reset(contentRef.current);
      setSelection(null);
      selectionRef.current = null;
      syncHistory();
      paint();
      setSaveStatus("saved");
    } catch (error) {
      console.error("[notes] delete page failed", classifyNotesError(error), error);
      setSaveStatus("error");
    }
  }, [notebookTitle, paint, pages, repo, saveNotebookRecord, setSaveStatus, syncHistory]);

  /** Copy the current page's content into a fresh page right after it. */
  const duplicatePage = useCallback(async () => {
    const nbId = notebookIdRef.current;
    const sourceId = currentPageIdRef.current;
    if (!nbId || !sourceId || !repo.canWrite) return;
    const index = pages.findIndex((page) => page.id === sourceId);
    if (index < 0) return;

    try {
      setSaveStatus("saving");
      await saveCurrentPage();

      const timestamp = nowIso();
      const pageId = newId();
      const source = pages[index];
      const record = buildEmptyPage({
        ownerId: repo.ownerId,
        notebookId: nbId,
        pageId,
        template: source.template,
        now: timestamp,
        persistedSnapshot: pageContentStrokes(
          source.template,
          source.content.strokes,
          source.content.texts,
          source.content.images,
        ),
      });
      await repo.savePage(record);

      const nextPages = [
        ...pages.slice(0, index + 1),
        { id: pageId, template: source.template, content: source.content, revision: record.revision },
        ...pages.slice(index + 1),
      ];
      await saveNotebookRecord(
        nbId,
        nextPages.map((page) => page.id),
        pageId,
        notebookTitle,
      );

      setPages(nextPages);
      setCurrentPageId(pageId);
      currentPageIdRef.current = pageId;
      templateRef.current = source.template;
      setTemplateState(source.template);
      contentRef.current = {
        strokes: [...source.content.strokes],
        texts: [...source.content.texts],
        images: [...source.content.images],
      };
      historyRef.current.reset(contentRef.current);
      setSelection(null);
      selectionRef.current = null;
      syncHistory();
      paint();
      setSaveStatus("saved");
    } catch (error) {
      console.error("[notes] duplicate page failed", classifyNotesError(error), error);
      setSaveStatus("error");
    }
  }, [
    notebookTitle,
    paint,
    pages,
    repo,
    saveCurrentPage,
    saveNotebookRecord,
    setSaveStatus,
    syncHistory,
  ]);

  /** Swap a page with its neighbour, persisting the new order. */
  const movePage = useCallback(
    async (pageId: string, delta: -1 | 1) => {
      const nbId = notebookIdRef.current;
      if (!nbId || !repo.canWrite) return;
      const index = pages.findIndex((page) => page.id === pageId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= pages.length) return;

      const nextPages = [...pages];
      const [moved] = nextPages.splice(index, 1);
      nextPages.splice(target, 0, moved);
      setPages(nextPages);

      try {
        await saveNotebookRecord(
          nbId,
          nextPages.map((page) => page.id),
          currentPageIdRef.current,
          notebookTitle,
        );
        setSaveStatus("saved");
      } catch (error) {
        console.error("[notes] reorder failed", classifyNotesError(error), error);
        setSaveStatus("error");
        // The next notebook write will reconcile the stored order.
      }
    },
    [notebookTitle, pages, repo, saveNotebookRecord, setSaveStatus],
  );

  const changeTemplate = useCallback(
    (template: NotesTemplate) => {
      templateRef.current = template;
      setTemplateState(template);
      paint();
      void saveCurrentPage();
    },
    [paint, saveCurrentPage],
  );

  // ---- Mutations on content ----

  const setContent = useCallback(
    (next: PageContent) => {
      contentRef.current = next;
      paint();
      scheduleSave();
    },
    [paint, scheduleSave],
  );

  const clearPage = useCallback(() => {
    if (!canWrite) return;
    setContent({ strokes: [], texts: [], images: [] });
    setSelection(null);
    selectionRef.current = null;
    commitHistory();
  }, [canWrite, commitHistory, setContent]);

  const deleteSelection = useCallback(() => {
    const current = selectionRef.current;
    if (!current || !canWrite) return;
    const content = contentRef.current;
    if (current.kind === "stroke") {
      setContent({
        ...content,
        strokes: content.strokes.filter((stroke) => stroke.id !== current.id),
      });
    } else if (current.kind === "text") {
      setContent({
        ...content,
        texts: content.texts.filter((text) => text.id !== current.id),
      });
    } else {
      setContent({
        ...content,
        images: content.images.filter((image) => image.id !== current.id),
      });
    }
    setSelection(null);
    selectionRef.current = null;
    commitHistory();
  }, [canWrite, commitHistory, setContent]);

  const selectElement = useCallback(
    (next: Selection) => {
      selectionRef.current = next;
      setSelection(next);
      paint();
    },
    [paint],
  );

  // ---- Images ----

  /**
   * Downscale an image file to a bounded data URL so IndexedDB records stay
   * small, then insert it centered on the current viewport.
   */
  const insertImageFile = useCallback(
    async (file: File) => {
      if (!canWrite || !file.type.startsWith("image/")) return;
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = reject;
          element.src = dataUrl;
        });

        // Downscale when the source is huge; keep it 1:1 otherwise.
        const largest = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = largest > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largest : 1;
        let finalUrl = dataUrl;
        if (scale < 1) {
          const offscreen = document.createElement("canvas");
          offscreen.width = Math.round(image.naturalWidth * scale);
          offscreen.height = Math.round(image.naturalHeight * scale);
          const ctx = offscreen.getContext("2d");
          if (ctx) {
            ctx.drawImage(image, 0, 0, offscreen.width, offscreen.height);
            finalUrl = offscreen.toDataURL(
              file.type === "image/png" ? "image/png" : "image/jpeg",
              0.85,
            );
          }
        }

        const canvas = canvasRef.current;
        const viewWidth = canvas ? canvas.width / dprRef.current : PAGE_WIDTH;
        const viewHeight = canvas ? canvas.height / dprRef.current : PAGE_HEIGHT;
        const pan = panRef.current;
        const zoomLevel = zoomRef.current;
        const centerX = (viewWidth / 2 - pan.x) / zoomLevel;
        const centerY = (viewHeight / 2 - pan.y) / zoomLevel;

        const width = Math.min(image.naturalWidth * scale, 400);
        const height = width * (image.naturalHeight / image.naturalWidth);
        const element: NoteImage = {
          id: newId(),
          kind: "image",
          src: finalUrl,
          x: clamp(centerX - width / 2, 8, PAGE_WIDTH - width - 8),
          y: clamp(centerY - height / 2, 8, PAGE_HEIGHT - height - 8),
          width,
          height,
        };

        imageCacheRef.current.set(finalUrl, image);
        const content = contentRef.current;
        setContent({ ...content, images: [...content.images, element] });
        selectElement({ kind: "image", id: element.id });
        commitHistory();
      } catch (error) {
        console.error("[notes] image insert failed", error);
        setMessage("تعذّر إدراج الصورة.");
      }
    },
    [canWrite, commitHistory, selectElement, setContent],
  );

  // Paste an image straight from the clipboard.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length === 0) return;
      event.preventDefault();
      void insertImageFile(files[0]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [insertImageFile]);

  // ---- Text editing ----

  const openTextEditor = useCallback(
    (draft: TextDraft) => {
      setTextDraft(draft);
      selectElement(null);
    },
    [selectElement],
  );

  const commitTextDraft = useCallback(() => {
    const draft = textDraftRef.current;
    if (!draft) return;
    setTextDraft(null);
    textDraftRef.current = null;
    const value = draft.value.trimEnd();
    if (!value) return;

    const content = contentRef.current;
    if (draft.id) {
      const existing = content.texts.find((text) => text.id === draft.id);
      if (existing) {
        setContent({
          ...content,
          texts: content.texts.map((text) =>
            text.id === draft.id ? { ...text, text: value, size: textSize, color, font: textFont } : text,
          ),
        });
        selectElement({ kind: "text", id: draft.id });
        commitHistory();
        return;
      }
    }

    const element: NoteText = {
      id: newId(),
      kind: "text",
      text: value,
      x: draft.x,
      y: draft.y,
      size: textSize,
      color,
      font: textFont,
    };
    setContent({ ...content, texts: [...content.texts, element] });
    selectElement({ kind: "text", id: element.id });
    commitHistory();
  }, [color, commitHistory, selectElement, setContent, textFont, textSize]);

  const cancelTextDraft = useCallback(() => {
    setTextDraft(null);
    textDraftRef.current = null;
  }, []);

  // ---- Pointer handling ----

  const toPagePoint = useCallback((clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const pan = panRef.current;
    const viewZoom = zoomRef.current;
    return [
      (clientX - rect.left - pan.x) / viewZoom,
      (clientY - rect.top - pan.y) / viewZoom,
    ];
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Pan: space held, or middle button. Always available, even read-only.
      if (spaceRef.current || event.button === 1) {
        event.preventDefault();
        panDragRef.current = {
          x: event.clientX,
          y: event.clientY,
          originX: panRef.current.x,
          originY: panRef.current.y,
        };
        canvas.style.cursor = "grabbing";
        return;
      }

      if (!canWrite) return;
      event.preventDefault();
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      const [x, y] = toPagePoint(event.clientX, event.clientY);
      const content = contentRef.current;

      if (tool === "select") {
        // Image resize handle first (bottom-right of the selected image).
        const current = selectionRef.current;
        if (current?.kind === "image") {
          const image = content.images.find((candidate) => candidate.id === current.id);
          if (image && pointInRect(x, y, {
            x: image.x + image.width - 10,
            y: image.y + image.height - 10,
            width: 20,
            height: 20,
          })) {
            resizeRef.current = { id: image.id, original: { ...image } };
            return;
          }
        }

        const imageIndex = imageAt(content.images, x, y, 4);
        if (imageIndex >= 0) {
          const image = content.images[imageIndex];
          selectElement({ kind: "image", id: image.id });
          dragRef.current = { kind: "image", id: image.id, start: [x, y], original: { ...image } };
          return;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const textIndex = textAt(content.texts, x, y, ctx, 6);
          if (textIndex >= 0) {
            const text = content.texts[textIndex];
            selectElement({ kind: "text", id: text.id });
            dragRef.current = { kind: "text", id: text.id, start: [x, y], original: { ...text } };
            return;
          }
        }

        const strokeIndex = strokeAt(content.strokes, x, y, ERASER_TOLERANCE);
        if (strokeIndex >= 0) {
          const stroke = content.strokes[strokeIndex];
          selectElement({ kind: "stroke", id: stroke.id });
          dragRef.current = { kind: "stroke", id: stroke.id, start: [x, y], original: { ...stroke } };
          return;
        }

        selectElement(null);
        return;
      }

      if (tool === "text") {
        openTextEditor({ id: null, x, y, value: "" });
        return;
      }

      if (tool === "eraser") {
        erasingRef.current = true;
        erasedRef.current = false;
        const index = strokeAt(content.strokes, x, y, ERASER_TOLERANCE);
        if (index >= 0) {
          const next = content.strokes.slice();
          next.splice(index, 1);
          setContent({ ...content, strokes: next });
          erasedRef.current = true;
        }
        return;
      }

      if (isShapeTool(tool)) {
        shapeStartRef.current = [x, y];
        isDrawingRef.current = true;
        currentStrokeRef.current = {
          id: newId(),
          tool: "pen",
          shape: tool,
          color,
          thickness,
          opacity,
          points: [
            [x, y],
            [x, y],
          ],
        };
        paint();
        return;
      }

      // Freehand drawing.
      const stroke: Stroke = {
        id: newId(),
        tool,
        color,
        thickness,
        opacity,
        points: [[x, y]],
      };
      isDrawingRef.current = true;
      currentStrokeRef.current = stroke;
      contentRef.current = { ...content, strokes: [...content.strokes, stroke] };

      const ctx = canvas.getContext("2d");
      if (ctx) paintStroke(ctx, stroke);
    },
    [
      canWrite,
      color,
      openTextEditor,
      opacity,
      paint,
      selectElement,
      setContent,
      thickness,
      toPagePoint,
      tool,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const panDrag = panDragRef.current;
      if (panDrag) {
        applyView(zoomRef.current, {
          x: panDrag.originX + (event.clientX - panDrag.x),
          y: panDrag.originY + (event.clientY - panDrag.y),
        });
        return;
      }

      if (resizeRef.current) {
        const [x, y] = toPagePoint(event.clientX, event.clientY);
        const { id, original } = resizeRef.current;
        const content = contentRef.current;
        const width = Math.max(40, x - original.x);
        const height = Math.max(40, y - original.y);
        if (width !== original.width || height !== original.height) movedRef.current = true;
        contentRef.current = {
          ...content,
          images: content.images.map((image) =>
            image.id === id ? { ...image, width, height } : image,
          ),
        };
        paint();
        return;
      }

      const drag = dragRef.current;
      if (drag) {
        const [x, y] = toPagePoint(event.clientX, event.clientY);
        const dx = x - drag.start[0];
        const dy = y - drag.start[1];
        if (dx !== 0 || dy !== 0) movedRef.current = true;
        const content = contentRef.current;

        if (drag.kind === "image") {
          const original = drag.original as NoteImage;
          contentRef.current = {
            ...content,
            images: content.images.map((image) =>
              image.id === drag.id
                ? { ...image, x: original.x + dx, y: original.y + dy }
                : image,
            ),
          };
        } else if (drag.kind === "text") {
          const original = drag.original as NoteText;
          contentRef.current = {
            ...content,
            texts: content.texts.map((text) =>
              text.id === drag.id ? { ...text, x: original.x + dx, y: original.y + dy } : text,
            ),
          };
        } else {
          const original = drag.original as Stroke;
          contentRef.current = {
            ...content,
            strokes: content.strokes.map((stroke) =>
              stroke.id === drag.id
                ? {
                    ...stroke,
                    points: original.points.map((point) => [point[0] + dx, point[1] + dy]),
                  }
                : stroke,
            ),
          };
        }
        paint();
        return;
      }

      if (erasingRef.current) {
        const [x, y] = toPagePoint(event.clientX, event.clientY);
        const index = strokeAt(contentRef.current.strokes, x, y, ERASER_TOLERANCE);
        if (index >= 0) {
          const next = contentRef.current.strokes.slice();
          next.splice(index, 1);
          contentRef.current = { ...contentRef.current, strokes: next };
          erasedRef.current = true;
          paint();
        }
        return;
      }

      if (!isDrawingRef.current) return;
      const stroke = currentStrokeRef.current;
      const canvas = canvasRef.current;
      if (!stroke || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      event.preventDefault();
      const native = event.nativeEvent;
      const events: PointerEvent[] =
        typeof native.getCoalescedEvents === "function"
          ? (native.getCoalescedEvents() as PointerEvent[])
          : [native];

      if (stroke.shape && shapeStartRef.current) {
        const [sx, sy] = shapeStartRef.current;
        let [x, y] = toPagePoint(event.clientX, event.clientY);
        if (event.shiftKey) {
          // Constrain to a square/circle and to 45° lines.
          const dx = x - sx;
          const dy = y - sy;
          if (stroke.shape === "rect" || stroke.shape === "ellipse") {
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            x = sx + Math.sign(dx || 1) * size;
            y = sy + Math.sign(dy || 1) * size;
          } else {
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
            const length = Math.hypot(dx, dy);
            x = sx + length * Math.cos(angle);
            y = sy + length * Math.sin(angle);
          }
        }
        currentStrokeRef.current = { ...stroke, points: [[sx, sy], [x, y]] };
        paint();
        return;
      }

      for (const pointerEvent of events) {
        const [x, y] = toPagePoint(pointerEvent.clientX, pointerEvent.clientY);
        stroke.points.push([x, y]);
        // Draw just the new segment; the full quadratic pass happens on commit.
        paintStroke(ctx, { ...stroke, points: stroke.points.slice(-2) });
      }
    },
    [applyView, paint, toPagePoint],
  );

  const endPointerInteraction = useCallback(() => {
    if (panDragRef.current) {
      panDragRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = spaceRef.current ? "grab" : "default";
      return;
    }

    if (resizeRef.current) {
      resizeRef.current = null;
      if (movedRef.current) {
        movedRef.current = false;
        commitHistory();
        scheduleSave();
      }
      return;
    }

    if (dragRef.current) {
      dragRef.current = null;
      if (movedRef.current) {
        movedRef.current = false;
        commitHistory();
        scheduleSave();
      }
      return;
    }

    if (erasingRef.current) {
      erasingRef.current = false;
      if (erasedRef.current) {
        erasedRef.current = false;
        commitHistory();
        scheduleSave();
      }
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    shapeStartRef.current = null;

    if (stroke?.shape) {
      const [start, end] = stroke.points;
      // A shape drag that never moved is a mis-click, not a dot.
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 3) {
        paint();
        return;
      }
      const content = contentRef.current;
      contentRef.current = { ...content, strokes: [...content.strokes, stroke] };
      selectElement({ kind: "stroke", id: stroke.id });
    }

    paint();
    commitHistory();
    scheduleSave();
  }, [commitHistory, paint, scheduleSave, selectElement]);

  // Double-click with the select tool re-opens the text editor.
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (tool !== "select" || !canWrite) return;
      const [x, y] = toPagePoint(event.clientX, event.clientY);
      const text = contentRef.current.texts.find((candidate) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx) return false;
        return pointInRect(x, y, textBounds(ctx, candidate), 8);
      });
      if (text) {
        openTextEditor({ id: text.id, x: text.x, y: text.y, value: text.text });
      }
    },
    [canWrite, openTextEditor, toPagePoint, tool],
  );

  // ---- Zoom ----

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = clientX == null ? rect.width / 2 : clientX - rect.left;
      const cy = clientY == null ? rect.height / 2 : clientY - rect.top;

      const next = clamp(zoomRef.current * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = next / zoomRef.current;
      const pan = panRef.current;
      applyView(next, {
        x: cx - (cx - pan.x) * ratio,
        y: cy - (cy - pan.y) * ratio,
      });
    },
    [applyView],
  );

  const fitToWidth = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const fit = clamp((rect.width - 64) / PAGE_WIDTH, MIN_ZOOM, MAX_ZOOM);
    applyView(fit, { x: (rect.width - PAGE_WIDTH * fit) / 2, y: 24 });
  }, [applyView]);

  const handleWheelRef = useRef<(event: WheelEvent) => void>(() => undefined);

  // React attaches wheel listeners as passive at the root, so `preventDefault`
  // there is a no-op and the page scrolls instead of the canvas zooming. The
  // listener is therefore attached natively with `{ passive: false }`.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const onWheel = (event: WheelEvent) => {
      handleWheelRef.current(event);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    handleWheelRef.current = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
        return;
      }
      // Trackpad two-finger scroll pans the sheet.
      applyView(zoomRef.current, {
        x: panRef.current.x - event.deltaX,
        y: panRef.current.y - event.deltaY,
      });
    };
  }, [applyView, zoomAt]);

  // ---- Keyboard ----

  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || element.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;

      if (event.code === "Space") {
        spaceRef.current = true;
        const canvas = canvasRef.current;
        if (canvas) canvas.style.cursor = "grab";
        event.preventDefault();
        return;
      }

      if (event.key === "Escape") {
        cancelTextDraft();
        selectElement(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectionRef.current) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCurrentPage();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        zoomAt(1.1);
        return;
      }
      if (event.key === "-") {
        zoomAt(1 / 1.1);
        return;
      }

      const shortcut = TOOL_OPTIONS.find((option) => option.key === event.key.toLowerCase());
      if (shortcut) setTool(shortcut.id);
      if (event.key.toLowerCase() === "t") setTool("text");
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "default";
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [cancelTextDraft, deleteSelection, redo, saveCurrentPage, selectElement, undo, zoomAt]);

  // ---- Export ----

  const renderPageToCanvas = useCallback(
    (page: UiPage, scale = 2): HTMLCanvasElement | null => {
      const offscreen = document.createElement("canvas");
      offscreen.width = PAGE_WIDTH * scale;
      offscreen.height = PAGE_HEIGHT * scale;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderPageContent(
        ctx,
        page.template,
        page.content,
        PAGE_WIDTH,
        PAGE_HEIGHT,
        lookupImage,
      );
      return offscreen;
    },
    [lookupImage],
  );

  const exportPng = useCallback(() => {
    const canvas = renderPageToCanvas(
      {
        id: currentPageIdRef.current ?? "",
        template: templateRef.current,
        content: contentRef.current,
        revision: 0,
      },
      2,
    );
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${notebookTitle || "notebook"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [notebookTitle, renderPageToCanvas]);

  const openPdfDialog = useCallback(() => {
    setPdfSelected(new Set(pages.map((page) => page.id)));
    setPdfOpen(true);
  }, [pages]);

  const exportPdf = useCallback(async () => {
    const chosen = pages.filter((page) => pdfSelected.has(page.id));
    if (chosen.length === 0) return;
    setExportingPdf(true);
    try {
      // Every embedded image must be decoded before it can hit the PDF.
      await ensureImagesLoaded(
        chosen.flatMap((page) => page.content.images.map((image) => image.src)),
      );
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      let added = 0;
      for (const page of chosen) {
        const canvas = renderPageToCanvas(page, 2);
        if (!canvas) continue;
        const data = canvas.toDataURL("image/jpeg", 0.92);
        if (added > 0) pdf.addPage();
        pdf.addImage(data, "JPEG", 0, 0, pageWidth, pageHeight);
        added += 1;
      }

      if (added > 0) {
        pdf.save(`${notebookTitle || "notebook"}.pdf`);
        setPdfOpen(false);
      } else {
        setMessage("مقدرنش نصدّر الصفحات المختارة.");
      }
    } catch (error) {
      console.error("[notes] pdf export failed", error);
      setMessage("فشل تصدير الـ PDF.");
    } finally {
      setExportingPdf(false);
    }
  }, [ensureImagesLoaded, notebookTitle, pages, pdfSelected, renderPageToCanvas]);

  // ---- Derived UI ----

  const currentIndex = currentPageId
    ? pages.findIndex((page) => page.id === currentPageId)
    : -1;
  const { canUndo, canRedo } = historyState;
  const eraserActive = tool === "eraser";
  const showTextControls = tool === "text" || selection?.kind === "text";

  /** Text blocks across the whole notebook matching the search query. */
  const searchResults = useMemo(() => {
    const needle = query.trim();
    if (needle === "") return [];
    return pages.flatMap((page, pageIndex) =>
      page.content.texts
        .filter((text) => text.text.includes(needle))
        .map((text) => ({
          pageId: page.id,
          pageIndex,
          textId: text.id,
          snippet: text.text.replace(/\s+/g, " ").slice(0, 80),
        })),
    );
  }, [pages, query]);

  const textEditorStyle = textDraft
    ? {
        left: textDraft.x * view.zoom + view.panX,
        top: textDraft.y * view.zoom + view.panY,
        fontSize: textSize * view.zoom,
        color,
        fontFamily: textFont,
      }
    : undefined;

  return (
    <div className="notes-page">
      <header className="notes-header">
        <Link href="/notes" className="notes-btn notes-btn-sm">
          → دفاتري
        </Link>
        <h1 className="notes-title">{notebookTitle}</h1>
        <div className="notes-spacer" />
        <NotesChip
          tone={canWrite ? "ok" : "warn"}
          title="حالة قفل الكتابة"
        >
          {canWrite ? "قابل للكتابة" : "قراءة فقط"}
        </NotesChip>
        <NotesChip
          tone={saveStatus === "error" ? "danger" : saveStatus === "saved" ? "ok" : undefined}
          title="حالة الحفظ"
        >
          {saveStatus === "idle" ? "جاهز" : saveStatus === "saving" ? "بيحفظ…" : saveStatus === "saved" ? "محفوظ" : "فشل الحفظ"}
        </NotesChip>
        <NotesThemeToggle />
      </header>

      {message ? (
        <p className="notes-alert" data-tone="error">
          {message}
        </p>
      ) : null}

      {!loaded ? <p className="notes-hint">بنحمّل الصفحة…</p> : null}

      <NotesGuide variant="editor" />

      {/* Row 1 — select, writing tools, shapes, text, images */}
      <div className="notes-toolbar">
        <div className="notes-group" role="group" aria-label="أدوات الرسم">
          {TOOL_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTool(option.id)}
              data-active={tool === option.id}
              title={`${option.label} (${option.key})`}
              aria-pressed={tool === option.id}
              className="notes-btn"
            >
              <span aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <span className="notes-sep" aria-hidden="true" />

        <div className="notes-group" role="group" aria-label="الأشكال">
          <span className="notes-group-label">أشكال</span>
          {SHAPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTool(option.id)}
              data-active={tool === option.id}
              title={option.label}
              aria-pressed={tool === option.id}
              className="notes-btn notes-icon-btn"
            >
              <span aria-hidden="true">{option.icon}</span>
            </button>
          ))}
        </div>

        <span className="notes-sep" aria-hidden="true" />

        <div className="notes-group">
          <button
            type="button"
            onClick={() => setTool("text")}
            data-active={tool === "text"}
            title="نص (T)"
            aria-pressed={tool === "text"}
            className="notes-btn"
          >
            <span aria-hidden="true">🅣</span>
            <span>نص</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canWrite}
            title="إدراج صورة"
            className="notes-btn"
          >
            <span aria-hidden="true">🖼️</span>
            <span>صورة</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void insertImageFile(file);
              event.target.value = "";
            }}
          />
        </div>

        {selection ? (
          <>
            <span className="notes-sep" aria-hidden="true" />
            <div className="notes-group">
              <button
                type="button"
                onClick={deleteSelection}
                data-tone="danger"
                className="notes-btn"
                title="حذف المحدد (Delete)"
              >
                🗑 حذف المحدد
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* Row 2 — style: colors, thickness, opacity, text font */}
      <div className="notes-toolbar">
        <div className="notes-group" role="group" aria-label="الألوان">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`لون ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => setColor(swatch)}
              disabled={!canWrite}
              data-active={color === swatch}
              style={{ backgroundColor: swatch }}
              className="notes-swatch"
            />
          ))}
          <input
            type="color"
            aria-label="لون مخصص"
            value={color}
            disabled={!canWrite}
            onChange={(event) => setColor(event.target.value)}
            className="notes-swatch"
          />
        </div>

        <span className="notes-sep" aria-hidden="true" />

        <label className="notes-label">
          سماكة
          <input
            type="range"
            min={1}
            max={24}
            value={thickness}
            disabled={!canWrite}
            onChange={(event) => setThickness(Number(event.target.value))}
            className="notes-range"
          />
        </label>
        <label className="notes-label">
          شفافية
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            disabled={!canWrite}
            onChange={(event) => setOpacity(Number(event.target.value))}
            className="notes-range"
          />
        </label>

        {showTextControls ? (
          <>
            <span className="notes-sep" aria-hidden="true" />
            <label className="notes-label">
              الخط
              <select
                value={textFont}
                onChange={(event) => setTextFont(event.target.value)}
                disabled={!canWrite}
                className="notes-input notes-btn-sm"
              >
                {FONT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="notes-label">
              حجم
              <input
                type="range"
                min={12}
                max={96}
                value={textSize}
                disabled={!canWrite}
                onChange={(event) => setTextSize(Number(event.target.value))}
                className="notes-range"
              />
              <span className="notes-count">{textSize}</span>
            </label>
          </>
        ) : null}
      </div>

      {/* Row 3 — history, view, template, actions */}
      <div className="notes-toolbar">
        <div className="notes-group">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="تراجع (Ctrl+Z)"
            className="notes-btn"
          >
            ↶ تراجع
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="إعادة (Ctrl+Shift+Z)"
            className="notes-btn"
          >
            ↷ إعادة
          </button>
          <button
            type="button"
            onClick={clearPage}
            disabled={!canWrite}
            data-tone="danger"
            className="notes-btn"
          >
            تفريغ الصفحة
          </button>
        </div>

        <span className="notes-sep" aria-hidden="true" />

        <div className="notes-group" role="group" aria-label="التكبير">
          <button
            type="button"
            onClick={() => zoomAt(1 / 1.1)}
            title="تصغير (-)"
            aria-label="تصغير"
            className="notes-btn notes-icon-btn"
          >
            −
          </button>
          <span className="notes-count">{Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomAt(1.1)}
            title="تكبير (+)"
            aria-label="تكبير"
            className="notes-btn notes-icon-btn"
          >
            +
          </button>
          <button type="button" onClick={fitToWidth} className="notes-btn notes-btn-sm">
            ملاءمة العرض
          </button>
        </div>

        <span className="notes-sep" aria-hidden="true" />

        <div className="notes-group" role="group" aria-label="قالب الصفحة">
          {TEMPLATE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => changeTemplate(option.id)}
              disabled={!canWrite}
              data-active={template === option.id}
              aria-pressed={template === option.id}
              className="notes-btn notes-btn-sm"
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="notes-sep" aria-hidden="true" />

        <div className="notes-group">
          <button
            type="button"
            onClick={() => void saveCurrentPage()}
            disabled={!canWrite}
            data-tone="primary"
            className="notes-btn"
          >
            حفظ
          </button>
          <button type="button" onClick={exportPng} className="notes-btn">
            تصدير PNG
          </button>
          <button
            type="button"
            onClick={openPdfDialog}
            disabled={pages.length === 0}
            data-tone="primary"
            className="notes-btn"
          >
            تصدير PDF
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="notes-canvas-wrap"
        style={{ height: 620 }}
        onDragOver={(event) => {
          if (canWrite) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!canWrite) return;
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void insertImageFile(file);
        }}
      >
        <canvas
          ref={canvasRef}
          className="notes-canvas"
          style={{
            cursor: !canWrite
              ? "default"
              : tool === "text"
                ? "text"
                : eraserActive
                  ? "cell"
                  : tool === "select"
                    ? "default"
                    : "crosshair",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerInteraction}
          onPointerCancel={endPointerInteraction}
          onPointerLeave={endPointerInteraction}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(event) => event.preventDefault()}
        />
        {textDraft && textEditorStyle ? (
          <textarea
            className="notes-text-editor"
            style={textEditorStyle}
            value={textDraft.value}
            autoFocus
            dir="rtl"
            rows={2}
            placeholder="اكتب هنا…"
            onChange={(event) =>
              setTextDraft({ ...textDraft, value: event.target.value })
            }
            onBlur={commitTextDraft}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelTextDraft();
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commitTextDraft();
              }
            }}
          />
        ) : null}
      </div>

      {/* Page strip */}
      <div className="notes-page-strip">
        <button
          type="button"
          onClick={() => {
            const previous = pages[currentIndex - 1];
            if (previous) void selectPage(previous.id);
          }}
          disabled={currentIndex <= 0}
          className="notes-btn notes-btn-sm"
        >
          › السابقة
        </button>
        <span className="notes-count">
          صفحة {pages.length === 0 ? 0 : currentIndex + 1} من {pages.length}
        </span>
        <button
          type="button"
          onClick={() => {
            const next = pages[currentIndex + 1];
            if (next) void selectPage(next.id);
          }}
          disabled={currentIndex < 0 || currentIndex >= pages.length - 1}
          className="notes-btn notes-btn-sm"
        >
          التالية ‹
        </button>
        <select
          aria-label="انتقل إلى صفحة"
          value={currentPageId ?? ""}
          onChange={(event) => void selectPage(event.target.value)}
          disabled={!loaded || pages.length === 0}
          className="notes-input notes-btn-sm"
        >
          {pages.map((page, index) => (
            <option key={page.id} value={page.id}>
              صفحة {index + 1}
            </option>
          ))}
        </select>

        <span className="notes-sep" aria-hidden="true" />

        <button
          type="button"
          onClick={() => {
            const current = currentPageId;
            if (current) void movePage(current, -1);
          }}
          disabled={!canWrite || currentIndex <= 0}
          title="حرك الصفحة لقدام"
          aria-label="حرك الصفحة لقدام"
          className="notes-btn notes-btn-sm"
        >
          ⟲ ترتيب
        </button>
        <button
          type="button"
          onClick={() => {
            const current = currentPageId;
            if (current) void movePage(current, 1);
          }}
          disabled={!canWrite || currentIndex < 0 || currentIndex >= pages.length - 1}
          title="حرك الصفحة لورا"
          aria-label="حرك الصفحة لورا"
          className="notes-btn notes-btn-sm"
        >
          ⟳ ترتيب
        </button>
        <button
          type="button"
          onClick={() => void duplicatePage()}
          disabled={!canWrite || currentIndex < 0}
          title="انسخ الصفحة الحالية بكل محتواها"
          className="notes-btn notes-btn-sm"
        >
          ⧉ تكرار
        </button>
        <button
          type="button"
          onClick={() => void addPage()}
          disabled={!canWrite}
          data-tone="primary"
          className="notes-btn notes-btn-sm"
        >
          ＋ صفحة
        </button>
        <button
          type="button"
          onClick={() => void deletePage()}
          disabled={!canWrite || pages.length <= 1}
          data-tone="danger"
          className="notes-btn notes-btn-sm"
        >
          حذف الصفحة
        </button>

        <span className="notes-sep" aria-hidden="true" />

        <button
          type="button"
          onClick={() => setSearchOpen((open) => !open)}
          data-active={searchOpen}
          aria-expanded={searchOpen}
          className="notes-btn notes-btn-sm"
        >
          🔍 بحث
        </button>
      </div>

      {/* Visual page navigator */}
      <PageThumbs
        pages={pages.map((page) => ({
          id: page.id,
          template: page.template,
          content: page.content,
        }))}
        activePageId={currentPageId}
        lookup={lookupImage}
        onSelect={(pageId) => void selectPage(pageId)}
      />

      {/* Search inside the notebook's typed texts */}
      {searchOpen ? (
        <div className="notes-search">
          <input
            autoFocus
            type="search"
            value={query}
            placeholder="ابحث في نصوص الدفتر…"
            aria-label="ابحث في نصوص الدفتر"
            className="notes-input"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="notes-search-results">
            {query.trim() === "" ? (
              <p className="notes-search-empty">اكتب كلمة للبحث في كل النصوص المكتوبة.</p>
            ) : searchResults.length === 0 ? (
              <p className="notes-search-empty">مفيش نتائج للبحث ده.</p>
            ) : (
              searchResults.map((result) => (
                <button
                  key={`${result.pageId}-${result.textId}`}
                  type="button"
                  className="notes-search-hit"
                  onClick={() => void selectPage(result.pageId)}
                >
                  <span className="notes-search-page">صفحة {result.pageIndex + 1}</span>
                  <span className="notes-search-snippet">{result.snippet}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <p className="notes-hint">
        <kbd>مسافة</kbd> + سحب للتحريك · <kbd>Ctrl</kbd> + عجلة للتكبير ·{" "}
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> تراجع · <kbd>V</kbd> تحديد · <kbd>T</kbd> نص ·{" "}
        <kbd>1</kbd>–<kbd>5</kbd> الأدوات · اسحب صورة أو الصقها بـ <kbd>Ctrl</kbd>+
        <kbd>V</kbd> · التعديلات بتتحفظ تلقائياً.
      </p>

      {/* PDF export dialog */}
      {pdfOpen ? (
        <div
          className="notes-modal-backdrop"
          onClick={() => setPdfOpen(false)}
          role="presentation"
        >
          <div
            className="notes-modal"
            role="dialog"
            aria-modal="true"
            aria-label="تصدير PDF"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="notes-modal-title">تصدير PDF</h2>
            <p className="notes-modal-sub">
              اختار الصفحات اللي عايز تطلعها في الملف — بيتصدّروا بنفس ترتيب الدفتر.
            </p>
            <div className="notes-modal-pages">
              {pages.map((page, index) => (
                <label key={page.id} className="notes-modal-page">
                  <input
                    type="checkbox"
                    checked={pdfSelected.has(page.id)}
                    onChange={(event) => {
                      const next = new Set(pdfSelected);
                      if (event.target.checked) next.add(page.id);
                      else next.delete(page.id);
                      setPdfSelected(next);
                    }}
                  />
                  <span>صفحة {index + 1}</span>
                  <span className="notes-modal-page-meta">
                    {page.content.strokes.length} خط
                    {page.content.images.length > 0 ? ` · ${page.content.images.length} صورة` : ""}
                  </span>
                </label>
              ))}
            </div>
            <div className="notes-modal-actions">
              <button
                type="button"
                onClick={() => setPdfSelected(new Set(pages.map((page) => page.id)))}
                className="notes-btn notes-btn-sm"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setPdfSelected(new Set())}
                className="notes-btn notes-btn-sm"
              >
                إلغاء التحديد
              </button>
              <div className="notes-spacer" />
              <button
                type="button"
                onClick={() => setPdfOpen(false)}
                className="notes-btn notes-btn-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void exportPdf()}
                disabled={pdfSelected.size === 0 || exportingPdf}
                data-tone="primary"
                className="notes-btn"
              >
                {exportingPdf ? "بنجهّز الملف…" : `تصدير (${pdfSelected.size})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
