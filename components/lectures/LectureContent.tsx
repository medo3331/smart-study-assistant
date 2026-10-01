"use client";

/* ==========================================================================
   📚 مذكرة المحاضرة — عارض Markdown آمن للمحتوى التعليمي (Phase 4-A polish)
   ═══════════════════════════════════════════════════════════════════════

   الغرض: يحوّل ناتج الـ AI (Markdown) لـ «مذكرة مذاكرة» مقروءة بدل نص
   خام. **عرض فقط** — مافيش أي تغيير في التوليد ولا البرومبت ولا القاعدة.

   ═══ ليه `react-markdown` ومش HTML عادي ═══
   المشروع عنده `react-markdown@10` + `remark-gfm` بالفعل ومستخدمين في
   `components/ui/MarkdownRenderer.tsx` (شات الـ AI). بنستخدم نفس المكتبة
   عشان مافيش بنية ثانية في المشروع.

   🔒 **الأمان (سؤال المراجعة الأول):**
     ١. مافيش `dangerouslySetInnerHTML` في الملف ده خالص.
     ٢. `rehype-raw` **مش متثبّت** — و react-markdown v10 بيعتبر أي HTML
        جوه الـ Markdown **نص عادي** ويعرضه حرفياً، فمافيش تنفيذ كود ولا
        أي وسوم. ده سلوك آمن بالافتراضي، مش إعداد نسيناه.
     ٣. الروابط: بنرفض أي رابط مش `http/https/mailto` وبنضيف
        `rel="noopener noreferrer"` — حماية من `javascript:` و target.
     ٤. كود الـ AI بيترسم كـ children (نص) مش HTML.

   ═══ ليه مافيش `prose` ═══
   `@tailwindcss/typography` **مش متثبّت** في المشروع، فكلاسات `prose` في
   العارض المشترك مالهاش أي تأثير فعلي (HTML خام). عشان كده بنكتب تنسيق
   العناصر بأنفسنا بـ Tailwind — ده اللي يخلي العناوين والقوائم تبان صح
   بدل ما تظهر زي نص عادي.
   ═══════════════════════════════════════════════════════════════════════ */

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Tone = "summary" | "explanation";

/** روابط مسموحة بس. أي حاجة تانية بتترفض وتظهر كنص. */
function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

const TONE: Record<Tone, { maxWidth: string; text: string; lead: string }> = {
  // الملخص = مراجعة سريعة، فعرض أوسع وخط أصغر شوية.
  summary: { maxWidth: "max-w-none", text: "text-[0.95rem]", lead: "leading-[1.85]" },
  // الشرح = قراءة طويلة، فعرض مريح على العين (نحو 68 محرف بالسططر).
  explanation: { maxWidth: "max-w-[68ch]", text: "text-[1rem]", lead: "leading-[1.95]" },
};

/** عناوين Markdown → عناوين HTML حقيقية عشان قارئات الشاشة تشوف الترتيب. */
const HEADING_CLASS: Record<string, string> = {
  h1: "mt-6 mb-3 text-xl font-extrabold text-ink first:mt-0",
  h2: "mt-7 mb-3 text-lg font-extrabold text-ink first:mt-0",
  h3: "mt-6 mb-2 text-base font-bold text-ink first:mt-0",
  h4: "mt-5 mb-2 text-sm font-bold text-ink first:mt-0",
  h5: "mt-4 mb-2 text-sm font-bold text-ink-soft first:mt-0",
  h6: "mt-4 mb-2 text-xs font-bold text-ink-soft first:mt-0",
};

export function LectureContent({
  content,
  tone = "explanation",
}: {
  content: string;
  tone?: Tone;
}) {
  const cfg = TONE[tone];

  return (
    <div
      // ⚠️ `dir="rtl"` صريح: الصفحة ممكن تكون LTR لو المستخدم غيّر لغة
      // الموقع، والمحتوى عربي فلازم يفضل RTL مستقل عن إعداد الصفحة.
      dir="rtl"
      className={`w-full ${cfg.maxWidth} ${cfg.text} ${cfg.lead} text-ink break-words`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...Object.fromEntries(
            Object.entries(HEADING_CLASS).map(([tag, cls]) => [
              tag,
              ({ children }: { children?: React.ReactNode }) =>
                React.createElement(tag, { className: cls }, children),
            ]),
          ),

          p: ({ children }) => (
            // ⚠️ فاصل بين الفقرات: من غيره النص العربي بيبقى «جدار» صعب
            // القراءة، وده أشهر شكوى على المحاضرات الطويلة.
            <p className="mb-4 last:mb-0">{children}</p>
          ),

          strong: ({ children }) => (
            <strong className="font-bold text-ink">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,

          ul: ({ children }) => (
            <ul className="mb-4 ms-1 list-disc space-y-2 ps-5 last:mb-0 marker:text-accent">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 ms-1 list-decimal space-y-2 ps-5 last:mb-0 marker:font-bold marker:text-accent">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="ps-1">{children}</li>,

          /** 💡 الكال-أوت: ده اللي بيخلي `> ببساطة:` يبان كـ tip card. */
          blockquote: ({ children }) => (
            <blockquote className="my-4 rounded-xl border-s-4 border-accent bg-[var(--card-secondary)] px-4 py-3 text-ink">
              {children}
            </blockquote>
          ),

          hr: () => <hr className="my-6 border-0 border-t border-rule" />,

          code: ({ className: codeClass, children }) => {
            const isBlock =
              /language-(\w+)/.test(codeClass ?? "") ||
              String(children ?? "").includes("\n");
            // البلوك بيرسمه الـ `pre`، عشان ما نكرّروش المسافات.
            if (isBlock) return null;
            return (
              // `dir="ltr"` على الكود inline: مصطلحات زي `NP-hard` أو
              // `O(n log n)` بتتقطع لو اتقرت RTL.
              <code
                dir="ltr"
                className="inline-block rounded-md bg-black/10 px-1.5 py-0.5 font-mono text-[0.85em] text-ink dark:bg-white/10"
              >
                {children}
              </code>
            );
          },

          pre: ({ children }) => (
            // ⚠️ `overflow-x-auto` على البلوك نفسه: كود طويل كان هيكسر
            // عرض الموبايل بدل ما يعمل سكرول أفقي.
            <div className="my-4 overflow-x-auto rounded-xl border border-rule bg-black/5 p-4 dark:bg-white/10">
              <pre dir="ltr" className="font-mono text-[0.85rem] leading-relaxed text-ink">
                {children}
              </pre>
            </div>
          ),

          a: ({ href, children }) => {
            const safe = typeof href === "string" && isSafeHref(href);
            if (!safe) {
              // ⚠️ رابط مش موثوق بيتحوّل نص عادي — مش بنعمله anchor.
              return <span className="text-ink underline decoration-dotted">{children}</span>;
            }
            return (
              <a
                href={href}
                // ⬇️ noopener: من غيرها الصفحة اللي بتفتح في تاب جديد
                // تقدر توصل لـ `window.opener` وتوجّه النافذة الأصلية.
                rel="noopener noreferrer"
                target="_blank"
                className="font-medium text-accent underline underline-offset-4"
              >
                {children}
              </a>
            );
          },

          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-rule">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-rule bg-black/5 px-3 py-2 text-start font-bold text-ink dark:bg-white/10">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-rule px-3 py-2 align-top text-ink-soft">{children}</td>
          ),

          /** صورة: بنمنعها بالكامل. الـ AI مابيحطش صور، ولو حطّ واحدة
           *  برابط خارجي كانت هتتتبع الطالب. بنعرض alt كنص بدل كده. */
          img: ({ alt }) => <span className="text-ink-soft">{alt ?? ""}</span>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
