"use client";
/**
 * DiagramCanvas — لوحة عرض المخططات لأداة التوليد المخصصة
 *
 * بيرسم كود Mermaid كـ SVG بثيم داكن متناسق مع باقي الموقع.
 * (للعرض داخل الشات بنستخدم MermaidViewer بدل المكوّن ده.)
 */
import React, { useEffect, useRef, useState } from "react";

interface DiagramCanvasProps {
  code: string;
  type: string;
  title: string;
}

export function DiagramCanvas({ code, type, title }: DiagramCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      if (!code) return;
      setRendering(true);
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#7C3AED",
            primaryTextColor: "#F8FAFC",
            primaryBorderColor: "#A78BFA",
            lineColor: "#94A3B8",
            secondaryColor: "#1E293B",
            tertiaryColor: "#0F172A",
            fontFamily: "Alexandria, Tahoma, sans-serif",
            fontSize: "14px",
          },
          flowchart: { curve: "basis", padding: 15 },
          mindmap: { padding: 16 },
        });
        const id = `mermaid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const { svg } = await mermaid.render(id, code);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError("فشل في رسم المخطط — تأكد من صحة البيانات");
        console.error("Mermaid error:", err);
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-4" dir="ltr">
      <h3 className="text-sm font-bold text-purple-300 mb-3 text-right" dir="rtl">
        📊 {title} <span className="text-slate-500 font-normal">({type})</span>
      </h3>
      {rendering ? (
        <p className="text-slate-400 text-sm text-center py-6">جاري رسم المخطط...</p>
      ) : error ? (
        <div dir="rtl">
          <p className="text-red-400 text-sm text-center">{error}</p>
          <pre className="mt-2 text-xs text-slate-500 overflow-x-auto" dir="ltr">
            {code}
          </pre>
        </div>
      ) : (
        <div ref={containerRef} className="flex justify-center overflow-x-auto" />
      )}
    </div>
  );
}
