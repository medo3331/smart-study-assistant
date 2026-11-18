"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pageContentStrokes } from "@/lib/notes/content";
import { classifyNotesError } from "@/lib/notes/errors";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  TEMPLATE_OPTIONS,
  paintPageBackground,
  paintStroke,
  renderPage,
  strokeAt,
} from "@/lib/notes/canvas";
import { UndoStack } from "@/lib/notes/history";
import {
  buildEmptyPage,
  buildNotebookSave,
  buildPageSave,
  ensureNotebook,
  strokesFromSnapshot,
} from "@/lib/notes/notebook";
import type { NoteRepository } from "@/lib/notes/repository";
import type { NotesTemplate, Stroke } from "@/lib/notes/types";
import type { SaveStatus } from "@/hooks/useNoteRepository";
import { useTheme } from "@/theme/ThemeProvider";
import { NotesChip, NotesThemeToggle } from "@/components/notes/NotesHeader";
import NotesGuide from "@/components/notes/NotesGuide";

/**
 * The notebook editor.
 *
 * Coordinates: strokes are stored in PAGE space (794×1123, i.e. A4 at 96dpi),
 * never in viewport pixels. Zoom and pan are a view transform applied at paint
 * time, so a page drawn at 100% and the same page reopened at 250% persist
 * identical geometry.
 *
 * Every mutation is a new stroke array, which is what makes undo a matter of
 * swapping array references instead of diffing objects.
 *
 * The chrome uses the site's design tokens (see app/notes.css) so the editor
 * follows all eight site themes; the paper itself stays white — it is content,
 * not chrome, and dark ink on a dark sheet would be unreadable.
 */

type Tool = Stroke["tool"] | "eraser";
type UiPage = {
  id: string;
  template: NotesTemplate;
  strokes: Stroke[];
  revision: number;
};

const PALETTE = ["#111827", "#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed"];
const AUTOSAVE_DELAY_MS = 600;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;
const ERASER_TOLERANCE = 6;

const TOOL_OPTIONS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: "pen", label: "قلم", icon: "🖊️", key: "1" },
  { id: "ink", label: "حبر", icon: "🖋️", key: "2" },
  { id: "pencil", label: "رصاص", icon: "✏️", key: "3" },
  { id: "highlighter", label: "تظليل", icon: "🖍️", key: "4" },
  { id: "eraser", label: "ممحاة", icon: "🧽", key: "5" },
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

  // ---- View state ----
  const [zoom, setZoom] = useState(1);

  // ---- Refs: the drawing hot path must not depend on render closures ----
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dprRef = useRef(1);
  const strokesRef = useRef<Stroke[]>([]);
  const templateRef = useRef<NotesTemplate>("lined");
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const erasingRef = useRef(false);
  const erasedRef = useRef(false);
  const spaceRef = useRef(false);
  const backdropRef = useRef("#eef1f5");

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const notebookIdRef = useRef<string | null>(null);
  const currentPageIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<UndoStack<Stroke[]>>(new UndoStack<Stroke[]>([]));
  const fittedRef = useRef(false);

  useEffect(() => {
    notebookIdRef.current = notebookId;
  }, [notebookId]);

  useEffect(() => {
    currentPageIdRef.current = currentPageId;
  }, [currentPageId]);

  // ---- Painting ----

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
    for (const stroke of strokesRef.current) paintStroke(ctx, stroke);
    ctx.restore();
  }, []);

  // Re-read the theme's surface colour whenever the theme changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = getComputedStyle(canvas).getPropertyValue("--paper-3").trim();
    if (value) backdropRef.current = value;
    paint();
  }, [theme, paint]);

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
      setZoom(nextZoom);
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
      setZoom(fit);
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
      const record = buildPageSave({
        ownerId: repo.ownerId,
        notebookId: nbId,
        pageId,
        template,
        strokes: strokesRef.current,
        persistedSnapshot: pageContentStrokes(template, strokesRef.current),
        existing,
        now: nowIso(),
      });
      await repo.savePage(record);

      const savedStrokes = strokesRef.current;
      setPages((previous) =>
        previous.map((page) =>
          page.id === pageId
            ? { ...page, template, strokes: savedStrokes, revision: record.revision }
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
    historyRef.current.push(strokesRef.current);
    syncHistory();
  }, [syncHistory]);

  const applyHistory = useCallback(
    (next: Stroke[] | null) => {
      if (!next) return;
      strokesRef.current = next;
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
      strokesRef.current = page ? [...page.strokes] : [];
      historyRef.current.reset(strokesRef.current);
      syncHistory();
      requestAnimationFrame(() => paint());
    },
    [paint, syncHistory],
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
          strokes: strokesFromSnapshot(record.persistedSnapshot),
          revision: record.revision,
        }));

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
  }, [repo, requestedNotebookId, activatePage]);

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
      strokesRef.current = [...page.strokes];
      historyRef.current.reset(strokesRef.current);
      syncHistory();
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
    [pages, notebookTitle, paint, repo, saveCurrentPage, saveNotebookRecord, syncHistory],
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
        { id: pageId, template: templateRef.current, strokes: [], revision: record.revision },
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
      strokesRef.current = [];
      historyRef.current.reset(strokesRef.current);
      syncHistory();
      paint();
      setSaveStatus("saved");
    } catch (error) {
      console.error("[notes] add page failed", classifyNotesError(error), error);
      setSaveStatus("error");
    }
  }, [
    notebookTitle,
    pages,
    paint,
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
      strokesRef.current = next ? [...next.strokes] : [];
      historyRef.current.reset(strokesRef.current);
      syncHistory();
      paint();
      setSaveStatus("saved");
    } catch (error) {
      console.error("[notes] delete page failed", classifyNotesError(error), error);
      setSaveStatus("error");
    }
  }, [notebookTitle, pages, paint, repo, saveNotebookRecord, setSaveStatus, syncHistory]);

  const changeTemplate = useCallback(
    (template: NotesTemplate) => {
      templateRef.current = template;
      paint();
      void saveCurrentPage();
    },
    [paint, saveCurrentPage],
  );

  const clearPage = useCallback(() => {
    if (!canWrite) return;
    strokesRef.current = [];
    paint();
    commitHistory();
    scheduleSave();
  }, [canWrite, commitHistory, paint, scheduleSave]);

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

      if (tool === "eraser") {
        erasingRef.current = true;
        erasedRef.current = false;
        const index = strokeAt(strokesRef.current, x, y, ERASER_TOLERANCE);
        if (index >= 0) {
          const next = strokesRef.current.slice();
          next.splice(index, 1);
          strokesRef.current = next;
          erasedRef.current = true;
          paint();
        }
        return;
      }

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
      strokesRef.current = [...strokesRef.current, stroke];

      const ctx = canvas.getContext("2d");
      if (ctx) paintStroke(ctx, stroke);
    },
    [canWrite, color, opacity, paint, thickness, toPagePoint, tool],
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

      if (erasingRef.current) {
        const [x, y] = toPagePoint(event.clientX, event.clientY);
        const index = strokeAt(strokesRef.current, x, y, ERASER_TOLERANCE);
        if (index >= 0) {
          const next = strokesRef.current.slice();
          next.splice(index, 1);
          strokesRef.current = next;
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
    currentStrokeRef.current = null;
    paint();
    commitHistory();
    scheduleSave();
  }, [commitHistory, paint, scheduleSave]);

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

      const shortcut = TOOL_OPTIONS.find((option) => option.key === event.key);
      if (shortcut) setTool(shortcut.id);
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
  }, [redo, saveCurrentPage, undo, zoomAt]);

  // ---- Export ----

  const exportPng = useCallback(() => {
    const offscreen = document.createElement("canvas");
    const scale = 2;
    offscreen.width = PAGE_WIDTH * scale;
    offscreen.height = PAGE_HEIGHT * scale;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderPage(ctx, templateRef.current, strokesRef.current, PAGE_WIDTH, PAGE_HEIGHT);

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${notebookTitle || "notebook"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [notebookTitle]);

  // ---- Derived UI ----

  const currentIndex = currentPageId
    ? pages.findIndex((page) => page.id === currentPageId)
    : -1;
  const currentPage = currentIndex >= 0 ? pages[currentIndex] : null;
  const template = currentPage?.template ?? templateRef.current;
  const { canUndo, canRedo } = historyState;
  const eraserActive = tool === "eraser";

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

      {/* Row 1 — writing tools */}
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
      </div>

      {/* Row 2 — history, view, template, actions */}
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
          <span className="notes-count">{Math.round(zoom * 100)}%</span>
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
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="notes-canvas-wrap" style={{ height: 620 }}>
        <canvas
          ref={canvasRef}
          className="notes-canvas"
          style={{
            cursor: !canWrite ? "default" : eraserActive ? "cell" : "crosshair",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerInteraction}
          onPointerCancel={endPointerInteraction}
          onPointerLeave={endPointerInteraction}
          onContextMenu={(event) => event.preventDefault()}
        />
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
      </div>

      <p className="notes-hint">
        <kbd>مسافة</kbd> + سحب للتحريك · <kbd>Ctrl</kbd> + عجلة للتكبير ·{" "}
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> تراجع · <kbd>1</kbd>–<kbd>5</kbd> الأدوات · التعديلات
        بتتحفظ تلقائياً.
      </p>
    </div>
  );
}
