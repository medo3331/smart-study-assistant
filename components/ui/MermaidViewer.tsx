'use client'
/**
 * MermaidViewer — عارض المخططات التفاعلي
 *
 * بيغلّف مكتبة mermaid (اللي بتشتغل على DOM) في مكوّن Client-Side آمن
 * يمنع مشاكل الـ Hydration في Next.js، مع دعم التكبير والتصغير
 * والتحميل كصورة SVG ونسخ الكود.
 *
 * التصميم: خلفية داكنة عميقة + useMaxWidth: false عشان الخرائط الذهنية
 * تترسم مفرودة بأبعاد مريحة بدل ما تتجمّع ضيقة، وألوان فاتحة واضحة.
 */
import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Download, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react'

interface MermaidViewerProps {
  chart: string
  className?: string
  /** عنوان اختياري بيظهر في شريط المخطط. */
  label?: string
}

export function MermaidViewer({ chart, className = '', label }: MermaidViewerProps) {
  const uniqueId = useId().replace(/:/g, '_')
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgContent, setSvgContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [scale, setScale] = useState(1)
  const [isRendering, setIsRendering] = useState(true)

  const cleanChartCode = (code: string) => {
    return code
      .replace(/^```(?:mermaid)?/i, '')
      .replace(/```$/, '')
      .trim()
  }

  useEffect(() => {
    let isMounted = true

    const renderChart = async () => {
      setIsRendering(true)
      setError(null)

      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'Alexandria, sans-serif',
          themeVariables: {
            darkMode: true,
            background: '#090d16',
            primaryColor: '#7c3aed',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#a78bfa',
            lineColor: '#cbd5e1',
            secondaryColor: '#1e293b',
            tertiaryColor: '#334155',
            nodeBorder: '#a78bfa',
            clusterBkg: '#0f172a',
            clusterBorder: '#334155',
            defaultLinkColor: '#a78bfa',
            titleColor: '#f8fafc',
            edgeLabelBackground: '#1e1b4b',
          },
          mindmap: {
            useMaxWidth: false,
            padding: 20,
          },
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: 'basis',
            padding: 20,
          },
        })

        const cleaned = cleanChartCode(chart)
        const renderId = `mermaid_${uniqueId}_${Date.now()}`
        const { svg } = await mermaid.render(renderId, cleaned)

        if (isMounted) {
          setSvgContent(svg)
          setIsRendering(false)
        }
      } catch (err) {
        console.error('[Mermaid Render Error]:', err)
        if (isMounted) {
          setError('تعذر رسم المخطط بيانيًا، جاري عرض الكود.')
          setIsRendering(false)
        }
      }
    }

    renderChart()

    return () => {
      isMounted = false
    }
  }, [chart, uniqueId])

  const copyCode = () => {
    navigator.clipboard.writeText(cleanChartCode(chart))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadSVG = () => {
    if (!svgContent) return
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagram_${Date.now()}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <div
        className="my-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-mono text-slate-300"
        dir="ltr"
      >
        <p className="text-red-400 mb-2 font-sans font-bold" dir="rtl">
          {error}
        </p>
        <pre className="overflow-x-auto text-slate-400">{cleanChartCode(chart)}</pre>
      </div>
    )
  }

  return (
    <div
      className={`my-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl ${className}`}
    >
      {/* شريط التحكم العلوي */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 bg-slate-900/80">
        <span className="text-xs font-bold text-purple-300 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
          {label ?? 'مخطط تفاعلي'}
        </span>
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(s + 0.2, 2.5))}
            className="p-1.5 hover:bg-slate-800 hover:text-slate-200 rounded-lg transition-colors"
            title="تكبير"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))}
            className="p-1.5 hover:bg-slate-800 hover:text-slate-200 rounded-lg transition-colors"
            title="تصغير"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={downloadSVG}
            className="p-1.5 hover:bg-slate-800 hover:text-slate-200 rounded-lg transition-colors"
            title="تحميل صورة"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={copyCode}
            className="p-1.5 hover:bg-slate-800 hover:text-slate-200 rounded-lg transition-colors"
            title="نسخ الكود"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* منطقة المخطط مع أبعاد مريحة — ارتفاع أدنى واضح وحد أقصى مع سكرول */}
      <div className="relative min-h-[320px] max-h-[600px] overflow-auto p-6 flex items-center justify-center bg-slate-950/50">
        {isRendering ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
            جاري رسم المخطط...
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out',
            }}
            className="w-full flex justify-center [&_svg]:max-w-none [&_svg]:min-w-[400px] [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  )
}
