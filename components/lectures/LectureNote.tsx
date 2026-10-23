"use client";

import { Sparkles, Lightbulb, BookOpen } from "lucide-react";
import { LectureContent } from "./LectureContent";

/* ==========================================================================
   📒 بطاقات المحتوى التعليمي — Summary و Explanation (Phase 4-A polish)
   ═══════════════════════════════════════════════════════════════════════

   الغرض: يدي كل نوع هوية بصرية مختلفة، عشان الطالب يعرف من الشكل
   نفسه هل ده «مراجعة سريعة» ولا «شرح للتعليم».

   ═══ ليه اتنين مختلفين ═══
   - **Summary**: ضيق، مضغوط، عناوين وبولِت بس. زي بطاقة مراجعة في
     آخر الكتاب. الغرض: تمسحه في ٣٠ ثانية قبل الامتحان.
   - **Explanation**: أوسع، تباعد أكبر، وكتلة قراءة مريحة. الغرض:
     الطالب يقرأها ببطء ويفهم.

   ⚠️ **الفرق في الـ tone جوه `LectureContent`** (عرض أضيق + خط أكبر +
     تباعد أوسع للشرح) مش بس في الإطار. الإطار لوحده ميخلّيش الفرق
     محسوس على نص طويل.

   ⚠️ **مافيش عناوين ثابتة جوه الـ Markdown**: مثل «📌 أهم الأفكار» أو
   «🎯 الخلاصة» — دي بيجيبها الـ AI نفسه من ناتجه. هنا بنعرض عنوان
   *الحاوية* بس (ملخص/شرح) عشان يبقى واضح أنهي جزء أنت فيه.
   ═══════════════════════════════════════════════════════════════════════ */

const COPY = {
  summary: {
    icon: Sparkles,
    title: "ملخص المحاضرة",
    lede: "مراجعة سريعة لأهم ما ورد في المحاضرة.",
  },
  explanation: {
    icon: Lightbulb,
    title: "شرح المحاضرة",
    lede: "شرح مبسّط ومنظّم يساعدك تفهم محتوى المحاضرة.",
  },
} as const;

/** إطار واحد، بيتلوّن بنوع المحتوى. */
export function LectureNote({
  kind,
  content,
}: {
  kind: "summary" | "explanation";
  content: string;
}) {
  const copy = COPY[kind];
  const Icon = copy.icon;
  const isSummary = kind === "summary";

  return (
    <section
      // ⚠️ `<section>` + `aria-labelledby`: العنوان حقيقي في الـ DOM،
      // فقارئ الشاشة يعرف يبقى في «ملخص» ولا «شرح». زينة للقارئ بس
      // ومفيش أي نص تاني بيتقر.
      aria-labelledby={`lecture-${kind}-heading`}
      className={`overflow-hidden rounded-2xl border ${
        isSummary ? "border-rule bg-[var(--card-secondary)]" : "border-rule bg-[var(--card-primary)]"
      }`}
    >
      {/* ───────── الترويسة ───────── */}
      <header
        className={`flex items-start gap-3 border-b border-rule px-5 py-4 ${
          isSummary ? "bg-black/[0.03] dark:bg-white/[0.03]" : ""
        }`}
      >
        {/* ⬇️ الأيقونة مش هي اللي بتقول المعنى: العنوان النصي جنبها هو
            اللي بيوضح إيه ده. الأيقونة للتمييز البصري بس. */}
        <span
          aria-hidden
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            isSummary
              ? "bg-accent/10 text-accent"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          <Icon size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <h3
            id={`lecture-${kind}-heading`}
            className="flex items-center gap-2 text-base font-extrabold text-ink"
          >
            {isSummary ? "📝" : "🧠"} {copy.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{copy.lede}</p>
        </div>
      </header>

      {/* ───────── المحتوى ───────── */}
      <div className={`px-5 py-5 ${isSummary ? "text-[0.95rem]" : "text-[1rem]"}`}>
        <LectureContent content={content} tone={kind} />
      </div>
    </section>
  );
}

/** ترويسة صغيرة فوق التفريغ الخام — بتفرّق بين «التفريغ» و«المذكرة». */
export function TranscriptHeading() {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-soft">
      <BookOpen size={15} aria-hidden />
      <span>التفريغ النصي</span>
    </h4>
  );
}
