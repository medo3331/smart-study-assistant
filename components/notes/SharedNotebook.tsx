// components/notes/SharedNotebook.tsx
//
// 📖 عارض الدفاتر المشتركة — للقراءة فقط، بدون تسجيل ولا أدوات.
//
// بيجيب الحمولة من GET /api/notes/share/<id> وبيعرض الصفحات بنفس
// محرك الرسم بتاع النوته (renderPageContent) — بس من غير أزرار تحرير.

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  paintPageBackground,
  paintImage,
  paintShapeStroke,
  paintStroke,
  paintText,
} from "@/lib/notes/canvas";
import type { NoteImage, NoteText, NotesTemplate, Stroke } from "@/lib/notes/types";
import { useTheme } from "@/theme/ThemeProvider";

interface SharedPage {
  id: string;
  template: NotesTemplate;
  content: {
    strokes: Stroke[];
    texts: NoteText[];
    images: NoteImage[];
  };
}

interface SharedNotebookData {
  title: string;
  pageCount: number;
  pages: SharedPage[];
}

export default function SharedNotebook() {
  const params = useParams<{ id: string }>();
  const shareId =
    typeof params?.id === "string" && params.id.length > 0 ? params.id : null;
  const { theme } = useTheme();

  const [data, setData] = useState<SharedNotebookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageId, setPageId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const loadImages = useCallback(async (pages: SharedPage[]) => {
    const targets: Array<{ src: string }> = [];
    for (const page of pages) {
      for (const image of page.content.images ?? []) {
        if (image.src && !imagesRef.current.has(image.src)) targets.push({ src: image.src });
      }
    }
    await Promise.all(
      targets.map(
        (target) =>
          new Promise<void>((resolve) => {
            const element = new Image();
            element.onload = () => {
              imagesRef.current.set(target.src, element);
              resolve();
            };
            element.onerror = () => resolve();
            element.src = target.src;
          }),
      ),
    );
  }, []);

  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      if (!shareId) {
        setError("لينك المشاركة غير صالح.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/notes/share/${shareId}`);
        const payload = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !payload?.ok) {
          setError(payload?.error?.message ?? "لينك المشاركة مش موجود أو اتلغى.");
          setLoading(false);
          return;
        }
        const pages: SharedPage[] = Array.isArray(payload.payload?.pages)
          ? payload.payload.pages
          : [];
        await loadImages(pages);
        if (cancelled) return;
        setData({
          title: typeof payload.title === "string" ? payload.title : "دفتر",
          pageCount: pages.length,
          pages,
        });
        setPageId(pages[0]?.id ?? null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("مقدرناش نحمّل الدفتر — جرّب تاني.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId, loadImages]);
  const pageIndex = useMemo(
    () => (data && pageId ? data.pages.findIndex((page) => page.id === pageId) : -1),
    [data, pageId],
  );

  // 🖌️ رسم الصفحة — نفس محرك النوته بالظبط، بس بلا تفاعل.
  useEffect(() => {
    if (!data || pageIndex < 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const page = data.pages[pageIndex];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = PAGE_WIDTH * dpr;
    canvas.height = PAGE_HEIGHT * dpr;
    canvas.style.width = `${PAGE_WIDTH}px`;
    canvas.style.height = `${PAGE_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintPageBackground(ctx, page.template, PAGE_WIDTH, PAGE_HEIGHT);
    for (const image of page.content.images ?? []) {
      paintImage(ctx, image, (src) => imagesRef.current.get(src) ?? null);
    }
    for (const stroke of page.content.strokes ?? []) {
      if (stroke.shape) paintShapeStroke(ctx, stroke);
      else paintStroke(ctx, stroke);
    }
    for (const text of page.content.texts ?? []) paintText(ctx, text);
  }, [data, pageIndex, theme]);

  if (loading) {
    return (
      <div className="shared-page">
        <p className="notes-hint">بنحمّل الدفتر…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="shared-page">
        <div className="notes-alert" data-tone="error">
          <strong>مفيش دفتر هنا</strong>
          <br />
          {error ?? "لينك المشاركة مش موجود أو اتلغى."}
        </div>
        <p className="notes-hint">
          لو لينك من صاحب الدفتر — اطلب لينك جديد منه. أو{" "}
          <Link href="/notes" className="notes-link">افتح دفاترك</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="shared-page">
      <header className="shared-header">
        <div>
          <h1 className="shared-title">{data.title}</h1>
          <p className="notes-hint">نسخة للقراءة فقط — {data.pageCount} صفحة</p>
        </div>
        <div className="shared-nav">
          <button
            type="button"
            className="notes-btn notes-btn-sm"
            disabled={pageIndex <= 0}
            onClick={() => setPageId(data.pages[pageIndex - 1]?.id ?? null)}
          >
            → السابقة
          </button>
          <span className="shared-counter">
            {pageIndex + 1} / {data.pages.length}
          </span>
          <button
            type="button"
            className="notes-btn notes-btn-sm"
            disabled={pageIndex >= data.pages.length - 1}
            onClick={() => setPageId(data.pages[pageIndex + 1]?.id ?? null)}
          >
            التالية ←
          </button>
        </div>
      </header>

      <div className="shared-canvas-wrap" dir="ltr">
        <canvas
          ref={canvasRef}
          className="shared-canvas"
          aria-label={`صفحة ${pageIndex + 1} من ${data.title}`}
        />
      </div>

      {data.pages.length > 1 ? (
        <div className="shared-thumbs" dir="ltr">
          {data.pages.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="shared-thumb"
              data-active={item.id === pageId}
              onClick={() => setPageId(item.id)}
              aria-label={`صفحة ${index + 1}`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      ) : null}

      <p className="notes-hint" style={{ textAlign: "center", marginTop: 12 }}>
        عايز دفتر زي ده؟{" "}
        <Link href="/notes" className="notes-link">افتح Magicly Notes</Link>
      </p>
    </div>
  );
}
