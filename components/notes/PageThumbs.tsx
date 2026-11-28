"use client";

import React, { useEffect, useRef } from "react";
import { pageDimensions, renderPageContent } from "@/lib/notes/canvas";
import type { NotesTemplate, PageContent } from "@/lib/notes/types";

/**
 * Visual page navigator.
 *
 * Every page of the notebook is rendered into a small offscreen-ratio canvas
 * through the exact same `renderPageContent` used for the real sheet, so a
 * thumbnail always previews what the page will look like when opened.
 *
 * Rendering happens in an effect keyed on the page's content identity: a
 * stroke edit produces a new PageContent object, which is the only trigger
 * the thumbnail needs to redraw.
 */

const THUMB_WIDTH = 96;

export type ThumbPage = {
  id: string;
  template: NotesTemplate;
  content: PageContent;
};

function PageThumb({
  page,
  lookup,
  pageSize,
}: {
  page: ThumbPage;
  lookup: (src: string) => CanvasImageSource | null;
  pageSize: { width: number; height: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const thumbHeight = Math.round((THUMB_WIDTH * pageSize.height) / pageSize.width);
    const scale = THUMB_WIDTH / pageSize.width;
    canvas.width = THUMB_WIDTH * 2;
    canvas.height = thumbHeight * 2;
    ctx.setTransform(2 * scale, 0, 0, 2 * scale, 0, 0);
    renderPageContent(ctx, page.template, page.content, pageSize.width, pageSize.height, lookup);
  }, [page.template, page.content, lookup, pageSize]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ width: THUMB_WIDTH, height: Math.round((THUMB_WIDTH * pageSize.height) / pageSize.width) }}
    />
  );
}

export default function PageThumbs({
  pages,
  activePageId,
  lookup,
  onSelect,
  pageNames = {},
  onRename,
  pageSize,
}: {
  pages: ThumbPage[];
  activePageId: string | null;
  lookup: (src: string) => CanvasImageSource | null;
  onSelect: (pageId: string) => void;
  /** 📐 أبعاد الصفحة حسب مقاس النوتة — الافتراضي A4 طولي للنوتات القديمة. */
  pageSize?: { width: number; height: number };
  /** 🏷️ أسماء الصفحات (pageId → اسم). */
  pageNames?: Record<string, string>;
  /** فتح إعادة التسمية لصفحة. */
  onRename?: (pageId: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePageId]);

  if (pages.length === 0) return null;

  return (
    <div className="notes-thumbs" role="tablist" aria-label="صفحات النوتة">
      {pages.map((page, index) => (
        <button
          key={page.id}
          ref={page.id === activePageId ? activeRef : undefined}
          type="button"
          role="tab"
          aria-selected={page.id === activePageId}
          aria-label={pageNames[page.id] ? `صفحة ${index + 1} — ${pageNames[page.id]}` : `صفحة ${index + 1}`}
          className="notes-thumb"
          data-active={page.id === activePageId}
          onClick={() => onSelect(page.id)}
        >
          <PageThumb page={page} lookup={lookup} pageSize={pageSize ?? pageDimensions("a4")} />
          <span className="notes-thumb-num">
            {index + 1}
            {pageNames[page.id] ? <em className="notes-thumb-name">{pageNames[page.id]}</em> : null}
          </span>
        </button>
      ))}
      {onRename ? (
        <button
          type="button"
          className="notes-btn notes-btn-sm notes-thumb-rename"
          onClick={() => activePageId && onRename(activePageId)}
          disabled={!activePageId}
          title="غيّر اسم الصفحة الحالية"
        >
          🏷️ تسمية
        </button>
      ) : null}
    </div>
  );
}
