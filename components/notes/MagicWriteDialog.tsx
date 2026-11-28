"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  NOTEBOOK_WRITE_STYLE_LABELS,
  NOTEBOOK_WRITE_STYLES,
  type NotebookBlock,
  type NotebookWriteResult,
  type NotebookWriteStyle,
} from "@/lib/ai/notebook-writer";
import { layoutNotebookBlocks, type AiDiagramImage, type AiLayoutResult } from "@/lib/notes/ai-layout";
import { mermaidToPngDataUrl } from "@/lib/notes/diagram-render";

/**
 * Magic Write dialog — Explain & Write on the page.
 *
 * The AI returns a structured document; the student previews every block,
 * keeps or drops each one, then applies it: the notebook engine lays the kept
 * blocks out as real, editable page elements (text, tables, diagram images).
 */

type Applied = AiLayoutResult & { title: string };

const BLOCK_ICONS: Record<NotebookBlock["type"], string> = {
  heading: "🔖",
  text: "📝",
  bullet: "•",
  definition: "📌",
  example: "🧪",
  tip: "💡",
  question: "❓",
  table: "▦",
  diagram: "🎨",
};

export default function MagicWriteDialog({
  open,
  onClose,
  initialTopic = "",
  pageContext,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** نص محدد من الصفحة أو موضوع مكتوب — بيملأ الحقل مبدئيًا. */
  initialTopic?: string;
  /** سياق نص الصفحة الحالية — بيتبعت للـ AI لو الطالب فعّله. */
  pageContext: () => string;
  onApply: (applied: Applied) => void;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [style, setStyle] = useState<NotebookWriteStyle>("smart");
  const [usePageContext, setUsePageContext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NotebookWriteResult | null>(null);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [diagramImages, setDiagramImages] = useState<Record<number, AiDiagramImage>>({});
  const [diagramBusy, setDiagramBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setTopic(initialTopic);
      setError(null);
    }
  }, [open, initialTopic]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setIncluded(new Set());
      setDiagramImages({});
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const diagramIndices = useMemo(
    () =>
      (result?.blocks ?? [])
        .map((block, index) => (block.type === "diagram" ? index : -1))
        .filter((index) => index >= 0),
    [result],
  );

  /** 🎨 رسم المخططات اللي في النتيجة — lazy بعد ما المعاينة تظهر. */
  const renderDiagrams = async (writeResult: NotebookWriteResult) => {
    const pending = writeResult.blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.type === "diagram");
    if (pending.length === 0) return;
    setDiagramBusy(true);
    const rendered: Record<number, AiDiagramImage> = {};
    for (const { block, index } of pending) {
      if (block.type !== "diagram") continue;
      try {
        const dataUrl = await mermaidToPngDataUrl(block.mermaidCode);
        if (dataUrl) {
          const image = new Image();
          const size = await new Promise<{ width: number; height: number }>((resolve) => {
            image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
            image.onerror = () => resolve({ width: 600, height: 400 });
            image.src = dataUrl;
          });
          rendered[index] = { src: dataUrl, width: size.width, height: size.height };
          setDiagramImages((previous) => ({ ...previous, [index]: rendered[index] }));
          setIncluded((previous) => new Set(previous).add(index));
        }
      } catch {
        // الرسمة لوحدها مش سبب نضيّع الشرح كله — بنكمّل من غيرها.
      }
    }
    setDiagramBusy(false);
  };

  const generate = async () => {
    const cleanTopic = topic.trim();
    if (cleanTopic.length < 3) {
      setError("اكتب الموضوع أو حدّد نصًا على الصفحة الأول (٣ أحرف على الأقل).");
      return;
    }
    setBusy(true);
    setRegenerating(true);
    setError(null);
    setResult(null);
    setDiagramImages({});
    try {
      const res = await fetch("/api/ai/notebook-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: cleanTopic,
          style,
          pageContext: usePageContext ? pageContext() : "",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.blocks) {
        throw new Error(data?.error?.message ?? "فشل توليد الشرح — جرّب تاني.");
      }
      const writeResult: NotebookWriteResult = {
        title: typeof data.title === "string" ? data.title : "ملاحظات Magic",
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
      };
      setResult(writeResult);
      setIncluded(new Set(writeResult.blocks.map((_, index) => index)));
      void renderDiagrams(writeResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حصل خطأ غير متوقع.");
    } finally {
      setBusy(false);
      setRegenerating(false);
    }
  };

  const toggleBlock = (index: number) => {
    setIncluded((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const apply = () => {
    if (!result) return;
    const kept = [...included].filter((index) => diagramIndices.includes(index) ? diagramImages[index] : true);
    const activeInclude = new Set(kept);
    const activeDiagrams: Record<number, AiDiagramImage> = {};
    for (const index of diagramIndices) {
      if (activeInclude.has(index) && diagramImages[index]) {
        activeDiagrams[index] = diagramImages[index];
      }
    }
    const laid = layoutNotebookBlocks({
      blocks: result.blocks,
      include: activeInclude,
      diagramImages: activeDiagrams,
    });
    if (laid.texts.length + laid.images.length === 0) {
      setError("مفيش عناصر متاحة للإدراج — فعّل بلوك واحد على الأقل.");
      return;
    }
    onApply({ ...laid, title: result.title });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="notes-modal-backdrop" role="dialog" aria-label="Magic Write" onClick={onClose}>
      <div
        className="notes-modal notes-modal-wide magic-write"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="magic-write-head">
          <h3 className="notes-modal-title">✨ Magic Write — اشرح واكتب على النوتة</h3>
          <button type="button" className="notes-btn notes-btn-sm" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </header>

        <label className="notes-label">
          الموضوع أو النص المحدد
          <textarea
            className="notes-input magic-write-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            rows={2}
            placeholder="مثال: IP Addressing and Subnetting"
            disabled={busy}
          />
        </label>

        <div className="magic-write-styles" role="group" aria-label="أسلوب الكتابة">
          {NOTEBOOK_WRITE_STYLES.map((value) => (
            <button
              key={value}
              type="button"
              className="notes-btn notes-btn-sm"
              data-active={style === value}
              disabled={busy}
              onClick={() => setStyle(value)}
            >
              {NOTEBOOK_WRITE_STYLE_LABELS[value]}
            </button>
          ))}
        </div>

        <label className="notes-label notes-assistant-ctx">
          <input
            type="checkbox"
            checked={usePageContext}
            onChange={(event) => setUsePageContext(event.target.checked)}
            disabled={busy}
          />
          استخدم نص الصفحة كسياق
        </label>

        <div className="magic-write-actions">
          <button
            type="button"
            data-tone="primary"
            className="notes-btn"
            disabled={busy || diagramBusy}
            onClick={() => void generate()}
          >
            {busy ? "بيفكّر…" : result ? "🔄 ولّد تاني" : "✨ ولّد المعاينة"}
          </button>
          {result ? (
            <button
              type="button"
              data-tone="primary"
              className="notes-btn"
              disabled={busy || diagramBusy || included.size === 0}
              onClick={apply}
            >
              ✍️ اكتبها على الصفحة
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="notes-alert" data-tone="error">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="magic-write-preview" aria-label="معاينة قبل الإدراج">
            <p className="notes-modal-sub">
              شيل ✓ عن أي بلوك مش عايزه — اللي هيتكتب على الصفحة هو المفعّل فقط.
              {diagramBusy ? " 🎨 بيجهّز الرسمة…" : ""}
            </p>
            {result.blocks.map((block, index) => (
              <label key={index} className={`magic-write-block`} data-type={block.type}>
                <input
                  type="checkbox"
                  checked={included.has(index)}
                  onChange={() => toggleBlock(index)}
                />
                <span className="magic-write-icon">{BLOCK_ICONS[block.type]}</span>
                <BlockPreview block={block} diagram={diagramImages[index]?.src} />
              </label>
            ))}
          </div>
        ) : (
          <p className="notes-modal-sub magic-write-hint">
            Magic هيولّد شرح منظم بعناوين ونقاط وأمثلة — ولو الموضوع محتاج رسمة هيضيف مخطط
            قابل للتحريك. بعد المعاينة بتضغط «اكتبها على الصفحة» وتقدر تعدّل أي عنصر براحتك.
          </p>
        )}
      </div>
    </div>
  );
}

function BlockPreview({ block, diagram }: { block: NotebookBlock; diagram?: string }) {
  switch (block.type) {
    case "heading":
      return <strong className="magic-write-heading">{block.text}</strong>;
    case "definition":
      return <span>📌 {block.text}</span>;
    case "example":
      return <span>مثال: {block.text}</span>;
    case "tip":
      return <span>💡 {block.text}</span>;
    case "question":
      return <span>❓ {block.text}</span>;
    case "table":
      return (
        <table className="magic-write-table">
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "diagram":
      return diagram ? (
        <img src={diagram} alt="معاينة المخطط" className="magic-write-diagram" />
      ) : (
        <span className="magic-write-diagram-pending">🎨 مخطط {block.mermaidType} — بيجهّز…</span>
      );
    default:
      return <span>{block.text}</span>;
  }
}
