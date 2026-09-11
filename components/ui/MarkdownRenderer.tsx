// components/ui/MarkdownRenderer.tsx
'use client'

import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * بيقفل بلوك الـ Display Math لو لسه مفتوح (بيحصل أثناء الـ Streaming
 * لما الـ $$ التانية لسه موصلتش). من غيرها remark-math بيسيب البلوك
 * كنص خام لحد ما يتقفل — آمن، لكن القفلة المبكرة بتخلي المعادلة
 * تترندر أول بأول بدل ما تظهر كنص ثم تنط لمعادلة.
 * الـ Inline ($...$) بيتساب زي ما هو: قبل القفلة بيظهر كنص عادي
 * وده مقبول ومش بيكسر حاجة.
 */
function closeUnclosedDisplayMath(content: string): string {
  const parts = content.split('$$')
  // عدد فردي من الفواصل = بلوك مفتوح ومتقفلش
  if (parts.length % 2 === 0) return content + '$$'
  return content
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = '',
}: MarkdownRendererProps) {
  const safeContent = closeUnclosedDisplayMath(content)

  return (
    <div
      className={`markdown-renderer text-right leading-relaxed ${className}`}
      dir="auto"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              throwOnError: false, // ⚠️ يمنع انهيار الصفحة لو المعادلة ناقصة أثناء الـ Streaming
              strict: false,
              output: 'htmlAndMathml',
            },
          ],
        ]}
        components={{
          // بلوك الكود: غلاف LTR بكلاس .md-codeblock (التنسيق في globals.css)
          pre({ children }) {
            return (
              <div className="md-codeblock" dir="ltr">
                <pre>{children}</pre>
              </div>
            )
          },
          // الجداول: غلاف بيتمرر أفقياً على الشاشات الضيقة
          table({ children }) {
            return (
              <div className="md-table-wrap">
                <table>{children}</table>
              </div>
            )
          },
          // اللينكات الخارجية بتفتح في تاب جديد، الداخلية بتفضل تنقل داخلي
          a({ href, children }) {
            const isExternal = href?.startsWith('http://') || href?.startsWith('https://')
            return (
              <a
                href={href}
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  )
})
