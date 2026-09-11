"use client";
/**
 * MermaidViewer — عارض المخططات التفاعلي
 *
 * بيغلّف مكتبة mermaid (اللي بتشتغل على DOM) في مكوّن Client-Side آمن
 * يمنع مشاكل الـ Hydration في Next.js، مع دعم التكبير والتصغير
 * والتحميل كصورة SVG ونسخ الكود.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";

interface MermaidViewerProps {
  chart: string;
  className?: string;
  /** عنوان اختياري بيظهر في شريط المخطط. */
  label?: string;
}

export function MermaidViewer({ chart, className = "", label }: MermaidViewerProps) {
  const uniqueId = useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const [isRendering, setIsRendering] = useState(true);

  const cleanChartCode = (code: string) => {
    return code
      .replace(/^```(?:mermaid)?/i, "")
      .replace(/```$/, "")
      .trim();
  };

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      setIsRendering(true);
      setError(null);

      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          fontFamily: "Alexandria, Tahoma, sans-serif",
          themeVariables: {
            darkMode: true,
            background: "#0f172a",
            primaryColor: "#7c3aed",
            primaryTextColor: "#f8fafc",
            primaryBorderColor: "#8b5cf6",
            lineColor: "#94a3b8",
            secondaryColor: "#1e293b",
            tertiaryColor: "#334155",
            nodeBorder: "#8b5cf6",
            mainBkg: "#1e1b4b",
            nodeTextColor: "#f8fafc",
          },
          flowchart: {
            htmlLabels: true,
            curve: "basis",
            padding: 16,
          },
          mindmap: {
            padding: 16,
          },
        });

        const cleaned = cleanChartCode(chart);
        const renderId = `mermaid_${uniqueId}_${Date.now()}`;
        const { svg } = await mermaid.render(renderId, cleaned);

        if (isMounted) {
          setSvgContent(svg);
          setIsRendering(false);
        }
      } catch (err) {
        console.error("[Mermaid Render Error]:", err);
        if (isMounted) {
          setError("تعذر رسم المخطط، جاري عرضه كنص.");
          setIsRendering(false);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, uniqueId]);

  const copyCode = () => {
    navigator.clipboard.writeText(cleanChartCode(chart));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSVG = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagram_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-mono text-slate-300">
        <p className="text-red-400 mb-2 font-sans font-bold">{error}</p>
        <pre className="overflow-x-auto text-slate-400" dir="ltr">
          {cleanChartCode(chart)}
        </pre>
      </div>
    );
  }

  return (
    <div
      className={`my-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur shadow-xl ${className}`}
    >
      {/* شريط التحكم العلوي */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-950/50">
        <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
          {label ?? "مخطط تفاعلي (خريطة ذهنية)"}
        </span>
        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={() => setScale((s) => Math.min(s + 0.15, 2))}
            className="rounded-lg p-1.5 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            title="تكبير"
            type="button"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s - 0.15, 0.6))}
            className="rounded-lg p-1.5 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            title="تصغير"
            type="button"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={downloadSVG}
            className="rounded-lg p-1.5 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            title="تحميل SVG"
            type="button"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={copyCode}
            className="rounded-lg p-1.5 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            title="نسخ الكود"
            type="button"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* مساحة عرض المخطط */}
      <div className="relative min-h-[160px] overflow-auto p-4 flex items-center justify-center">
        {isRendering ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
            جاري رسم المخطط التفاعلي...
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top center",
              transition: "transform 0.2s ease-out",
            }}
            className="w-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
}
