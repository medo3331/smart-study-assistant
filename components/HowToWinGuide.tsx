"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { COIN_SOURCES } from "@/lib/shop/economy";
import { STEP_XP_REWARD } from "@/lib/retention/nudges";

/* ==========================================================================
   دليل «إزاي تتصدّر وتكسب» — زرار `?` بيفتح مودال قصير

   ليه موجود: الطالب عنده دلوقتي XP وكوينز ولوحة متصدرين وإنجازات، بس مفيش
   مكان واحد يقول «بتعمل إيه عشان تزيدهم». الشرح متفرّق على صفحة المتجر
   وصفحة الإنجازات والمهام، فالنتيجة إن الأرقام بتبان زي أرقام مالهاش سبب.

   ⚠️ الأرقام كلها من التوكنز الاقتصادية (COIN_SOURCES + STEP_XP_REWARD)،
   مش مكتوبة بالإيد هنا — أي تعديل في الاقتصاد بيتحدّث لوحده في الشرح.

   ⚠️ النبرة: شرح قاعدة، مش ضغط. «بتكسب كذا لما تعمل كذا».
   ========================================================================== */

const coin = (id: keyof typeof COIN_SOURCES) => COIN_SOURCES[id].amount;

const SECTIONS = [
  {
    id: "leaderboard",
    icon: "🏆",
    title: "إزاي تتصدّر لوحة المتصدرين؟",
    intro: "الترتيب بالـ XP الكلي — مش بعدد الدقايق ولا عدد الفتحات.",
    points: [
      `إكمال مرحلة من خطتك = ${STEP_XP_REWARD} XP (أكبر عائد في المنصة).`,
      "معركة البوس في آخر الفصل بتدي XP + وسام.",
      "كويز المجتمع بيدي XP بسقف يومي — تمرين إضافي، مش بديل للمذاكرة.",
    ],
    cta: { label: "شوف الإنجازات", href: "/dashboard/achievements" },
  },
  {
    id: "coins",
    icon: "🪙",
    title: "إزاي تجمع كوينز؟",
    intro: "الكوينز بتتكسب بالمذاكرة بس — مفيش شرا بفلوس.",
    points: [
      `دخول اليوم = ${coin("daily_login")} كوين.`,
      `مرحلة مكتملة = ${coin("day_done")} كوين (٣ مراحل في اليوم كحد أقصى).`,
      `هدف من المخطط = ${coin("goal_done")} كوين.`,
      `يوم في السلسلة = ${coin("streak_day")} كوين، ومحطات السلسلة بونص إضافي.`,
      "مهمة يومية = ٥ كوين، ومهمة الأسبوع = ١٥٠ كوين.",
    ],
    cta: { label: "افتح المهام", href: "/missions" },
  },
  {
    id: "achievements",
    icon: "🎖️",
    title: "إزاي تفتح الإنجازات؟",
    intro: "كل إنجاز بيتحقق من أرقامك الحقيقية، وبيتحفظ مرة واحدة بمكافأته.",
    points: [
      "إنجازات المراحل: أول مرحلة، ١٠ مراحل، ٥٠ مرحلة.",
      "إنجازات السلسلة: ٧ أيام، ٣٠ يوم.",
      "إنجاز المستوى: وصل للمستوى ٥ (كل ٢٠٠ XP مستوى).",
      "إنجازات البوس والتراك: أول وسام، وأول تراك كامل.",
    ],
    cta: { label: "افتح صفحة الإنجازات", href: "/dashboard/achievements" },
  },
] as const;

export function HowToWinGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-rule bg-paper-3 text-ink-soft transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className ?? ""}`}
        aria-label="دليل: إزاي تتصدّر وتكسب"
        title="إزاي تتصدّر وتكسب؟"
      >
        <HelpCircle size={16} aria-hidden />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="إزاي تتصدّر وتكسب؟">
        <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>
          كل الأرقام دي بتتجمّع من نشاط حقيقي على المنصة. ابدأ من أي واحدة — الباقي بيتبع.
        </p>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pe-1">
          {SECTIONS.map((section) => (
            <section key={section.id} className="rounded-[var(--r-sm)] border border-rule bg-paper p-4 space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text)" }}>
                <span aria-hidden>{section.icon}</span>
                <span>{section.title}</span>
              </h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {section.intro}
              </p>
              <ul className="space-y-1.5">
                {section.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: "var(--text)" }}>
                    <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={section.cta.href}
                className="inline-flex items-center gap-1 text-xs font-semibold transition-colors"
                style={{ color: "var(--accent)" }}
              >
                {section.cta.label} ←
              </Link>
            </section>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet text-sm transition-colors">
            تمام
          </button>
        </div>
      </Modal>
    </>
  );
}
