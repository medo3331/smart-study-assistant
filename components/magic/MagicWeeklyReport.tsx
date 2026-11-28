"use client";

// components/magic/MagicWeeklyReport.tsx
//
// 📊 تقرير الأسبوع من Magic — كارت على الداشبورد:
//   ملخص الأسبوع (أرقام حقيقية من السيرفر) + زر تحميل PDF ملون
//   + زر ناقش التقرير في الشات الكامل.

import { useEffect, useState } from "react";
import Link from "next/link";

interface WeeklySummary {
  weekStart: string;
  today: string;
  xp: number;
  level: number;
  streak: number;
  tasksDoneThisWeek: number;
  pendingTasks: number;
  coinsThisWeek: number;
  studyDaysThisWeek: number;
}

const ar = (n: number) => n.toLocaleString("ar-EG");

function StatChip({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rule bg-paper px-2.5 py-2 text-center">
      <p className="text-base leading-none" aria-hidden>
        {emoji}
      </p>
      <p className="tnum mt-1 text-sm font-black text-ink">{value}</p>
      <p className="text-[10px] text-ink-soft">{label}</p>
    </div>
  );
}

export function MagicWeeklyReport() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/magic/weekly-report");
        const data = await res.json();
        if (alive && data?.summary) setSummary(data.summary as WeeklySummary);
      } catch {
        // الفشل هنا صامت — الكارت بيختفي بمحتواه العام
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function downloadPdf() {
    if (pdfState === "loading") return;
    setPdfState("loading");
    try {
      const res = await fetch("/api/magic/weekly-report?pdf=1");
      const data = await res.json();
      if (!data?.pdf?.dataUrl) throw new Error("no pdf");
      const a = document.createElement("a");
      a.href = data.pdf.dataUrl as string;
      a.download = (data.pdf.filename as string) || "magic-weekly-report.pdf";
      a.click();
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  }

  const chatHref = `/chat?q=${encodeURIComponent("ابعتي تقرير أسبوعي مفصل عن مذاكرتي وأهداف الأسبوع الجاي")}`;

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">📊</span>
        <h3 className="text-sm font-black text-ink">تقرير الأسبوع من Magic</h3>
      </div>

      {summary ? (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <StatChip emoji="📚" label="أيام مذاكرة" value={`${ar(summary.studyDaysThisWeek)}/٧`} />
            <StatChip emoji="✅" label="مهام خلصت" value={ar(summary.tasksDoneThisWeek)} />
            <StatChip emoji="🪙" label="كوينز الأسبوع" value={ar(summary.coinsThisWeek)} />
            <StatChip emoji="🔥" label="السلسلة" value={ar(summary.streak)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={pdfState === "loading"}
              className="text-xs font-bold px-3 py-1.5 rounded-full text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
            >
              {pdfState === "loading" ? "⏳ بيتجهز..." : pdfState === "error" ? "⚠️ فشل — جرب تاني" : "📄 حمل التقرير PDF"}
            </button>
            <Link
              href={chatHref}
              className="text-xs font-bold px-3 py-1.5 rounded-full border border-rule bg-paper text-ink transition hover:bg-paper-3"
            >
              💬 ناقش تقريري مع Magic
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-ink-soft leading-relaxed">
          آخر الأسبوع Magic بيجمعلك أرقام مذاكرتك الحقيقية — مهام، كوينز، سلسلة — ويجهزلك تقرير PDF.
        </p>
      )}
    </div>
  );
}
