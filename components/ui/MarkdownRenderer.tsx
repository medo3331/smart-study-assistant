'use client'
/**
 * MarkdownRenderer — عرض ردود الـ AI داخل الشات
 *
 * - بيصلّح صيغ LaTeX اللي الـ AI بيبعتها (\[...\] و \(...\)) ويحوّلها
 *   لصيغة $$...$$ / $...$ اللي remark-math بيفهمها (preprocessLaTeX)،
 *   عشان المعادلات تترسم رسم رياضي حقيقي عبر KaTeX بدل ما تظهر كنص خام.
 * - بيتعرف تلقائيًا على بلوكات ```mermaid وبيعرضها كمخططات تفاعلية
 *   (عبر MermaidViewer) بدل ما يظهر الكود الخام.
 * - remark-gfm محفوظ عشان الجداول تفضل شغالة.
 */
import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { MermaidViewer } from './MermaidViewer'
import 'katex/dist/katex.min.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

// 🎯 دالة معالجة صيغ LaTeX القادمة من الـ AI قبل عرضها
function preprocessLaTeX(content: string): string {
  if (!content) return ''
  return content
    // تحويل \[ ... \] إلى $$ ... $$
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `\n\n$$\n${inner}\n$$\n\n`)
    // تحويل \( ... \) إلى $ ... $
    // (ملحوظة: في replacement strings العادية '$$1$' بتتحول لنص حرفي غلط —
    // عشان كده بنستخدم function replacer اللي بتضمن الإخراج الصحيح)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner}$`)
    // تحويل الأقواس المربعة الفردية في سطر لوحدها لصيغة عرض: [ \mathbf{F} = m \mathbf{a} ]
    .replace(
      /(^|\n)\[\s*(\\mathbf\{.*?\}|\\text\{.*?\}|\\frac\{.*?\}|[\w\s=+\-*/]+)\s*\](\n|$)/g,
      (_m, _lead, inner) => `\n\n$$\n${inner}\n$$\n\n`,
    )
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = '',
}: MarkdownRendererProps) {
  const processedContent = preprocessLaTeX(content)

  return (
    <div
      className={`prose prose-invert max-w-none text-right leading-relaxed ${className}`}
      dir="auto"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              throwOnError: false,
              strict: false,
              output: 'htmlAndMathml',
            },
          ],
        ]}
        components={{
          code(props) {
            const codeClassName = typeof props.className === 'string' ? props.className : ''
            const codeChildren = props.children
            const match = /language-(\w+)/.exec(codeClassName || '')
            const language = match ? match[1] : ''
            const value = String(codeChildren ?? '').replace(/\n$/, '')

            // 🌟 لو الكود من نوع mermaid اعرضه كمخطط تفاعلي فوراً
            if (language === 'mermaid') {
              return <MermaidViewer chart={value} />
            }

            // react-markdown v10 مش بيمرّر prop اسمها inline — بنكتشف البلوك
            // من اللغة أو وجود سطر جديد جوه الكود (نفس أسلوب النسخة السابقة)
            const looksBlock = language !== '' || value.includes('\n')
            if (!looksBlock) {
              return (
                <code className="bg-slate-800 text-purple-300 px-1.5 py-0.5 rounded text-sm font-mono">
                  {codeChildren}
                </code>
              )
            }

            return <code className={`${codeClassName} font-mono`}>{codeChildren}</code>
          },
          pre({ children: preChildren }) {
            // لو الـ pre بيغلّف مخطط mermaid ما نغلّفوش تاني بخلفية كود
            const child = Array.isArray(preChildren) ? preChildren[0] : preChildren
            if (React.isValidElement(child) && child.type === MermaidViewer) {
              return <>{preChildren}</>
            }
            return (
              <div
                className="my-3 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 not-prose"
                dir="ltr"
              >
                <pre className="p-4 overflow-x-auto text-sm font-mono text-slate-200">
                  {preChildren}
                </pre>
              </div>
            )
          },
          table({ children: tableChildren }) {
            return (
              <div className="my-3 overflow-x-auto rounded-xl border border-slate-800">
                <table className="min-w-full text-sm">{tableChildren}</table>
              </div>
            )
          },
          th({ children: thChildren }) {
            return (
              <th className="bg-slate-900/80 px-3 py-2 text-right font-bold text-purple-200 border-b border-slate-800">
                {thChildren}
              </th>
            )
          },
          td({ children: tdChildren }) {
            return (
              <td className="px-3 py-2 border-b border-slate-800/60 text-slate-300">
                {tdChildren}
              </td>
            )
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
})
