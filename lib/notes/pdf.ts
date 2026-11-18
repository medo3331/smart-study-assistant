// lib/notes/pdf.ts
//
// PDF → notebook page importer.
//
// Each PDF page is rasterized into a single NoteImage (JPEG data URL) placed
// at the top-left of a blank page, so the student can draw, highlight and
// type on top of it with every existing tool — the PDF becomes paper.
//
// pdf.js runs in a module worker served from /public/pdfjs (pinned copy of
// the same version in package.json), which keeps the bundle lazy: the
// library is only fetched when a student actually imports a PDF.

import { PAGE_HEIGHT, PAGE_WIDTH } from "./canvas";
import type { NoteImage } from "./types";

/** Max pages per import — keeps IndexedDB records and render time sane. */
export const MAX_PDF_PAGES_PER_IMPORT = 30;

type PdfModule = typeof import("pdfjs-dist");

let workerConfigured = false;

async function loadPdfjs(): Promise<PdfModule> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    workerConfigured = true;
  }
  return pdfjs;
}

/** A loaded pdf.js document. */
export type PdfDoc = Awaited<ReturnType<PdfModule["getDocument"]>["promise"]>;

/** Parse a PDF file. Caller is responsible for destroying the doc. */
export async function loadPdfDocument(file: File): Promise<PdfDoc> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  return pdfjs.getDocument({ data }).promise;
}

/**
 * Rasterize one PDF page to a JPEG data URL, fitted inside the notebook's
 * A4 page (no cropping, whole page visible).
 */
export async function renderPdfPageToImage(
  doc: PdfDoc,
  pageNumber: number,
): Promise<{ image: Omit<NoteImage, "id" | "kind"> }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });

  // Fit the whole page inside the A4 sheet, rendered 1.5x for crispness.
  const fit = Math.min(PAGE_WIDTH / base.width, PAGE_HEIGHT / base.height);
  const renderScale = fit * 1.5;
  const viewport = page.getViewport({ scale: renderScale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  // PDFs can be transparent; the paper must stay white.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const width = Math.round(base.width * fit);
  const height = Math.round(base.height * fit);
  const src = canvas.toDataURL("image/jpeg", 0.85);

  page.cleanup();
  return { image: { src, x: 0, y: 0, width, height } };
}
