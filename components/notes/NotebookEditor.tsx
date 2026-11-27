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
  strokeAt,
  textAt,
  textBounds,
} from "@/lib/notes/canvas";
import { beautifyStrokes } from "@/lib/notes/beautify";
import { UndoStack } from "@/lib/notes/history";
import {
  buildEmptyPage,
  buildNotebookSave,
  buildPageSave,
  contentFromSnapshot,
  ensureNotebook,
} from "@/lib/notes/notebook";
import type { NoteRepository } from "@/lib/notes/repository";
import {
  MAX_PDF_PAGES_PER_IMPORT,
  loadPdfDocument,
  renderPdfPageToImage,
} from "@/lib/notes/pdf";
import PdfExportDialog from "@/components/notes/PdfExportDialog";
import PdfImportDialog, { type PdfLibraryEntry } from "@/components/notes/PdfImportDialog";
import { dataUrlToBlob } from "@/lib/notes/blob";
import { SaveCoordinator } from "@/lib/notes/editor-save";
import { pageQuotaBlockedMessage, refundPageCredit, requestPageCredits, type PageQuotaResult } from "@/lib/notes/page-quota";
import {
  AUTOSAVE_DELAY_MS,
  ERASER_TOLERANCE,
  FONT_OPTIONS,
  MAX_IMAGE_DIMENSION,
  MAX_ZOOM,
  MIN_ZOOM,
  PALETTE,
  SHAPE_OPTIONS,
  TOOL_OPTIONS,
  clamp,
  isShapeTool,
  newId,
  nowIso,
  pointInPolygon,
  polygonTouchesRect,
  strokeBounds,
  type Selection,
  type TextDraft,
  type Tool,
  type UiPage,
} from "@/lib/notes/editor-kit";
import type {
  NoteImage,
  NoteText,
  NotesTemplate,
  PageContent,
  StoragePage,
  Stroke,
} from "@/lib/notes/types";
import type { SaveStatus } from "@/hooks/useNoteRepository";
import { useTheme } from "@/theme/ThemeProvider";
import { NotesChip, NotesThemeToggle } from "@/components/notes/NotesHeader";
import NotesGuide from "@/components/notes/NotesGuide";
import PageThumbs from "@/components/notes/PageThumbs";
import NotesAssistant from "@/components/notes/NotesAssistant";
import MagicWriteDialog from "@/components/notes/MagicWriteDialog";
import { wrapAiText, type AiLayoutResult } from "@/lib/notes/ai-layout";
import { buildInkRevealStages, inkDelayMs, type InkRevealStage } from "@/lib/notes/ink-reveal";
import StudyCards from "@/components/notes/StudyCards";

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

export type { Tool };


export type { Selection };























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

  // ---- Share (read-only link) state ----
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // ---- In-notebook text search state ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // ---- PDF import state ----
  const pdfInputRef = useRef<HTMLInputElement>(null);
  /** 📁 رفع أي ملف على النوته مباشرة من الجهاز. */
  const anyFileInputRef = useRef<HTMLInputElement>(null);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfFrom, setPdfFrom] = useState(1);
  const [pdfTo, setPdfTo] = useState(1);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  // 📁 مصدر الاستيراد: ملف محلي (pdfInputRef) أو من «ملفاتي» (Storage).
  const [pdfLibraryFile, setPdfLibraryFile] = useState<{
    fileId: string;
    fileName: string;
    url: string;
  } | null>(null);
  const [pdfLibraryList, setPdfLibraryList] = useState<PdfLibraryEntry[] | null>(null);

  // ---- Split-screen mode (opened beside a lesson) ----
  const [besideMode, setBesideMode] = useState(false);

  // 📊 كوتة الصفحات اليومية (free = 10/يوم) — لشريط الاستهلاك. null = مشترَك/بلا حد/لسه ماتجابتش.
  const [pageQuota, setPageQuota] = useState<{ used: number; limit: number } | null>(null);

  // 📊 تحديث شريط الكوتة من رد طلب الرصيد.
  /** 🔑 مفاتيح استهلاك صفحات الجلسة — للتردد عند حذف الصفحة. */
  const pageCreditKeysRef = useRef<string[]>([]);
  const trackPageQuota = useCallback((result: PageQuotaResult) => {
    if (!result.failOpen && result.limit >= 0) {
      setPageQuota({ used: result.used, limit: result.limit });
      if (result.idempotencyKey) {
        pageCreditKeysRef.current.push(result.idempotencyKey);
        if (pageCreditKeysRef.current.length > 50) pageCreditKeysRef.current.shift();
      }
    }
  }, []);

  // 📊 الرصيد المبدأي — GET مش بيستهلك حاجة.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/notes/page-quota");
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data?.ok && typeof data.limit === "number" && data.limit >= 0) {
          setPageQuota({ used: data.used ?? 0, limit: data.limit });
        }
      } catch {
        // أوفلاين — الشريط بيفضل مخفي.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Handwriting beautify (Natural mode) ----
  const [beautifyOpen, setBeautifyOpen] = useState(false);
  // 🎴 مذاكرة من النوته — فلَش كاردز + اختيار من متعدد.
  const [studyOpen, setStudyOpen] = useState(false);
  const [beautifyStrength, setBeautifyStrength] = useState(0.6);
  const [beautifyRows, setBeautifyRows] = useState(true);

  // ---- Focus mode / collapsible toolbar / remembered view ----
  const [focusMode, setFocusMode] = useState(false);
  const [toolbarsCollapsed, setToolbarsCollapsed] = useState(false);
  const savedViewRef = useRef<{ zoom?: number; collapsed?: boolean; focus?: boolean } | null>(null);
  const originalPreviewRef = useRef<HTMLCanvasElement>(null);
  const beautifiedPreviewRef = useRef<HTMLCanvasElement>(null);

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
  // ---- Lasso multi-select + clipboard ----
  /** العناصر المحددة بالحبل (ids فريدة عبر الأنواع كلها). */
  const multiSelRef = useRef<Set<string>>(new Set());
  /** مسار الحبل الحالي أثناء السحب (page coords). */
  const lassoPathRef = useRef<Array<[number, number]> | null>(null);
  /** سحب مجموعة محددة: نقطة البداية + نسخ أصلية لكل عنصر محدد. */
  const multiDragRef = useRef<{
    start: [number, number];
    originals: Map<string, Stroke | NoteText | NoteImage>;
  } | null>(null);
  /** الحافظة الداخلية — عناصر منسوخة (page coords) للصق في أي صفحة. */
  const clipboardRef = useRef<PageContent | null>(null);
  /** عدد العناصر المحددة — للواجهة (أزرار نسخ/لصق/حذف). */
  const [multiCount, setMultiCount] = useState(0);
  const [clipboardLoaded, setClipboardLoaded] = useState(false);
  /** Decoded image cache: data URL → ready-to-draw element. */
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const notebookIdRef = useRef<string | null>(null);
  const currentPageIdRef = useRef<string | null>(null);
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

  // The editor may live in a side window launched from a lesson page, or
  // embedded in the split panel iframe (?beside=1).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const beside =
        window.name === "smart-notes-beside" ||
        new URLSearchParams(window.location.search).get("beside") === "1";
      setBesideMode(beside);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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
    const content = contentRef.current;

    // 🪢 تحديد متعدد: صندوق موحّد حوالين كل العناصر المحددة.
    if (multiSelRef.current.size > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let found = false;
      for (const stroke of content.strokes) {
        if (!multiSelRef.current.has(stroke.id)) continue;
        const bounds = strokeBounds(stroke);
        minX = Math.min(minX, bounds.x); minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width); maxY = Math.max(maxY, bounds.y + bounds.height);
        found = true;
      }
      for (const image of content.images) {
        if (!multiSelRef.current.has(image.id)) continue;
        minX = Math.min(minX, image.x); minY = Math.min(minY, image.y);
        maxX = Math.max(maxX, image.x + image.width); maxY = Math.max(maxY, image.y + image.height);
        found = true;
      }
      for (const text of content.texts) {
        if (!multiSelRef.current.has(text.id)) continue;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const bounds = ctx ? textBounds(ctx, text) : {
          x: text.x,
          y: text.y,
          width: text.size * Math.max(...text.text.split("\n").map((line) => line.length), 1) * 0.55,
          height: text.size * 1.5 * text.text.split("\n").length,
        };
        minX = Math.min(minX, bounds.x); minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width); maxY = Math.max(maxY, bounds.y + bounds.height);
        found = true;
      }
      return found
        ? { x: minX - 4, y: minY - 4, width: maxX - minX + 8, height: maxY - minY + 8 }
        : null;
    }

    const current = selectionRef.current;
    if (!current) return null;
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

    // 🪢 مسار الحبل أثناء السحب — خط متقطع حول العناصر المطلوب تحديدها.
    const lassoPath = lassoPathRef.current;
    if (lassoPath && lassoPath.length > 1) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lassoPath[0][0], lassoPath[0][1]);
      for (let i = 1; i < lassoPath.length; i++) {
        ctx.lineTo(lassoPath[i][0], lassoPath[i][1]);
      }
      ctx.stroke();
      ctx.restore();
    }

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

  // Restore the remembered view (zoom, collapsed toolbar, focus mode).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = (await repo.getMeta("notes:view")) as
          | { zoom?: unknown; collapsed?: unknown; focus?: unknown }
          | null;
        if (cancelled || !saved || typeof saved !== "object") return;
        const savedZoom =
          typeof saved.zoom === "number" ? clamp(saved.zoom, MIN_ZOOM, MAX_ZOOM) : null;
        savedViewRef.current = {
          zoom: savedZoom ?? undefined,
          collapsed: saved.collapsed === true,
          focus: saved.focus === true,
        };
        if (savedViewRef.current.collapsed) setToolbarsCollapsed(true);
        if (savedViewRef.current.focus) setFocusMode(true);
        if (savedZoom != null && fittedRef.current) {
          applyView(savedZoom, panRef.current);
        }
      } catch {
        /* best-effort restore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, applyView]);

  // Persist view changes (debounced) so the editor reopens the way it was left.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      void repo
        .putMeta("notes:view", {
          zoom: zoomRef.current,
          collapsed: toolbarsCollapsed,
          focus: focusMode,
        })
        .catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, view.zoom, toolbarsCollapsed, focusMode, repo]);

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
      const remembered = savedViewRef.current?.zoom;
      const fit = clamp(
        remembered ?? (rect.width - 64) / PAGE_WIDTH,
        MIN_ZOOM,
        MAX_ZOOM,
      );
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

  /** Latest record built for a save, so pages state can sync post-write. */
  const lastRecordRef = useRef<StoragePage | null>(null);
  const saveCoordinatorRef = useRef<{
    repo: NoteRepository;
    coordinator: SaveCoordinator;
  } | null>(null);

  /**
   * Lazily build (and cache) the save coordinator for this screen.
   *
   * Everything the coordinator touches lives in refs and is read only inside
   * its callbacks, so nothing here runs during render.
   */
  const getSaveCoordinator = useCallback((): SaveCoordinator => {
    const cached = saveCoordinatorRef.current;
    if (cached && cached.repo === repo) return cached.coordinator;

    const coordinator = new SaveCoordinator({
      repo,
      buildRecord: async () => {
        const pageId = currentPageIdRef.current;
        const nbId = notebookIdRef.current;
        if (!pageId || !nbId) return null;
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
        lastRecordRef.current = record;
        return record;
      },
      onState: (state) => {
        setSaveStatus(state.status);
        if (state.status === "error") {
          setMessage("فشل الحفظ — اضغط «إعادة المحاولة».");
        }
        if (state.status === "saved") {
          setMessage(null);
          const record = lastRecordRef.current;
          const pageId = currentPageIdRef.current;
          const savedContent = contentRef.current;
          const template = templateRef.current;
          if (record && pageId) {
            setPages((previous) =>
              previous.map((page) =>
                page.id === pageId
                  ? { ...page, template, content: savedContent, revision: record.revision }
                  : page,
              ),
            );
          }
        }
      },
    });
    saveCoordinatorRef.current = { repo, coordinator };
    return coordinator;
  }, [repo]);

  /** Persist now (page switching, explicit save button, Ctrl+S). */
  const saveCurrentPage = useCallback(async () => {
    await getSaveCoordinator().saveNow();
  }, [getSaveCoordinator]);

  /** Debounced autosave entry — every content mutation funnels here. */
  const scheduleSave = useCallback(() => {
    getSaveCoordinator().schedule(AUTOSAVE_DELAY_MS);
  }, [getSaveCoordinator]);

  /** Re-attempt after a failed save. */
  const retrySave = useCallback(() => {
    void getSaveCoordinator().retry();
  }, [getSaveCoordinator]);

  useEffect(() => {
    return () => {
      saveCoordinatorRef.current?.coordinator.cancelScheduled();
    };
  }, []);

  useEffect(() => {
    // A tab that is hidden or closed must not lose the last stroke.
    const flush = () => {
      void getSaveCoordinator().saveNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [getSaveCoordinator]);

  // 🏷️ أسماء الصفحات (اختيارية) — بتتخزن في الدفتر وتظهر في الـ thumbnails.
  const [pageNames, setPageNames] = useState<Record<string, string>>({});
  const pageNamesRef = useRef<Record<string, string>>({});

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
        pageNames: pageNamesRef.current,
      });
      await repo.saveNotebook(record);
      return record;
    },
    [repo],
  );

  /** 🏷️ إعادة تسمية الصفحة — الاسم يظهر في الـ thumbnails والبحث. */
  const renamePage = useCallback(
    async (pageId: string) => {
      const nbId = notebookIdRef.current;
      if (!nbId || !repo.canWrite) return;
      const current = pageNamesRef.current[pageId] ?? "";
      const next = window.prompt("اسم الصفحة (اتركه فاضي لمسحه):", current);
      if (next === null) return; // إلغاء
      const trimmed = next.trim().slice(0, 80);
      const names = { ...pageNamesRef.current };
      if (trimmed) names[pageId] = trimmed;
      else delete names[pageId];
      pageNamesRef.current = names;
      setPageNames(names);
      await saveNotebookRecord(
        nbId,
        pages.map((page) => page.id),
        currentPageIdRef.current,
        notebookTitle,
      );
    },
    [notebookTitle, pages, repo, saveNotebookRecord],
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
      multiSelRef.current.clear();
      setMultiCount(0);
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
      multiSelRef.current.clear();
      setMultiCount(0);
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
          setMessage(
            "الدفتر ده مش موجود على الجهاز ده — دفاترك متخزنة محلياً في المتصفح، فالرابط لو اتفتح من جهاز أو متصفح تاني مش هيلاقي الدفتر. افتح «دفاتري» واختار دفترك من هناك.",
          );
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
        // 🏷️ أسماء الصفحات المحفوظة في الدفتر.
        const names = boot.notebook.pageNames ?? {};
        pageNamesRef.current = names;
        setPageNames(names);
        // 🎯 وصلنا من نتيجة بحث عالمي؟ (?page=<pageId>) — افتحها بدل اللي اتحفظ.
        const targetPageId = new URLSearchParams(window.location.search).get("page");
        const target = targetPageId ? uiPages.find((page) => page.id === targetPageId) : null;
        activatePage(target ?? active, uiPages, boot.notebook.id, boot.notebook.title);
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
      multiSelRef.current.clear();
      setMultiCount(0);
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
      // 📄 كوتة الصفحات اليومية (free = 10/يوم) — طلب رصيد قبل الإنشاء.
      // الأوفلاين = fail-open (شوف lib/notes/page-quota.ts).
      const quota = await requestPageCredits(1);
      if (!quota.allowed) {
        setSaveStatus("idle");
        setMessage(pageQuotaBlockedMessage(quota));
        return;
      }
      trackPageQuota(quota);

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
      multiSelRef.current.clear();
      setMultiCount(0);
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
    trackPageQuota,
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
      multiSelRef.current.clear();
      setMultiCount(0);
      syncHistory();
      paint();
      setSaveStatus("saved");
      // ↩ الصفحة المحذوفة بترجّع رصيدها اليومي (لو اتستهلك في الجلسة دي).
      const creditKey = pageCreditKeysRef.current.pop();
      if (creditKey) {
        void refundPageCredit(creditKey).then(() => {
          // حدّث الشريط من الـ snapshot بعد الـ refund.
          void (async () => {
            try {
              const res = await fetch("/api/notes/page-quota");
              const data = await res.json().catch(() => null);
              if (res.ok && data?.ok && typeof data.limit === "number" && data.limit >= 0) {
                setPageQuota({ used: data.used ?? 0, limit: data.limit });
              }
            } catch {
              /* الشريط يفضل بالقديم */
            }
          })();
        });
      }
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
      // 📄 كوتة الصفحات — التكرار بيستنفد رصيد صفحة جديدة كمان.
      const dupQuota = await requestPageCredits(1);
      if (!dupQuota.allowed) {
        setSaveStatus("idle");
        setMessage(pageQuotaBlockedMessage(dupQuota));
        return;
      }
      trackPageQuota(dupQuota);

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
      multiSelRef.current.clear();
      setMultiCount(0);
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
    trackPageQuota,
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
    multiSelRef.current.clear();
    setMultiCount(0);
    commitHistory();
  }, [canWrite, commitHistory, setContent]);

  const deleteSelection = useCallback(() => {
    const content = contentRef.current;
    // 🪢 حذف المجموعة المحددة بالحبل أولاً.
    if (multiSelRef.current.size > 0) {
      const ids = multiSelRef.current;
      setContent({
        strokes: content.strokes.filter((stroke) => !ids.has(stroke.id)),
        texts: content.texts.filter((text) => !ids.has(text.id)),
        images: content.images.filter((image) => !ids.has(image.id)),
      });
      ids.clear();
      setMultiCount(0);
      selectionRef.current = null;
      setSelection(null);
      commitHistory();
      return;
    }
    const current = selectionRef.current;
    if (!current || !canWrite) return;
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
    multiSelRef.current.clear();
    setMultiCount(0);
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

  // ---- Lasso multi-select + clipboard helpers ----

  /** نسخ أصلية لكل العناصر المحددة — أساس سحب المجموعة والنسخ. */
  const collectMultiOriginals = useCallback(
    (content: PageContent): Map<string, Stroke | NoteText | NoteImage> => {
      const originals = new Map<string, Stroke | NoteText | NoteImage>();
      for (const stroke of content.strokes) {
        if (!multiSelRef.current.has(stroke.id)) continue;
        originals.set(stroke.id, { ...stroke, points: stroke.points.map((point) => [...point] as [number, number]) });
      }
      for (const text of content.texts) {
        if (!multiSelRef.current.has(text.id)) continue;
        originals.set(text.id, { ...text });
      }
      for (const image of content.images) {
        if (!multiSelRef.current.has(image.id)) continue;
        originals.set(image.id, { ...image });
      }
      return originals;
    },
    [],
  );

  /** إنهاء الحبل: بنحدد كل العناصر اللي المسار لمسها. */
  const finishLasso = useCallback(() => {
    const path = lassoPathRef.current;
    lassoPathRef.current = null;
    if (!path || path.length < 3) {
      multiSelRef.current.clear();
      setMultiCount(0);
      selectionRef.current = null;
      setSelection(null);
      paint();
      return;
    }
    const content = contentRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    const ids = new Set<string>();
    for (const stroke of content.strokes) {
      if (stroke.points.some((point) => pointInPolygon(point, path))) ids.add(stroke.id);
    }
    for (const image of content.images) {
      if (polygonTouchesRect(path, image)) ids.add(image.id);
    }
    for (const text of content.texts) {
      const bounds = ctx ? textBounds(ctx, text) : {
        x: text.x,
        y: text.y,
        width: text.size * Math.max(...text.text.split("\n").map((line) => line.length), 1) * 0.55,
        height: text.size * 1.5 * text.text.split("\n").length,
      };
      if (polygonTouchesRect(path, bounds)) ids.add(text.id);
    }
    multiSelRef.current = ids;
    setMultiCount(ids.size);
    selectionRef.current = null;
    setSelection(null);
    paint();
  }, [paint]);

  /** ▦ إدراج جدول — خطوط مستقيمة (strokes) تكوّن الشبكة، فتفضل قابلة
   *  للتحريك والمسح والتحديد زي أي عنصر تاني على الصفحة. */
  const insertTable = useCallback(() => {
    if (!canWrite) return;
    const spec = window.prompt("عدد الصفوف × الأعمدة (مثال: 4x3):", "4x3");
    if (!spec) return;
    const match = /^(\d{1,2})\s*[x×✕*]\s*(\d{1,2})$/.exec(spec.trim());
    if (!match) {
      setMessage("اكتب الأبعاد بالشكل ده: 4x3 (صفوف × أعمدة).");
      return;
    }
    const rows = Math.max(1, Math.min(20, Number(match[1])));
    const cols = Math.max(1, Math.min(12, Number(match[2])));

    const canvas = canvasRef.current;
    const viewWidth = canvas ? canvas.width / dprRef.current : PAGE_WIDTH;
    const viewHeight = canvas ? canvas.height / dprRef.current : PAGE_HEIGHT;
    const pan = panRef.current;
    const zoomLevel = zoomRef.current;
    // مركز الشاشة الحالي في إحداثيات الصفحة.
    const centerX = (viewWidth / 2 - pan.x) / zoomLevel;
    const centerY = (viewHeight / 2 - pan.y) / zoomLevel;

    const width = Math.min(cols * 110, PAGE_WIDTH - 96);
    const height = Math.min(rows * 56, PAGE_HEIGHT - 96);
    const left = Math.max(48, Math.min(centerX - width / 2, PAGE_WIDTH - width - 48));
    const top = Math.max(48, Math.min(centerY - height / 2, PAGE_HEIGHT - height - 48));

    const line = (points: Array<[number, number]>): Stroke => ({
      id: newId(),
      tool: "pen",
      shape: "line",
      color: color,
      thickness: 2,
      opacity: 1,
      points,
    });

    const strokes: Stroke[] = [];
    for (let r = 0; r <= rows; r++) {
      const y = top + (height * r) / rows;
      strokes.push(line([[left, y], [left + width, y]]));
    }
    for (let c = 0; c <= cols; c++) {
      const x = left + (width * c) / cols;
      strokes.push(line([[x, top], [x, top + height]]));
    }

    const content = contentRef.current;
    setContent({
      strokes: [...content.strokes, ...strokes],
      texts: content.texts,
      images: content.images,
    });
    // الجديد بيتحدد كله — تحركه/تمسحه/تكبّره ككتلة واحدة.
    multiSelRef.current = new Set(strokes.map((stroke) => stroke.id));
    setMultiCount(strokes.length);
    selectionRef.current = null;
    setSelection(null);
    paint();
    commitHistory();
    scheduleSave();
  }, [canWrite, color, commitHistory, paint, scheduleSave, setContent]);

  // ---- Copy / paste (بين الصفحات) ----

  /** ⧉ نسخ: المحدد الحالي (فردي أو مجموعة) إلى الحافظة الداخلية.
   *  الإحداثيات تبقى page coords — واللصق بيضيف إزاحة بسيطة. */
  const copySelection = useCallback(() => {
    const content = contentRef.current;
    const ids = new Set(multiSelRef.current);
    const current = selectionRef.current;
    if (current) ids.add(current.id);
    if (ids.size === 0) return;
    const copied: PageContent = {
      strokes: content.strokes
        .filter((stroke) => ids.has(stroke.id))
        .map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point] as [number, number]) })),
      texts: content.texts
        .filter((text) => ids.has(text.id))
        .map((text) => ({ ...text })),
      images: content.images
        .filter((image) => ids.has(image.id))
        .map((image) => ({ ...image })),
    };
    if (copied.strokes.length + copied.texts.length + copied.images.length === 0) return;
    clipboardRef.current = copied;
    setClipboardLoaded(true);
  }, []);

  /** 📋 لصق: عناصر الحافظة في الصفحة الحالية — بمعرفات جديدة وإزاحة.
   *  ده اللي بيتيح النسخ بين الصفحات: انسخ من صفحة، اتنقل، الصق. */
  const pasteClipboard = useCallback(() => {
    if (!canWrite) return;
    const clipboard = clipboardRef.current;
    if (!clipboard) return;
    const OFFSET = 24;
    const content = contentRef.current;
    const strokes = clipboard.strokes.map((stroke) => ({
      ...stroke,
      id: newId(),
      points: stroke.points.map((point) => [point[0] + OFFSET, point[1] + OFFSET] as [number, number]),
    }));
    const texts = clipboard.texts.map((text) => ({ ...text, id: newId(), x: text.x + OFFSET, y: text.y + OFFSET }));
    const images = clipboard.images.map((image) => ({ ...image, id: newId(), x: image.x + OFFSET, y: image.y + OFFSET }));
    // لو العناصر منصفحة تانية، اتأكد إن الصور متحملة قبل الرسم.
    const missing = images.map((image) => image.src);
    void ensureImagesLoaded(missing).then(() => paint());
    setContent({
      strokes: [...content.strokes, ...strokes],
      texts: [...content.texts, ...texts],
      images: [...content.images, ...images],
    });
    // المجموعة الجديدة بقت هي المحددة — تقدر تحركها فوراً.
    multiSelRef.current = new Set([...strokes.map((s) => s.id), ...texts.map((t) => t.id), ...images.map((i) => i.id)]);
    setMultiCount(multiSelRef.current.size);
    selectionRef.current = null;
    setSelection(null);
    paint();
    commitHistory();
    scheduleSave();
  }, [canWrite, commitHistory, ensureImagesLoaded, paint, scheduleSave, setContent]);

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

      // ✍️ أي دوس على الورقة أثناء كتابة Magic = إكمال فوري.
      if (inkAnimRef.current) inkAnimRef.current.cancelled = true;

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

      if (tool === "select" || tool === "lasso") {
        // 🪢 تحديد متعدد موجود + الضغط جوه الصندوق الموحّد = سحب المجموعة كلها.
        const multiRect = multiSelRef.current.size > 0 ? selectionRect() : null;
        if (multiRect && pointInRect(x, y, multiRect, 8)) {
          multiDragRef.current = {
            start: [x, y],
            originals: collectMultiOriginals(content),
          };
          return;
        }

        // 🪢 الحبل: من غير ما نلمس أي عنصر — بنبدأ مسار التحديد.
        if (tool === "lasso") {
          multiSelRef.current.clear();
          setMultiCount(0);
          selectionRef.current = null;
          setSelection(null);
          lassoPathRef.current = [[x, y]];
          paint();
          return;
        }

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

        // ضغطة على عنصر بره مجموعة التحديد = تحديد فردي جديد (بمسح المجموعة).
        const startSingleDrag = (kind: "image" | "text" | "stroke", id: string, original: Stroke | NoteText | NoteImage) => {
          if (multiSelRef.current.size > 0) {
            multiSelRef.current.clear();
            setMultiCount(0);
          }
          selectElement({ kind, id } as Selection);
          dragRef.current = { kind, id, start: [x, y], original };
        };

        const imageIndex = imageAt(content.images, x, y, 4);
        if (imageIndex >= 0) {
          const image = content.images[imageIndex];
          startSingleDrag("image", image.id, { ...image });
          return;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const textIndex = textAt(content.texts, x, y, ctx, 6);
          if (textIndex >= 0) {
            const text = content.texts[textIndex];
            // ✏️ ضغطة تانية على النص **المحدد فعلًا** = فتح المحرر فورًا
            // (زي PowerPoint) — بدل ما الضغطة تحرك النص وما تقدرش تعدله.
            if (selectionRef.current?.kind === "text" && selectionRef.current.id === text.id) {
              openTextEditor({ id: text.id, x: text.x, y: text.y, value: text.text });
              // 🎨 المحرر بيورث خصايص النص الموجود — مش قيم الأدوات العامة.
              setTextSize(text.size);
              setTextFont(text.font ?? FONT_OPTIONS[0].id);
              setColor(text.color);
              return;
            }
            startSingleDrag("text", text.id, { ...text });
            return;
          }
        }

        const strokeIndex = strokeAt(content.strokes, x, y, ERASER_TOLERANCE);
        if (strokeIndex >= 0) {
          const stroke = content.strokes[strokeIndex];
          startSingleDrag("stroke", stroke.id, { ...stroke, points: stroke.points.map((point) => [...point] as [number, number]) });
          return;
        }

        if (multiSelRef.current.size > 0) {
          multiSelRef.current.clear();
          setMultiCount(0);
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
      collectMultiOriginals,
      color,
      openTextEditor,
      opacity,
      paint,
      selectElement,
      setContent,
      selectionRect,
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

      // 🪢 سحب المجموعة المحددة بالحبل — كل العناصر المحددة تتحرك مع بعض.
      const multiDrag = multiDragRef.current;
      if (multiDrag) {
        const [x, y] = toPagePoint(event.clientX, event.clientY);
        const dx = x - multiDrag.start[0];
        const dy = y - multiDrag.start[1];
        if (dx !== 0 || dy !== 0) movedRef.current = true;
        const content = contentRef.current;
        contentRef.current = {
          strokes: content.strokes.map((stroke) => {
            const original = multiDrag.originals.get(stroke.id);
            if (!original || !("points" in original)) return stroke;
            return {
              ...stroke,
              points: (original as Stroke).points.map((point) => [point[0] + dx, point[1] + dy]),
            };
          }),
          texts: content.texts.map((text) => {
            const original = multiDrag.originals.get(text.id);
            if (!original || !("text" in original)) return text;
            return { ...text, x: (original as NoteText).x + dx, y: (original as NoteText).y + dy };
          }),
          images: content.images.map((image) => {
            const original = multiDrag.originals.get(image.id);
            if (!original || !("src" in original)) return image;
            return { ...image, x: (original as NoteImage).x + dx, y: (original as NoteImage).y + dy };
          }),
        };
        paint();
        return;
      }

      // 🪢 الحبل — بنمد المسار مع كل حركة.
      if (lassoPathRef.current) {
        const [x, y] = toPagePoint(event.clientX, event.clientY);
        lassoPathRef.current.push([x, y]);
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

    if (multiDragRef.current) {
      multiDragRef.current = null;
      if (movedRef.current) {
        movedRef.current = false;
        commitHistory();
        scheduleSave();
      }
      return;
    }

    // 🪢 إنهاء الحبل — بنحدد العناصر اللي المسار لمسها.
    if (lassoPathRef.current) {
      finishLasso();
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
  }, [commitHistory, finishLasso, paint, scheduleSave, selectElement]);

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
        setTextSize(text.size);
        setTextFont(text.font ?? FONT_OPTIONS[0].id);
        setColor(text.color);
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
      if (mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteClipboard();
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
      if (event.key.toLowerCase() === "f") setFocusMode((value) => !value);
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
  }, [cancelTextDraft, copySelection, deleteSelection, pasteClipboard, redo, saveCurrentPage, selectElement, undo, zoomAt]);

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

  // ---- PDF import ----

  /** 📤 مشاركة الدفتر كلل قراءة — بيبنى snapshot خفيف وبيوجّه لينك عام. */
  const createShareLink = useCallback(async () => {
    setShareBusy(true);
    setShareError(null);
    setShareLink(null);
    try {
      const payload = {
        pages: pages.map((page) => ({
          id: page.id,
          template: page.template,
          content: page.content,
        })),
      };
      const res = await fetch("/api/notes/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: notebookTitle, payload, pageCount: pages.length }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.shareId) {
        setShareError(data?.error?.message ?? "مقدرناش نعمل لينك المشاركة.");
        return;
      }
      setShareLink(`${window.location.origin}/notes-shared/${data.shareId}`);
    } catch (error) {
      console.error("[notes] share failed", error);
      setShareError("مقدرناش نعمل لينك المشاركة — جرّب تاني.");
    } finally {
      setShareBusy(false);
    }
  }, [notebookTitle, pages]);

  /** يفتح ملف PDF (محلي أو من «ملفاتي») ويعرض اختيار النطاق. */
  const openPdfImport = useCallback(
    async (getDoc: () => Promise<File>, libraryFile: {
      fileId: string;
      fileName: string;
      url: string;
    } | null) => {
      if (!canWrite) return;
      try {
        setSaveStatus("idle");
        setPdfProgress("بنقرا الملف…");
        setPdfImportOpen(true);
        const file = await getDoc();
        const doc = await loadPdfDocument(file);
        const count = doc.numPages;
        doc.destroy();
        if (count < 1) {
          setPdfImportOpen(false);
          setMessage("الملف ده مفيهوش صفحات مقروءة.");
          return;
        }
        setPdfLibraryFile(libraryFile);
        setPdfPageCount(count);
        setPdfFrom(1);
        setPdfTo(Math.min(count, Math.min(10, MAX_PDF_PAGES_PER_IMPORT)));
        setPdfProgress(null);
      } catch (error) {
        console.error("[notes] pdf open failed", error);
        setPdfImportOpen(false);
        setPdfProgress(null);
        setMessage("مقدرناش نقرا ملف الـ PDF — لو ملف مفقولح، جرّب ملف تاني.");
      }
    },
    [canWrite, setSaveStatus],
  );

  const handlePdfFile = useCallback(
    (file: File) => openPdfImport(() => Promise.resolve(file), null),
    [openPdfImport],
  );

  /** استيراد PDF من مكتبة «ملفاتي» — بيجيب رابط موقّع من السيرفر. */
  const handlePdfFromLibrary = useCallback(
    async (fileId: string, fileName: string) => {
      setPdfProgress("بيجهّز الملف من مكتبتك…");
      try {
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setPdfProgress(null);
          setMessage(data?.error?.message || "مقدرناش نجيب الملف من مكتبتك.");
          return;
        }
        const url = data.url as string;
        await openPdfImport(async () => {
          const blob = await (await fetch(url)).blob();
          return new File([blob], fileName, { type: "application/pdf" });
        }, { fileId, fileName, url });
      } catch (error) {
        console.error("[notes] pdf from library failed", error);
        setPdfProgress(null);
        setMessage("مقدرناش نجيب الملف من مكتبتك.");
      }
    },
    [openPdfImport],
  );

  /** 📥 استيراد أي ملف من «ملفاتي» كصفحة جديدة في الدفتر الحالي:
   *  PDF → منتقي النطاق الموجود، صورة → خلفية صفحة، docx/نص → نص مطبوع. */
  const importLibraryEntry = useCallback(
    async (entry: { id: string; file_name: string; file_type: string }) => {
      if (!canWrite) return;
      const nbId = notebookIdRef.current;
      if (!nbId || !repo.canWrite) return;

      // 📄 PDF يمشي في المسار القديم (منتقي النطاق).
      if (entry.file_type === "pdf") {
        await handlePdfFromLibrary(entry.id, entry.file_name);
        return;
      }
      const isImage = entry.file_type === "image" || entry.file_type.startsWith("image/");
      const isText = entry.file_type === "text" || entry.file_type === "docx" || entry.file_type === "word";
      if (!isImage && !isText) {
        setMessage("الاستيراد للنوته بيدعم PDF وصورة وWord وملفات نصية — الملف ده نوعه مش مدعوم.");
        return;
      }

      setMessage("بيجهّز الملف من مكتبتك…");
      try {
        // 🔗 رابط قراءة موقّع من السيرفر.
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileId: entry.id }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setMessage(data?.error?.message || "مقدرناش نجيب الملف من مكتبتك.");
          return;
        }
        const blob = await (await fetch(data.url as string)).blob();

        // 📄 كوتة الصفحات: استيراد الملف بيستهلك صفحة واحدة.
        const pageQuota = await requestPageCredits(1);
        if (!pageQuota.allowed) {
          setMessage(pageQuotaBlockedMessage(pageQuota));
          return;
        }
        trackPageQuota(pageQuota);

        let snapshot: unknown;
        if (isImage) {
          // 🖼️ صورة → خلفية الصفحة (fit A4 + تصغير للحد الأقصى).
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const element = new Image();
          element.src = dataUrl;
          await new Promise<void>((resolve, reject) => {
            element.onload = () => resolve();
            element.onerror = () => reject(new Error("image load failed"));
          });
          const largest = Math.max(element.naturalWidth, element.naturalHeight);
          const scale = largest > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largest : 1;
          const fit = Math.min(PAGE_WIDTH / element.naturalWidth, PAGE_HEIGHT / element.naturalHeight);
          let src = dataUrl;
          if (scale < 1) {
            const offscreen = document.createElement("canvas");
            offscreen.width = Math.round(element.naturalWidth * scale);
            offscreen.height = Math.round(element.naturalHeight * scale);
            const ctx = offscreen.getContext("2d");
            if (ctx) {
              ctx.drawImage(element, 0, 0, offscreen.width, offscreen.height);
              src = offscreen.toDataURL("image/jpeg", 0.85);
            }
          }
          const noteImage: NoteImage = {
            id: newId(),
            kind: "image",
            src,
            x: 0,
            y: 0,
            width: Math.round(element.naturalWidth * fit),
            height: Math.round(element.naturalHeight * fit),
          };
          snapshot = pageContentStrokes("blank", [], [], [noteImage]);
        } else {
          // 📝 docx/نص → استخراج النص وإدراجه كبلوكات مطبوعة.
          let text = "";
          if (entry.file_type === "docx" || entry.file_type === "word") {
            const mammoth = await import("mammoth/mammoth.browser");
            const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
            text = result.value;
          } else {
            text = await blob.text();
          }
          const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 60);
          if (lines.length === 0) {
            setMessage("الملف ده مفيهوش نص مقروء.");
            return;
          }
          const texts: NoteText[] = lines.map((line, index) => ({
            id: newId(),
            kind: "text",
            text: line,
            x: 40,
            y: 72 + index * 34,
            size: 20,
            color: "#111827",
          }));
          snapshot = pageContentStrokes("blank", [], texts, []);
        }

        // 📄 إنشاء الصفحة الجديدة وفتحها.
        const pageId = newId();
        const record = buildEmptyPage({
          ownerId: repo.ownerId,
          notebookId: nbId,
          pageId,
          template: "blank",
          now: nowIso(),
          persistedSnapshot: snapshot,
        });
        await repo.savePage(record);
        const imported: UiPage = {
          id: pageId,
          template: "blank",
          content: {
            strokes: [],
            texts: (snapshot as { texts?: NoteText[] }).texts ?? [],
            images: (snapshot as { images?: NoteImage[] }).images ?? [],
          },
          revision: record.revision,
        };
        const nextPages = [...pages, imported];
        await saveNotebookRecord(
          nbId,
          nextPages.map((page) => page.id),
          pageId,
          notebookTitle,
        );
        setPages(nextPages);
        setCurrentPageId(pageId);
        currentPageIdRef.current = pageId;
        templateRef.current = "blank";
        setTemplateState("blank");
        contentRef.current = emptyPageContent();
        historyRef.current.reset(contentRef.current);
        setSelection(null);
        selectionRef.current = null;
        multiSelRef.current.clear();
        setMultiCount(0);
        syncHistory();
        paint();
        setSaveStatus("saved");
        setMessage(null);
      } catch (error) {
        console.error("[notes] library import failed", error);
        setMessage("فشل استيراد الملف — جرّب تاني.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, notebookTitle, pages, paint, repo, saveNotebookRecord, setSaveStatus, syncHistory, trackPageQuota],
  );

  /** استيراد عبر رابط موقّع مباشر — بيستخدمه ?importFile= من صفحة «ملفاتي».
   *  بيقبل PDF وصورة وdocx/نص — مش PDF بس. */
  const importFromLibraryParam = useCallback(
    async (fileId: string) => {
      // بيجيب اسم الملف ونوعه من قايمة المكتبة.
      const res = await fetch("/api/files");
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data?.ok) return;
      const match = (data.files as Array<{ id: string; file_name: string; file_type: string }>).find(
        (entry) => entry.id === fileId,
      );
      if (!match) {
        setMessage("الملف ده مش موجود في مكتبتك.");
        return;
      }
      await importLibraryEntry(match);
    },
    [importLibraryEntry],
  );

  // ?importFile=<id> — زر «للنوته» في «ملفاتي» بيفتح الاستيراد فوراً.
  const handledImportParamRef = useRef(false);
  useEffect(() => {
    if (handledImportParamRef.current) return;
    if (typeof window === "undefined") return;
    const fileId = new URLSearchParams(window.location.search).get("importFile");
    if (!fileId) return;
    handledImportParamRef.current = true;
    // نظّف الرابط عشان الريفريش ما يفتحش الاستيراد تاني، وبنأجّل الاستيراد
    // ما بعد الـ effect عشان متعملش setState متزامن (قاعدة react-hooks).
    window.history.replaceState(null, "", window.location.pathname);
    const timer = setTimeout(() => {
      void importFromLibraryParam(fileId);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [importFromLibraryParam]);

  // قايمة مكتبة «ملفاتي» — بتتجاب أول ما نحتاجها في منتقي الاستيراد.
  const loadPdfLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setPdfLibraryList([]);
        return;
      }
      setPdfLibraryList(
        (data.files as Array<{ id: string; file_name: string; file_type: string }>).filter(
          (entry) => entry.file_type === "pdf",
        ),
      );
    } catch {
      setPdfLibraryList([]);
    }
  }, []);

  const confirmPdfImport = useCallback(async () => {
    const nbId = notebookIdRef.current;
    if (!nbId || !repo.canWrite) return;
    const from = Math.max(1, Math.min(pdfFrom, pdfPageCount));
    const to = Math.max(from, Math.min(pdfTo, pdfPageCount, from + MAX_PDF_PAGES_PER_IMPORT - 1));
    const count = to - from + 1;

    setPdfBusy(true);
    try {
      // 📄 كوتة الصفحات: الاستيراد بيستهلك N صفحة من حد اليوم دفعة واحدة.
      const pageQuota = await requestPageCredits(count);
      if (!pageQuota.allowed) {
        setMessage(pageQuotaBlockedMessage(pageQuota));
        return;
      }
      trackPageQuota(pageQuota);

      // 📁 مصدر الاستيراد: ملف «ملفاتي» لو متختار، وإلا الملف المحلي.
      let file: File | undefined;
      if (pdfLibraryFile?.url) {
        const blob = await (await fetch(pdfLibraryFile.url)).blob();
        file = new File([blob], pdfLibraryFile.fileName, { type: "application/pdf" });
      } else {
        file = pdfInputRef.current?.files?.[0];
      }
      if (!file) {
        setMessage("اختار ملف الـ PDF الأول.");
        return;
      }
      const doc = await loadPdfDocument(file);

      const imported: UiPage[] = [];
      for (let number = from; number <= to; number += 1) {
        setPdfProgress(`بنستورد صفحة ${number - from + 1} من ${count}…`);
        const { image } = await renderPdfPageToImage(doc, number);
        const pageId = newId();
        const noteImage: NoteImage = { id: newId(), kind: "image", ...image };
        const record = buildEmptyPage({
          ownerId: repo.ownerId,
          notebookId: nbId,
          pageId,
          template: "blank",
          now: nowIso(),
          persistedSnapshot: pageContentStrokes("blank", [], [], [noteImage]),
        });
        await repo.savePage(record);
        imported.push({
          id: pageId,
          template: "blank",
          content: { strokes: [], texts: [], images: [noteImage] },
          revision: record.revision,
        });
      }
      doc.destroy();

      const nextPages = [...pages, ...imported];
      const lastImported = imported[imported.length - 1];
      await saveNotebookRecord(
        nbId,
        nextPages.map((page) => page.id),
        lastImported?.id ?? currentPageIdRef.current,
        notebookTitle,
      );

      setPages(nextPages);
      if (lastImported) {
        setCurrentPageId(lastImported.id);
        currentPageIdRef.current = lastImported.id;
        templateRef.current = "blank";
        setTemplateState("blank");
        contentRef.current = emptyPageContent();
        historyRef.current.reset(contentRef.current);
        setSelection(null);
        selectionRef.current = null;
        multiSelRef.current.clear();
        setMultiCount(0);
        syncHistory();
        paint();
      }
      setPdfImportOpen(false);
      setSaveStatus("saved");
      setMessage(null);
    } catch (error) {
      console.error("[notes] pdf import failed", error);
      setMessage("فشل استيراد الـ PDF — جرّب تاني.");
    } finally {
      setPdfBusy(false);
      setPdfProgress(null);
    }
  }, [
    notebookTitle,
    pages,
    paint,
    pdfFrom,
    pdfLibraryFile,
    pdfPageCount,
    pdfTo,
    repo,
    saveNotebookRecord,
    setSaveStatus,
    syncHistory,
    trackPageQuota,
  ]);

  // ---- Handwriting beautify ----

  // Render the side-by-side preview whenever the dialog opens or the
  // strength changes. The "original" side shows the pristine strokes when
  // the page was already beautified once.
  useEffect(() => {
    if (!beautifyOpen) return;
    const draw = (canvas: HTMLCanvasElement | null, strokes: readonly Stroke[]) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scale = canvas.width / PAGE_WIDTH;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      for (const stroke of strokes) {
        if (stroke.shape) paintShapeStroke(ctx, stroke);
        else paintStroke(ctx, stroke);
      }
    };
    const content = contentRef.current;
    const originals = content.originalStrokes?.length
      ? content.originalStrokes
      : content.strokes;
    draw(originalPreviewRef.current, originals);
    draw(
      beautifiedPreviewRef.current,
      beautifyStrokes(content.strokes, {
        strength: beautifyStrength,
        straightenRows: beautifyRows,
      }),
    );
  }, [beautifyOpen, beautifyStrength, beautifyRows, loaded]);

  const adoptBeautified = useCallback(() => {
    if (!canWrite) return;
    const content = contentRef.current;
    if (content.strokes.length === 0) {
      setBeautifyOpen(false);
      return;
    }
    const originals = content.originalStrokes?.length
      ? content.originalStrokes
      : content.strokes;
    const beautified = beautifyStrokes(content.strokes, {
      strength: beautifyStrength,
      straightenRows: beautifyRows,
    });
    setContent({ ...content, strokes: beautified, originalStrokes: originals });
    selectElement(null);
    commitHistory();
    setBeautifyOpen(false);
  }, [
    beautifyRows,
    beautifyStrength,
    canWrite,
    commitHistory,
    selectElement,
    setContent,
  ]);

  const revertToOriginal = useCallback(() => {
    if (!canWrite) return;
    const content = contentRef.current;
    if (!content.originalStrokes?.length) return;
    setContent({
      ...content,
      strokes: content.originalStrokes,
      originalStrokes: [],
    });
    selectElement(null);
    commitHistory();
    setBeautifyOpen(false);
  }, [canWrite, commitHistory, selectElement, setContent]);

  const activeStatePage = currentPageId ? pages.find((page) => page.id === currentPageId) : null;
  const hasOriginalStrokes = (activeStatePage?.content.originalStrokes?.length ?? 0) > 0;

  // ---- Derived UI ----

  const currentIndex = currentPageId
    ? pages.findIndex((page) => page.id === currentPageId)
    : -1;
  const { canUndo, canRedo } = historyState;
  const eraserActive = tool === "eraser";
  const showTextControls = tool === "text" || selection?.kind === "text";

  /** What the assistant sees: notebook title + the page's typed texts. */
  /** 🎴 نصوص المذاكرة: نصوص الصفحة الحالية — لو قليلة، بيجمع من الدفتر كله. */
  const getStudyTexts = useCallback(() => {
    const pageTexts = contentRef.current.texts
      .map((text) => text.text)
      .filter((line) => line.trim() !== "")
      .join("\n");
    if (pageTexts.trim().length >= 80) return pageTexts.slice(0, 6000);
    return pages
      .map((page) =>
        page.content.texts
          .map((text) => text.text)
          .filter((line) => line.trim() !== "")
          .join("\n"),
      )
      .filter((text) => text.trim() !== "")
      .join("\n\n")
      .slice(0, 6000);
  }, [pages]);

  const getEditorContext = useCallback(() => {
    const content = contentRef.current;
    const typed = content.texts
      .map((text) => text.text)
      .filter((line) => line.trim() !== "")
      .join("\n")
      .slice(0, 1800);
    return `دفتر: ${notebookTitle} — صفحة ${pages.length === 0 ? 1 : (pages.findIndex((page) => page.id === currentPageId) + 1) || 1}\n${typed || "(مفيش نصوص مكتوبة على الصفحة دي)"}`;
  }, [currentPageId, notebookTitle, pages]);

  /** 🎴 تحميل/حفظ ديك المذاكرة في meta store للدفتر. */
  const loadStudyDeck = useCallback(
    (key: string) => repo.getMeta(key) as Promise<never>,
    [repo],
  );
  const saveStudyDeck = useCallback(
    (key: string, deckValue: unknown) => repo.putMeta(key, deckValue),
    [repo],
  );

  /** ✂️ نص العنصر المحدد حالياً — بستخدمه في زر «اشرح المحدد». */
  const getSelectedText = useCallback(() => {
    const sel = selectionRef.current;
    if (!sel || sel.kind !== "text") return null;
    const text = contentRef.current.texts.find(
      (entry) => entry.id === sel.id,
    );
    return text?.text?.trim() ? text.text : null;
  }, []);

  /** 📸 لقطة نظيفة للصفحة الحالية (برسمها برة الشاشة من غير ما ناخد سكرين شوت من الواجهة). */
  const getCanvasSnapshot = useCallback(() => {
    const canvas = renderPageToCanvas(
      {
        id: currentPageIdRef.current ?? "",
        template: templateRef.current,
        content: contentRef.current,
        revision: 0,
      },
      1.5,
    );
    if (!canvas) return null;
    // JPEG أصغر بكتير من PNG — كفاية للـ vision وتحت حد 5 ميجا بسهولة.
    return canvas.toDataURL("image/jpeg", 0.85);
  }, [renderPageToCanvas]);

  /** 🔎 POC قراءة خط اليد: صورة الصفحة → vision → نص قابل للتعديل.
   *  تجريبي — الدقة بتعتمد على وضوح الخط، والأصل مش بيتمس. */
  const [handwritingBusy, setHandwritingBusy] = useState(false);
  // 📝 معاينة النص المقروء قبل الإدراج — الطالب يصحح أي غلط في القراءة.
  const [handwritingOpen, setHandwritingOpen] = useState(false);
  const [handwritingDraft, setHandwritingDraft] = useState("");
  const convertHandwriting = useCallback(async () => {
    if (!canWrite || handwritingBusy) return;
    const snapshot = getCanvasSnapshot();
    if (!snapshot?.startsWith("data:image/")) {
      setMessage("مقدرناش ناخد لقطة الصفحة — جرّب تاني.");
      return;
    }
    setHandwritingBusy(true);
    setSaveStatus("idle");
    try {
      // ⚠️ ممنوع fetch(dataUrl) — Firefox بيرمي «Failed to fetch» عليه.
      const blob = dataUrlToBlob(snapshot);
      if (!blob) {
        setMessage("مقدرناش نجهز لقطة الصفحة — جرّب تاني.");
        return;
      }
      const form = new FormData();
      form.append("file", blob, "page.jpg");
      form.append(
        "question",
        "دي صورة صفحة من دفتر طالب. اقرا خط اليد واكتب بالحرف كل اللي مكتوب فيه، سطر بسطر بنفس الترتيب، من غير أي تعليق أو ترقيم. رجّع النص فقط.",
      );
      const res = await fetch("/api/ai/image-analysis", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "فشل تحليل الصورة.");
      }
      const raw: string = typeof data?.result === "string" ? data.result : "";
      const text = raw.trim();
      if (!text) {
        setMessage("المساعد مش شايف نص مقروء في الصفحة.");
        return;
      }
      // 📝 معاينة قبل الإدراج — الطالب يصحح أي غلط في القراءة الأول.
      setHandwritingDraft(text);
      setHandwritingOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "فشل قراءة الخط. حاول تاني.");
    } finally {
      setHandwritingBusy(false);
    }
  }, [canWrite, getCanvasSnapshot, handwritingBusy]);

  /** إدراج النص المقروء على الصفحة — الأصل (خط الطالب) مش بيتمس أبداً. */
  /** 🤖 إدراج نص من الـ AI على الصفحة — بلوكات قابلة للتحريك والتعديل. */
  /** ✍️ محرك الكتابة التدريجية — النص بيكتب كلمة كلمة وسطر سطر ترتيبًا، والمخططات/الجداول تظهر في مكانها في التسلسل. */
  const inkAnimRef = useRef<{ cancelled: boolean; aborted: boolean } | null>(null);

  const animateInkInsert = useCallback(
    async (newTexts: NoteText[], newImages: NoteImage[], newStrokes: Stroke[], doneMessage: string) => {
      if (!canWrite || newTexts.length + newImages.length === 0) return;
      if (inkAnimRef.current) inkAnimRef.current.cancelled = true;
      const token = { cancelled: false, aborted: false };
      inkAnimRef.current = token;

      const startPageId = currentPageIdRef.current;
      const content = contentRef.current;
      const imageById = new Map(newImages.map((image) => [image.id, image]));
      const strokeById = new Map(newStrokes.map((stroke) => [stroke.id, stroke]));
      // السطور بتتضاف فاضية وبتتملى كلمة كلمة أمام الطالب.
      let working: PageContent = {
        strokes: content.strokes,
        texts: [...content.texts, ...newTexts.map((text) => ({ ...text, text: "" }))],
        images: content.images,
      };
      setContent(working);

      const stages: InkRevealStage[] = buildInkRevealStages(newTexts, newImages, newStrokes);
      const wordTick = inkDelayMs(stages.filter((stage) => stage.kind === "text").length);
      const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      for (const stage of stages) {
        if (token.cancelled || token.aborted) break;
        if (currentPageIdRef.current !== startPageId) {
          token.aborted = true;
          break;
        }
        await tick(stage.kind === "text" ? wordTick : 140);
        if (token.cancelled || token.aborted) break;
        if (stage.kind === "text") {
          working = {
            ...working,
            texts: working.texts.map((text) =>
              text.id === stage.id ? { ...text, text: stage.value } : text,
            ),
          };
        } else if (stage.kind === "image") {
          const image = imageById.get(stage.id);
          if (image) working = { ...working, images: [...working.images, image] };
        } else {
          const stroke = strokeById.get(stage.id);
          if (stroke) working = { ...working, strokes: [...working.strokes, stroke] };
        }
        setContent(working);
      }

      if (token.aborted) {
        inkAnimRef.current = null;
        return;
      }

      // المحتوى النهائي — بيغطّي حالة الإسقاط (الطالب دوس أثناء الكتابة).
      const finalContent: PageContent = {
        strokes: [...content.strokes, ...newStrokes],
        texts: [...content.texts, ...newTexts],
        images: [...content.images, ...newImages],
      };
      contentRef.current = finalContent;
      multiSelRef.current = new Set([
        ...newTexts.map((text) => text.id),
        ...newImages.map((image) => image.id),
      ]);
      setMultiCount(newTexts.length + newImages.length);
      selectionRef.current = null;
      setSelection(null);
      paint();
      commitHistory();
      scheduleSave();
      setMessage(doneMessage);
      inkAnimRef.current = null;
    },
    [canWrite, commitHistory, paint, scheduleSave, setContent],
  );

  /** 🧠 إدراج نص من الـ AI على الصفحة — معلّف مرتّب بحافة يمينى واحدة وبيكتب كلمة كلمة. */
  const insertAiText = useCallback(
    (text: string) => {
      if (!canWrite) return;
      const clean = text.trim();
      if (!clean) return;
      const size = 20;
      const maxWidth = PAGE_WIDTH - 128;
      const lines = wrapAiText(clean, size, maxWidth)
        .slice(0, 60)
        .map((line) => line.trim());
      const blocks: NoteText[] = lines.map((line, index) => ({
        id: newId(),
        kind: "text",
        text: line,
        x: PAGE_WIDTH - 64,
        y: 72 + index * size * 1.55,
        size,
        color: "#111827",
      }));
      void animateInkInsert(
        blocks,
        [],
        [],
        `Magic كتب ${blocks.length} سطر على الصفحة — عدّلهم براحتك.`,
      );
    },
    [animateInkInsert, canWrite],
  );

  /** ✅ Magic Write — إدراج بلوكات منظّمة (نصوص + صور مخططات + خطوط جداول) كعناصر حقيقية بكتابة تدريجية. */
  const insertAiBlocks = useCallback(
    (applied: AiLayoutResult) => {
      if (!canWrite) return;
      const added = applied.texts.length + applied.images.length;
      if (added === 0) return;
      void animateInkInsert(
        applied.texts,
        applied.images,
        applied.strokes,
        applied.clipped
          ? "Magic كتب المحتوى على الصفحة — في بلوكات زائدة ما اتّسعت، قلّل المحدد وجرّب تاني."
          : `Magic كتب ${added} عنصر على الصفحة — عدّلهم براحتك.`,
      );
    },
    [animateInkInsert, canWrite],
  );

  const insertAiImage = useCallback(
    (dataUrl: string) => {
      if (!canWrite || !dataUrl.startsWith("data:image/")) return;
      const content = contentRef.current;
      const element = new Image();
      element.onload = () => {
        // نلزّق الرسمة في نص الصفحة بمقاس معقول (fit داخل A4).
        const natural = Math.max(element.naturalWidth, element.naturalHeight) || 1;
        const scale = Math.min(1, Math.min(PAGE_WIDTH - 80, PAGE_HEIGHT - 260) / natural);
        const width = Math.round(element.naturalWidth * scale);
        const height = Math.round(element.naturalHeight * scale);
        const noteImage: NoteImage = {
          id: newId(),
          kind: "image",
          src: dataUrl,
          x: Math.round((PAGE_WIDTH - width) / 2),
          y: 120,
          width,
          height,
        };
        setContent({
          strokes: content.strokes,
          texts: content.texts,
          images: [...content.images, noteImage],
        });
        selectionRef.current = { kind: "image", id: noteImage.id };
        setSelection({ kind: "image", id: noteImage.id });
        multiSelRef.current.clear();
        setMultiCount(0);
        paint();
        commitHistory();
        scheduleSave();
        setMessage("الرسمة اتحطت في نص الصفحة — تكبّر/تصغّر وتحركها براحتك.");
      };
      element.onerror = () => setMessage("مقدرناش نحط الرسمة على الصفحة.");
      element.src = dataUrl;
    },
    [canWrite, commitHistory, paint, scheduleSave, setContent],
  );

  /** ✅ Magic Write dialog — الموضوع المبدئي من النص المحدد. */
  const [magicWriteOpen, setMagicWriteOpen] = useState(false);
  const [magicWriteTopic, setMagicWriteTopic] = useState("");
  const openMagicWrite = useCallback(() => {
    if (!canWrite) return;
    const selected = getSelectedText();
    setMagicWriteTopic(selected?.trim().slice(0, 4000) ?? "");
    setMagicWriteOpen(true);
  }, [canWrite, getSelectedText]);

  /** 🎨 تنسيق مباشر للعناصر المحددة — لون/حجم/نوع خط بيتطبق فورًا على النص (واللون على الأشكال) المحدد. */
  const applySelectionStyle = useCallback(
    (style: { color?: string; size?: number; font?: string }) => {
      if (!canWrite) return;
      const targets = new Set<string>();
      const sel = selectionRef.current;
      if (sel) targets.add(sel.id);
      multiSelRef.current.forEach((id) => targets.add(id));
      if (targets.size === 0) return;
      const content = contentRef.current;
      const patchText = (text: NoteText): NoteText => ({
        ...text,
        ...(style.color ? { color: style.color } : {}),
        ...(style.size ? { size: style.size } : {}),
        ...(style.font ? { font: style.font } : {}),
      });
      const texts = content.texts.map((text) => (targets.has(text.id) ? patchText(text) : text));
      const strokes = style.color
        ? content.strokes.map((stroke) => (targets.has(stroke.id) ? { ...stroke, color: style.color! } : stroke))
        : content.strokes;
      setContent({ ...content, texts, strokes });
      commitHistory();
    },
    [canWrite, commitHistory, setContent],
  );

  const applyColor = useCallback(
    (value: string) => {
      setColor(value);
      applySelectionStyle({ color: value });
    },
    [applySelectionStyle],
  );
  const applyTextFont = useCallback(
    (value: string) => {
      setTextFont(value);
      applySelectionStyle({ font: value });
    },
    [applySelectionStyle],
  );
  const applyTextSize = useCallback(
    (value: number) => {
      const clamped = clamp(Math.round(value), 12, 96);
      setTextSize(clamped);
      applySelectionStyle({ size: clamped });
    },
    [applySelectionStyle],
  );

  // 🎨 لما الطالب يحدد نص — الأدوات بتعكس خصايصه (لونه، حجمه، نوع خطه) بدل القيم العامة.
  useEffect(() => {
    if (selection?.kind !== "text" || multiCount > 0) return;
    const element = contentRef.current.texts.find((text) => text.id === selection.id);
    if (!element) return;
    setTextSize(element.size);
    setTextFont(element.font ?? FONT_OPTIONS[0].id);
    setColor(element.color);
  }, [selection]);

  /** 📁 رفع ملف على النوته مباشرة — يوزع حسب النوع:
   *  صورة → عنصر صورة على الصفحة · PDF → منتقي صفحات الخلفية ·
   *  Word/نص → استخراج النص ودرجه بلوكات قابلة للتعديل. */
  const handleDirectFile = useCallback(
    async (file: File) => {
      if (!canWrite) return;
      const type = file.type.toLowerCase();
      const name = file.name.toLowerCase();

      if (type.startsWith("image/")) {
        await insertImageFile(file);
        return;
      }

      if (type === "application/pdf" || name.endsWith(".pdf")) {
        handlePdfFile(file);
        return;
      }

      if (type.includes("word") || name.endsWith(".docx") || name.endsWith(".doc")) {
        try {
          const mammoth = await import("mammoth/mammoth.browser");
          const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
          const text = result.value?.trim();
          if (!text) {
            setMessage("ملف الـ Word ده مفيهوش نص مقروء.");
            return;
          }
          insertAiText(text);
        } catch {
          setMessage("مقدرناش نقرا ملف الـ Word — جرّب تاني.");
        }
        return;
      }

      if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) {
        try {
          const text = (await file.text()).trim();
          if (!text) {
            setMessage("الملف فاضي.");
            return;
          }
          insertAiText(text);
        } catch {
          setMessage("مقدرناش نقرا الملف — جرّب تاني.");
        }
        return;
      }

      setMessage("النوع ده مش مدعوم على النوته — صورة أو PDF أو Word أو نص.");
    },
    [canWrite, handlePdfFile, insertAiText, insertImageFile],
  );

  const insertHandwritingText = useCallback(
    (mode: "lines" | "block") => {
      if (!canWrite) return;
      const text = handwritingDraft.trim();
      if (!text) return;
      const content = contentRef.current;
      let newBlocks: NoteText[] = [];
      if (mode === "block") {
        // بلوك واحد متعدد الأسطر — يتحرك ويعدل كقطعة واحدة.
        newBlocks = [{
          id: newId(),
          kind: "text",
          text,
          x: PAGE_WIDTH - 64,
          y: 72,
          size: 18,
          color: "#2563eb",
        }];
      } else {
        // سطر بسطر — كل سطر بلوك مستقل من ناحية اليمين (RTL).
        const lines = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 60);
        const startX = PAGE_WIDTH - 64;
        const startY = 72;
        const lineHeight = 34;
        newBlocks = lines.map((line, index) => ({
          id: newId(),
          kind: "text",
          text: line,
          x: Math.max(24, startX - line.length * 9),
          y: startY + index * lineHeight,
          size: 20,
          color: "#2563eb",
        }));
      }
      setContent({
        strokes: content.strokes,
        texts: [...content.texts, ...newBlocks],
        images: content.images,
      });
      multiSelRef.current = new Set(newBlocks.map((block) => block.id));
      setMultiCount(newBlocks.length);
      selectionRef.current = null;
      setSelection(null);
      paint();
      commitHistory();
      scheduleSave();
      setHandwritingOpen(false);
      setHandwritingDraft("");
      setMessage(
        mode === "block"
          ? "النص اتدرج كبلوك واحد أزرق — عدّله وحركه براحتك، وخطك الأصلي محفوظ."
          : `اتدرج ${newBlocks.length} سطر كبلوكات أزرق — عدّل أي واحد، وخطك الأصلي محفوظ.`,
      );
    },
    [canWrite, commitHistory, handwritingDraft, paint, scheduleSave, setContent],
  );


  /** Text blocks across the whole notebook matching the search query. */
  const searchResults = useMemo(() => {
    const needle = query.trim();
    if (needle === "") return [];
    return pages.flatMap((page, pageIndex) => {
      const results = page.content.texts
        .filter((text) => text.text.includes(needle))
        .map((text) => ({
          pageId: page.id,
          pageIndex,
          textId: text.id,
          snippet: text.text.replace(/\s+/g, " ").slice(0, 80),
        }));
      // 🏷️ اسم الصفحة بيدخل في البحث كمان — بدون نص مكتوب على الصفحة.
      const name = pageNames[page.id];
      if (name && name.includes(needle) && !results.some((result) => result.pageId === page.id && result.textId === "__name__")) {
        results.push({
          pageId: page.id,
          pageIndex,
          textId: "__name__",
          snippet: name,
        });
      }
      return results;
    });
  }, [pageNames, pages, query]);

  const textEditorStyle = textDraft
    ? {
        left: textDraft.x * view.zoom + view.panX,
        top: textDraft.y * view.zoom + view.panY,
        // النص بيترسم مركز محاذاة يمين — المحرر بيتحاذا على الحفة اليمنى مثله.
        transform: "translateX(-100%)",
        fontSize: textSize * view.zoom,
        color,
        fontFamily: textFont,
      }
    : undefined;

  return (
    <div
      className="notes-page"
      data-focus={focusMode ? "true" : undefined}
      data-beside={besideMode ? "true" : undefined}
    >
      <header className="notes-header">
        {!besideMode ? (
          <>
            <Link href="/notes" className="notes-btn notes-btn-sm">
              → دفاتري
            </Link>
            <h1 className="notes-title">{notebookTitle}</h1>
          </>
        ) : (
          <h1 className="notes-title" style={{ fontSize: 15 }}>{notebookTitle}</h1>
        )}
        {!besideMode && notebookId ? (
          <a
            href={`/notes/${notebookId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="افتح نفس الدفتر في تبويب جديد (البيانات من نفس الجهاز)"
            className="notes-btn notes-btn-sm"
          >
            ↗ تبويب جديد
          </a>
        ) : null}
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
        {saveStatus === "error" ? (
          <button
            type="button"
            onClick={retrySave}
            className="notes-btn notes-btn-sm"
            data-tone="primary"
            title="حاول الحفظ تاني"
          >
            ↻ إعادة المحاولة
          </button>
        ) : null}
        {besideMode ? (
          <NotesChip tone="ok" title="وضع التقسيم">
            📌 وضع التقسيم
          </NotesChip>
        ) : null}
        <button
          type="button"
          onClick={() => setFocusMode((value) => !value)}
          data-active={focusMode}
          title="وضع التركيز (F) — إخفاء كل حاجة غير الورقة"
          aria-pressed={focusMode}
          className="notes-btn notes-btn-sm"
        >
          ⛶ تركيز
        </button>
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

        <div className="notes-group">
          <button
            type="button"
            onClick={() => anyFileInputRef.current?.click()}
            disabled={!canWrite}
            title="ارفع ملف على النوته مباشرة: صورة → على الصفحة، PDF → صفحات خلفية، Word/نص → نص على الصفحة"
            className="notes-btn"
          >
            <span aria-hidden="true">📁</span>
            <span>ملف</span>
          </button>
          <input
            ref={anyFileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf,.docx,.doc,.txt,.md,.csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleDirectFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={!canWrite}
            title="استورد PDF واكتب عليه (نطاق صفحات)"
            className="notes-btn"
          >
            <span aria-hidden="true">📄</span>
            <span>PDF</span>
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handlePdfFile(file);
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

        <span className="notes-sep" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setToolbarsCollapsed((value) => !value)}
          data-active={toolbarsCollapsed}
          title={toolbarsCollapsed ? "إظهار أدوات التنسيق" : "إخفاء أدوات التنسيق"}
          aria-expanded={!toolbarsCollapsed}
          className="notes-btn notes-icon-btn"
        >
          {toolbarsCollapsed ? "▾" : "▴"}
        </button>
      </div>

      {/* Row 2 — style: colors, thickness, opacity, text font (collapsible) */}
      {!toolbarsCollapsed ? (
      <>
      <div className="notes-toolbar">
        <div className="notes-group" role="group" aria-label="الألوان">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`لون ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => applyColor(swatch)}
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
            onChange={(event) => applyColor(event.target.value)}
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
                onChange={(event) => applyTextFont(event.target.value)}
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
                onChange={(event) => applyTextSize(Number(event.target.value))}
                className="notes-range"
              />
              <button
                type="button"
                onClick={() => applyTextSize(textSize - 2)}
                disabled={!canWrite}
                title="تصغير خط النص المحدد"
                aria-label="تصغير الخط"
                className="notes-btn notes-icon-btn"
              >
                A-
              </button>
              <span className="notes-count">{textSize}</span>
              <button
                type="button"
                onClick={() => applyTextSize(textSize + 2)}
                disabled={!canWrite}
                title="تكبير خط النص المحدد"
                aria-label="تكبير الخط"
                className="notes-btn notes-icon-btn"
              >
                A+
              </button>
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
          <button
            type="button"
            onClick={() => setBeautifyOpen(true)}
            disabled={!canWrite || pages.length === 0}
            title="تحسين خط اليد (مع معاينة وبدون مسح الأصل)"
            className="notes-btn"
          >
            ✍️ تحسين الخط
          </button>
          <button
            type="button"
            onClick={() => setStudyOpen(true)}
            title="فلَش كاردز وأسئلة اختياري من محتوى النوته"
            className="notes-btn"
          >
            🎴 مذاكرة
          </button>
          <button
            type="button"
            onClick={openMagicWrite}
            disabled={!canWrite}
            title="Magic يشرح الموضوع ويكتبه على الصفحة بعناوين ونقاط وأمثلة ومخططات"
            className="notes-btn"
          >
            ✨ Magic Write
          </button>
          <button
            type="button"
            onClick={() => void convertHandwriting()}
            disabled={!canWrite || handwritingBusy}
            title="تجريبي: يقرا خط اليد ويحوله لنص قابل للتعديل — الأصل مش بيتمس"
            className="notes-btn"
          >
            {handwritingBusy ? "🔎 بيقرا الخط…" : "🔎 قراءة الخط"}
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
          <button
            type="button"
            onClick={insertTable}
            disabled={!canWrite}
            title="إدراج جدول — اكتب عدد الصفوف والأعمدة مثل 4x3"
            className="notes-btn notes-btn-sm"
          >
            ▦ جدول
          </button>
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
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={pages.length === 0}
            className="notes-btn"
            title="لينك للقراءة فقط — تبعته لأي حد يشوف دفترك"
          >
            🔗 مشاركة
          </button>
        </div>
      </div>
      </>
      ) : null}

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
          <div className="notes-text-editor-wrap" style={textEditorStyle}>
            <textarea
              className="notes-text-editor"
              value={textDraft.value}
              autoFocus
              dir="rtl"
              rows={5}
              placeholder="اكتب هنا… (Enter سطر جديد — Enter مع Ctrl أو زر ✓ للحفظ)"
              onChange={(event) =>
                setTextDraft({ ...textDraft, value: event.target.value })
              }
              onBlur={commitTextDraft}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTextDraft();
                }
                // Enter = سطر جديد؛ Ctrl+Enter = حفظ. (نص المذاكرة أغلبه
                // متعدد الأسطر — والنقر بره بيحفظ كمان.)
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  commitTextDraft();
                }
              }}
            />
            <button
              type="button"
              className="notes-text-editor-done"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitTextDraft()}
              title="حفظ النص (Enter مع Ctrl)"
            >
              ✓
            </button>
          </div>
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
          onClick={copySelection}
          disabled={multiCount === 0 && !selection}
          title="انسخ المحدد (Ctrl+C) — تقدر تنقّل لصفحة تانية وتلصق"
          className="notes-btn notes-btn-sm"
        >
          نسخ
        </button>
        <button
          type="button"
          onClick={pasteClipboard}
          disabled={!canWrite || !clipboardLoaded}
          title="لصق في الصفحة الحالية (Ctrl+V)"
          className="notes-btn notes-btn-sm"
        >
          لصق
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
        {pageQuota ? (
          <span
            className="notes-quota-chip"
            data-full={pageQuota.used >= pageQuota.limit ? "true" : undefined}
            title="صفحات النهارده المتاحة — بتتجدد كل 24 ساعة"
          >
            📄 {pageQuota.used}/{pageQuota.limit}
          </span>
        ) : null}
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
        pageNames={pageNames}
        onRename={(pageId) => void renamePage(pageId)}
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

      {/* PDF import dialog */}
      <PdfImportDialog
        open={pdfImportOpen}
        busy={pdfBusy}
        progress={pdfProgress}
        pageCount={pdfPageCount}
        from={pdfFrom}
        to={pdfTo}
        onFromChange={setPdfFrom}
        onToChange={setPdfTo}
        onConfirm={() => void confirmPdfImport()}
        onClose={() => setPdfImportOpen(false)}
        onPickDeviceFile={() => pdfInputRef.current?.click()}
        libraryList={pdfLibraryList}
        onReloadLibrary={() => void loadPdfLibrary()}
        onPickLibraryFile={(fileId, fileName) => void handlePdfFromLibrary(fileId, fileName)}
      />

      <PdfExportDialog
        open={pdfOpen}
        pages={pages}
        selected={pdfSelected}
        exporting={exportingPdf}
        onToggle={(pageId, checked) => {
          const next = new Set(pdfSelected);
          if (checked) next.add(pageId);
          else next.delete(pageId);
          setPdfSelected(next);
        }}
        onSelectAll={() => setPdfSelected(new Set(pages.map((page) => page.id)))}
        onClearSelection={() => setPdfSelected(new Set())}
        onExport={() => void exportPdf()}
        onClose={() => setPdfOpen(false)}
      />

      {/* 🔗 مشاركة للقراءة فقط */}
      {shareOpen ? (
        <div
          className="notes-modal-backdrop"
          onClick={() => setShareOpen(false)}
          role="presentation"
        >
          <div
            className="notes-modal"
            role="dialog"
            aria-modal="true"
            aria-label="مشاركة الدفتر"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="notes-modal-title">🔗 مشاركة للقراءة فقط</h2>
            <p className="notes-modal-sub">
              بيبعت نسخة حالية من الدفتر ({pages.length} صفحة) — اللي بيفتح اللينك
              يشوف ويقلّع الصفحات بس، من غير تسجيل ولا أدوات تحرير. التعديلات
              اللي بتعملها بعد كده مش بتوصل لللينك القديم.
            </p>
            {shareBusy ? (
              <p className="notes-hint" aria-live="polite">بنجهّز النسخة…</p>
            ) : shareLink ? (
              <>
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  onFocus={(event) => event.target.select()}
                  className="notes-input"
                  dir="ltr"
                />
                <div className="notes-modal-actions">
                  <div className="notes-spacer" />
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(shareLink);
                      setShareLink(shareLink); // علامة النسخ
                      setMessage("اللينك اتنسخ ✓");
                    }}
                    data-tone="primary"
                    className="notes-btn"
                  >
                    نسخ اللينك
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareOpen(false)}
                    className="notes-btn notes-btn-sm"
                  >
                    تمام
                  </button>
                </div>
              </>
            ) : (
              <div className="notes-modal-actions">
                <div className="notes-spacer" />
                {shareError ? (
                  <span className="notes-hint" style={{ color: "#c0392b" }}>{shareError}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="notes-btn notes-btn-sm"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void createShareLink()}
                  disabled={shareBusy}
                  data-tone="primary"
                  className="notes-btn"
                >
                  اعمل اللينك
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Handwriting beautify dialog */}
      {beautifyOpen ? (
        <div
          className="notes-modal-backdrop"
          onClick={() => setBeautifyOpen(false)}
          role="presentation"
        >
          <div
            className="notes-modal notes-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label="تحسين خط اليد"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="notes-modal-title">✍️ تحسين الخط</h2>
            <p className="notes-modal-sub">
              بنحسّن انحناءات وتعرجات خطك مع الحفاظ على شكل كتابتك — والأصل
              بيفضل محفوظ وتقدترجعله في أي وقت.
            </p>
            <div className="notes-beautify-previews">
              <figure className="notes-beautify-preview">
                <figcaption>{hasOriginalStrokes ? "الخط الحالي (المحسّن)" : "خطك الأصلي"}</figcaption>
                <canvas ref={originalPreviewRef} width={280} height={396} />
              </figure>
              <figure className="notes-beautify-preview">
                <figcaption>بعد التحسين</figcaption>
                <canvas ref={beautifiedPreviewRef} width={280} height={396} />
              </figure>
            </div>
            <label className="notes-label">
              قوة التحسين
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.1}
                value={beautifyStrength}
                onChange={(event) => setBeautifyStrength(Number(event.target.value))}
                className="notes-range"
              />
            </label>
            <label className="notes-label">
              <input
                type="checkbox"
                checked={beautifyRows}
                onChange={(event) => setBeautifyRows(event.target.checked)}
              />
              ضبط استقامة السطور
            </label>
            <div className="notes-modal-actions">
              {hasOriginalStrokes ? (
                <button
                  type="button"
                  onClick={revertToOriginal}
                  disabled={!canWrite}
                  className="notes-btn"
                  title="رجّع خطك الأصلي زي ما كان"
                >
                  ↩ رجوع للأصل
                </button>
              ) : null}
              <div className="notes-spacer" />
              <button
                type="button"
                onClick={() => setBeautifyOpen(false)}
                className="notes-btn notes-btn-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={adoptBeautified}
                disabled={!canWrite}
                data-tone="primary"
                className="notes-btn"
              >
                اعتماد
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MagicWriteDialog
        open={magicWriteOpen}
        onClose={() => setMagicWriteOpen(false)}
        initialTopic={magicWriteTopic}
        pageContext={getEditorContext}
        onApply={insertAiBlocks}
      />

      <NotesAssistant
        getEditorContext={getEditorContext}
        getSelectedText={getSelectedText}
        getCanvasSnapshot={getCanvasSnapshot}
        defaultOpen={besideMode}
        onInsertToPage={canWrite ? insertAiText : undefined}
        onInsertImage={canWrite ? insertAiImage : undefined}
        onOpenMagicWrite={canWrite ? openMagicWrite : undefined}
      />

      {/* 📝 معاينة قراءة خط اليد — تصحيح قبل الإدراج */}
      {handwritingOpen ? (
        <div className="notes-modal-backdrop" role="presentation">
          <div className="notes-modal" role="dialog" aria-modal="true" aria-label="قراءة خط اليد">
            <h2 className="notes-modal-title">📝 النص المقروء من خطك</h2>
            <p className="notes-modal-sub">
              ده اللي المساعد قراه من خطك — صحّح أي غلط قبل الإدراج. النص
              هيندرج أزرق فوق الصفحة، وخطك الأصلي مش هيتلمس.
            </p>
            <textarea
              className="notes-input notes-handwriting-draft"
              dir="rtl"
              rows={10}
              value={handwritingDraft}
              onChange={(event) => setHandwritingDraft(event.target.value)}
              aria-label="النص المقروء"
            />
            <div className="notes-modal-actions">
              <button
                type="button"
                className="notes-btn notes-btn-sm"
                onClick={() => {
                  setHandwritingOpen(false);
                  setHandwritingDraft("");
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="notes-btn notes-btn-sm"
                onClick={() => insertHandwritingText("lines")}
                title="كل سطر بيبقى بلوك نص مستقل"
              >
                سطر بسطر
              </button>
              <button
                type="button"
                className="notes-btn"
                data-tone="primary"
                onClick={() => insertHandwritingText("block")}
                title="النص كله كبلوك واحد يتحرك كقطعة واحدة"
              >
                إدراج كبلوك واحد
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 🎴 مذاكرة من النوته — فلَش كاردز + اختيار من متعدد */}
      <StudyCards
        open={studyOpen}
        onClose={() => setStudyOpen(false)}
        getPageTexts={getStudyTexts}
        storageKey={`notes:cards:${notebookId ?? ""}`}
        getSavedDeck={loadStudyDeck}
        saveDeck={saveStudyDeck}
      />
    </div>
  );
}
