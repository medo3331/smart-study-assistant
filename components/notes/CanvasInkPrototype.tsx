"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Phase 1C-2 — Multi-Page Notebook Experience
 * Drawing tools: Pen, Ink, Pencil, Highlighter.
 * Full-stroke eraser. Save status. A4 portrait page.
 * persistsStrokeData: stores strokes in persistedSnapshot JSON for CAS.
 * Multi-page: each page has independent strokes stored in persistedSnapshot.
 * PageSession integration: persistence via IndexedDBNoteStorage.
 */

import { IndexedDBNoteStorage } from "@/lib/notes/storage";
import {
  pageContent,
  pageContentStrokes,
  notebookContent,
  canonicalJson,
} from "@/lib/notes/content";
import type {
  StorageNotebook,
  StoragePage,
  NotesOwner,
} from "@/lib/notes/types";

type Point = { x: number; y: number; pressure?: number };

/**
 * Stroke types for the drawing engine.
 * ID is stable across reload; tool/color/thickness/opacity are persistent.
 */
type Stroke = {
  id: string;
  tool: "pen" | "ink" | "pencil" | "highlighter";
  color: string;
  thickness: number;
  opacity: number;
  points: [number, number][];
  pressure?: number; // per-point when supported, else 0.5 fallback
};

/** Fallback pressure when device doesn't report it */
const FALLBACK_PRESSURE = 0.5;

/** Normalise a raw pressure value to 0–1 */
function normalizePressure(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return FALLBACK_PRESSURE;
  if (raw > 1) return 1;
  return raw;
}

/** UID helper */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Represents a page in the notebook with its template and strokes.
 * `strokes` is optional — legacy records without strokes fall back to
 * persistedSnapshot content. This keeps the persistence schema single-
 * source-of-truth while allowing the UI to cache strokes for performance.
 */
type NotebookPage = {
  id: string;
  template: "lined" | "blank";
  /** Strokes cached in UI; serialized to persistedSnapshot on save. */
  strokes: Stroke[];
};

/**
 * Notebook state: page order + per-page stroke data.
 * This is UI-local; the authoritative source is IndexedDB via
 * the shared storage instance / persistedSnapshot. No duplicate storage.
 */
type Notebook = {
  id: string;
  ownerId: string;
  title: string;
  pages: NotebookPage[];
  currentPageId: string | null;
  revision: number;
};

/** Create a new, empty page for the notebook. */
function createNewPage(template: "lined" | "blank"): NotebookPage {
  return {
    id: uid(),
    template,
    strokes: [],
  };
}

/**
 * Finds the index of a page by id in the notebook pages array.
 */
function findPageIndex(pages: NotebookPage[], pageId: string): number {
  return pages.findIndex((p) => p.id === pageId);
}

/**
 * Serialises the current notebook's strokes into the format
 * expected by `pageContentStrokes` / `canonicalJson` so that
 * the shared storage persists them through the existing pipeline.
 */
function serialiseNotebookPages(pages: NotebookPage[]): Record<string, unknown> {
  const pageStrokeMaps: Record<string, unknown> = {};
  for (const page of pages) {
    pageStrokeMaps[page.id] = page.strokes;
  }
  return pageStrokeMaps;
}

// ---- CanvasInkPrototype ----
export default function CanvasInkPrototype({
  saveStatusRef,
  notebookId,
  storage,
}: {
  saveStatusRef: React.Dispatch<React.SetStateAction<"idle" | "saving" | "saved" | "error">>;
  notebookId: string | null;
  storage: IndexedDBNoteStorage | null;
}) {
  // ---- Persistence / notebook state ----
  const [notebook, setNotebook] = useState<Notebook>({
    id: uid(),
    ownerId: "anon:test",
    title: "My Notebook",
    pages: [],
    currentPageId: null,
    revision: 0,
  });

  // ---- Page navigation state ----
  const [currentPageIndex, setCurrentPageIndex] = useState(-1); // -1 = no page selected

  // ---- Drawing state (per‑page) ----
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const dprRef = useRef(1);

  // ---- UI state ----
  const [tool, setTool] = useState<"pen" | "ink" | "pencil" | "highlighter">("pen");
  const [color, setColor] = useState("#1f2937");
  const [thickness, setThickness] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<"lined" | "blank">("lined");

  // ---- canvas & context ----
  const containerRef2 = useRef<HTMLDivElement>(null);

  // ---- low-level drawing helpers ----
  const drawSegment = useCallback(
    (ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, width: number) => {
      const dpr = dprRef.current;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * (0.5 + 0.5) * dpr; // opacity handled globally
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(a[0] * dpr, a[1] * dpr);
      ctx.lineTo(b[0] * dpr, b[1] * dpr);
      ctx.stroke();
    },
    []
  );

  const getContext = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }, []);

  // ---- canvas sizing ----
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef2.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    const container = containerRef2.current;
    if (!container) return;
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(container);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  // ---- pointer handlers ----
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      isDrawingRef.current = true;
      const pt: [number, number] = [e.clientX, e.clientY];
      const stroke: Stroke = {
        id: uid(),
        tool,
        color,
        thickness,
        opacity,
        points: [pt],
        pressure: normalizePressure(e.pressure),
      };
      currentStrokeRef.current = stroke;
      strokesRef.current.push(stroke);
      saveStatusRef("saving");
    },
    [tool, color, thickness, opacity]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = getContext();
      if (!canvas || !ctx) return;

      const native = e.nativeEvent;
      const events: PointerEvent[] =
        typeof native.getCoalescedEvents === "function"
          ? (native.getCoalescedEvents() as PointerEvent[])
          : [native];

      const stroke = currentStrokeRef.current;
      for (const ev of events) {
        const pt: [number, number] = [ev.clientX, ev.clientY];
        stroke.points.push(pt);
        drawSegment(ctx, stroke.points[stroke.points.length - 2], pt, color, thickness);
      }
    },
    [getContext, drawSegment, color, thickness]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    saveStatusRef("idle");
  }, []);

  const handlePointerCancel = useCallback(() => {
    isDrawingRef.current = false;
    saveStatusRef("idle");
  }, []);

  // ---- resize observer ----
  useEffect(() => {
    resizeCanvas();
    const container = containerRef2.current;
    if (!container) return;
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(container);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  // ---- Stroke count (derived from strokesRef) ----
  const strokeCount = strokesRef.current.length;

  // ---- Page management ----

  // Load existing notebook from IndexedDB on mount.
  useEffect(() => {
    async function loadNotebook() {
      if (!notebookId || !storage) return;
      try {
        const nb = await storage.getNotebook(notebookId);
        if (nb) {
          const pagesPromises = nb.pageIds.map((pid) => storage.getPage(pid));
          const pages = await Promise.all(pagesPromises);
          const renderedPages = pages
            .filter((p): p is StoragePage => p != null)
            .map((p) => {
              const persisted = p.persistedSnapshot;
              let strokes: Stroke[] = [];
              if (persisted != null && typeof persisted === "object" && "strokes" in persisted) {
                const ps = persisted as { strokes: unknown };
                if (Array.isArray(ps.strokes)) {
                  strokes = ps.strokes as Stroke[];
                }
              }
              return {
                id: p.id,
                template: p.template,
                strokes,
              };
            });
          setNotebook({
            id: nb.id,
            ownerId: nb.ownerId,
            title: nb.title,
            pages: renderedPages,
            currentPageId: nb.currentPageId || null,
            revision: nb.revision,
          });
          if (nb.currentPageId && nb.pageIds.includes(nb.currentPageId)) {
              setCurrentPageIndex(nb.pageIds.indexOf(nb.currentPageId));
            } else if (nb.pageIds.length > 0) {
              setCurrentPageIndex(0);
          }
        } else {
          // No existing notebook – start fresh.
          setNotebook({
            id: uid(),
            ownerId: "anon:test",
            title: "My Notebook",
            pages: [],
            currentPageId: null,
            revision: 0,
          });
        }
      } catch (e) {
        console.error("Failed to load notebook:", e);
        // Stay with the fresh state.
        setNotebook({
          id: uid(),
          ownerId: "anon:test",
          title: "My Notebook",
          pages: [],
          currentPageId: null,
          revision: 0,
        });
      }
    }
    loadNotebook();
  }, [notebookId, storage]);

  // ---- select a page by index ----
  // Saves the current page before switching, then loads the target page.
  const selectPage = (idx: number) => {
    // Save the current page if it has content, then switch.
    if (currentPageIndex >= 0 && currentPageIndex < notebook.pages.length) {
      const currentPage = notebook.pages[currentPageIndex];
      ;(async () => {
        if (!storage) return;
        const existingPage = await storage.getPage(currentPage.id);
        if (existingPage == null) return;
        existingPage.template = currentPage.template;
        existingPage.persistedSnapshot = pageContentStrokes(
          currentPage.template,
          currentPage.strokes
        );
        existingPage.revision = (existingPage.revision || 0) + 1;
        await storage.putPage(existingPage);
        // Also update notebook page order.
        const nb = {
              ...notebook,
              pageIds: notebook.pages.map((p) => p.id),
              revision: (notebook as any).revision,
              createdAt: (notebook as any).createdAt,
              updatedAt: (notebook as any).updatedAt,
            };
        await storage.putNotebook(nb as unknown as StorageNotebook);
        saveStatusRef("saved");
      })();
    }
    setCurrentPageIndex(idx);
    // When switching to an existing page, restore its strokes into local state
    if (idx >= 0 && idx < notebook.pages.length) {
      const page = notebook.pages[idx];
      strokesRef.current = page.strokes;
    } else {
      strokesRef.current = [];
    }
  };

  // Create a new page and make it current
  const createNewPage = (template: "lined" | "blank") => {
    const newPage: NotebookPage = {
      id: uid(),
      template,
      strokes: [],
    };
    setNotebook((prev) => {
      const newPages = [...prev.pages, newPage];
      const newCurrentId = prev.currentPageId ? prev.currentPageId : newPage.id;
      return {
        ...prev,
        pages: newPages,
        currentPageId: newCurrentId,
        revision: prev.revision,
      };
    });
    // Switch to the new page
    const newIndex = findPageIndex(notebook.pages.concat(newPage), newPage.id);
    selectPage(newIndex);
  };

  // Delete the current page (with confirmation)
  const deleteCurrentPage = () => {
    if (notebook.pages.length <= 1) {
      setNotebook((prev) => ({
        ...prev,
        pages: [],
        currentPageId: null,
      }));
      setCurrentPageIndex(-1);
      return;
    }
    const currentPage = notebook.pages.find((p) => p.id === notebook.currentPageId);
    if (!currentPage) return;
    setNotebook((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.id !== currentPage.id),
      currentPageId:
        prev.currentPageId === currentPage.id
          ? prev.pages[0]?.id || null
          : prev.currentPageId,
      revision: prev.revision,
    }));
    setCurrentPageIndex(
      notebook.currentPageId != null
        ? findPageIndex(notebook.pages.filter((p) => p.id !== currentPage.id), notebook.currentPageId)
        : 0
    );
  };

  // ---- Persist notebook and all pages to IndexedDB ----
  const persistNotebook = async () => {
    if (!storage) return;
    try {
      saveStatusRef("saving");
      // 1. Persist each page's strokes + template.
      for (const page of notebook.pages) {
        const existingPage = await storage.getPage(page.id);
        if (existingPage == null) continue;
        existingPage.template = page.template;
        existingPage.persistedSnapshot = pageContentStrokes(
          page.template,
          page.strokes
        );
        existingPage.revision = (existingPage.revision || 0) + 1;
        await storage.putPage(existingPage);
      }

      // 2. Persist notebook metadata (title + page order).
      const nb: StorageNotebook = {
        id: notebook.id,
        ownerId: notebook.ownerId,
        title: notebook.title,
        pageIds: notebook.pages.map((p) => p.id),
        currentPageId: notebook.currentPageId,
        revision: (notebook.revision || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await storage.putNotebook(nb);
      saveStatusRef("saved");
    } catch (e) {
      console.error("Failed to persist notebook:", e);
      saveStatusRef("error");
    }
  };

  // ---- Toolbar render ----
  const toolOptions = [
    { id: "pen", label: "Pen", icon: "🖊️" },
    { id: "ink", label: "Ink Pen", icon: "🖋️" },
    { id: "pencil", label: "Pencil", icon: "✏️" },
    { id: "highlighter", label: "Highlighter", icon: "🖍️" },
  ];

  const defaultColors = ["#1f2937", "#ef4444", "#2563eb", "#10b981"];

  const handleToolChange = (newTool: "pen" | "ink" | "pencil" | "highlighter") => {
    setTool(newTool);
    setColor(defaultColors[0]);
    setThickness(3);
    setOpacity(1);
  };

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
  };

  // ---- eraser logic ----
  const handleErase = () => {
    if (strokesRef.current.length > 0) {
      const erased = strokesRef.current.pop();
    }
  };

  // ---- toolbar render ----
  const toolButtons = toolOptions.map((opt) => (
    <button
      key={opt.id}
      type="button"
      onClick={() => handleToolChange(opt.id as "pen" | "ink" | "pencil" | "highlighter")}
      className={`rounded px-2 py-1 text-sm ${
        tool === opt.id ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"
      }`}
    >
      {opt.icon} {opt.label}
    </button>
  ));

  const colorButtons = defaultColors.map((c) => (
    <button
      key={c}
      type="button"
      onClick={() => handleColorChange(c)}
      className={`rounded w-3 h-3 ${
        color === c ? "border-2 border-white" : "border-transparent"
      }`}
    />
  ));

  const customColorBtn = (
    <button
      type="button"
      onClick={() => {
        const randomColor = `#${Math.random().toString(16).slice(2, 8)}`;
        handleColorChange(randomColor);
      }}
      className="rounded w-3 h-3 bg-gray-300 p-0"
      aria-label="Custom color"
    />
  );

  const thicknessButtons = (
    <div className="flex items-center gap-1">
      <span className="text-xs">T:{thickness}</span>
      <button
        type="button"
        onClick={() => setThickness((t) => Math.max(1, t - 1))}
        className="rounded bg-gray-100 px-1 text-xs"
      >
        -
      </button>
      <button
        type="button"
        onClick={() => setThickness((t) => t + 1)}
        className="rounded bg-gray-100 px-1 text-xs"
      >
        +
      </button>
    </div>
  );

  const opacityButtons = (
    <div className="flex items-center gap-1">
      <span className="text-xs">O:{opacity.toFixed(1)}</span>
      <button
        type="button"
        onClick={() => setOpacity((o) => Math.min(1, o + 0.1))}
        className="rounded bg-gray-100 px-1 text-xs"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => setOpacity((o) => Math.max(0, o - 0.1))}
        className="rounded bg-gray-100 px-1 text-xs"
      >
        -
      </button>
    </div>
  );

  // ---- eraser button ----
  const eraseBtn = (
    <button
      type="button"
      onClick={handleErase}
      className="mt-1 rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300"
      aria-label="Erase last stroke"
    >
      Erase Last Stroke
    </button>
  );

  // ---- page navigation ----
  const pageNav = notebook.pages.length > 0 ? (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs">
        Page {findPageIndex(notebook.pages, notebook.currentPageId || "") + 1} of {notebook.pages.length}
      </span>
      <button
        type="button"
        onClick={() => createNewPage("lined")}
        className="rounded bg-blue-600 px-2 py-1 text-sm text-white"
      >
        New
      </button>
    </div>
  ) : (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => createNewPage("lined")}
        className="rounded bg-blue-600 px-2 py-1 text-sm text-white"
      >
        New
      </button>
    </div>
  );

  // ---- template selector (compact mobile) ----
  const templateSelector = (
    <div className="mt-1 flex gap-1">
      <button
        type="button"
        onClick={() => setSelectedTemplate("lined")}
        className={`rounded bg-${
          selectedTemplate === "lined" ? "blue-600 text-white" : "gray-200"
        } px-2 py-1 text-sm ${
          selectedTemplate === "lined" ? "text-white" : "text-gray-700"
        }`}
      >
        Lined
      </button>
      <button
        type="button"
        onClick={() => setSelectedTemplate("blank")}
        className={`rounded bg-${
          selectedTemplate === "blank" ? "blue-600 text-white" : "gray-200"
        } px-2 py-1 text-sm ${
          selectedTemplate === "blank" ? "text-white" : "text-gray-700"
        }`}
      >
        Blank
      </button>
    </div>
  );

// ---- render ----
  return (
    <div className="space-y-4">
      {/* Page navigation + new page */}
      {pageNav}

      {/* Template selector (compact) */}
      {templateSelector}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 items-center">
        <div className="flex gap-1">
          {toolButtons}
        </div>

        <div className="flex items-center gap-2">
          {colorButtons}
          {customColorBtn}
          {thicknessButtons}
          {opacityButtons}
        </div>
      </div>

      {/* Eraser button */}
      {eraseBtn}

      {/* Action: persist notebook (save button) */}
      {notebook.pages.length > 0 && (
        <button
          type="button"
          onClick={persistNotebook}
          className="mt-1 rounded bg-green-600 px-3 py-1 text-sm text-white"
          aria-label="Save notebook"
        >
          Save Notebook
        </button>
      )}

      <div className="relative h-[500px] w-full rounded">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{ touchAction: "none" }}
        />
      </div>

      {/* Instructions */}
      <p className="text-xs text-gray-500">
        Draw with {tool}. Page {findPageIndex(notebook.pages, notebook.currentPageId || "") + 1} of{" "}{notebook.pages.length || 1}. Use color {color}, thickness {thickness}, opacity {opacity.toFixed(1)}.
      </p>
    </div>
  );
}