"use client";
/**
 * MarkdownRenderer — عرض ردود الـ AI داخل الشات
 *
 * بيتعرف تلقائيًا على بلوكات ```mermaid وبيعرضها كمخططات تفاعلية
 * (عبر MermaidViewer) بدل ما يظهر الكود الخام، مع تنسيق مريح
 * لباقي عناصر الـ Markdown (جداول، أكواد، قوائم...).
 */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidViewer } from "./MermaidViewer";

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

export function MarkdownRenderer({ children, className = "" }: MarkdownRendererProps) {
  return (
    <div
      dir="rtl"
      className={`prose prose-sm max-w-none text-sm leading-relaxed text-ink prose-strong:text-inherit ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const codeClassName = typeof props.className === "string" ? props.className : "";
            const codeChildren = props.children;
            const match = /language-(\w+)/.exec(codeClassName || "");
            const language = match ? match[1] : "";
            const value = String(codeChildren ?? "").replace(/\n$/, "");

            // 🌟 لو الكود من نوع mermaid اعرضه كمخطط تفاعلي فوراً
            if (language === "mermaid") {
              return <MermaidViewer chart={value} />;
            }

            const looksBlock = language !== "" || value.includes("\n");
            if (!looksBlock) {
              return (
                <code className="bg-slate-800 text-purple-300 px-1.5 py-0.5 rounded text-sm font-mono">
                  {codeChildren}
                </code>
              );
            }

            return <code className={`${codeClassName} font-mono`}>{codeChildren}</code>;
          },
          pre({ children: preChildren }) {
            // لو الـ pre بيغلّف مخطط mermaid ما نغلّفوش تاني بخلفية كود
            const child = Array.isArray(preChildren) ? preChildren[0] : preChildren;
            if (React.isValidElement(child) && child.type === MermaidViewer) {
              return <>{preChildren}</>;
            }
            return (
              <div className="my-3 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 not-prose" dir="ltr">
                <pre className="p-4 overflow-x-auto text-sm font-mono text-slate-200">{preChildren}</pre>
              </div>
            );
          },
          table({ children: tableChildren }) {
            return (
              <div className="my-3 overflow-x-auto rounded-xl border border-slate-800">
                <table className="min-w-full text-sm">{tableChildren}</table>
              </div>
            );
          },
          th({ children: thChildren }) {
            return (
              <th className="bg-slate-900/80 px-3 py-2 text-right font-bold text-purple-200 border-b border-slate-800">
                {thChildren}
              </th>
            );
          },
          td({ children: tdChildren }) {
            return (
              <td className="px-3 py-2 border-b border-slate-800/60 text-slate-300">{tdChildren}</td>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
