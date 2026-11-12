"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  MessageCircle,
  Presentation,
  Sparkles,
  X,
} from "lucide-react";

import { setAiSeed } from "@/app/dashboard/components/nav-config";
import { fileKindFor } from "./FileKindIcon";

/* ==========================================================================
   ✦ «ماذا تحب نعمل بيه؟» — action sheet بعد الرفع
   ============================================================================

   ⚠️ **ليه دي أهم من الكارت نفسه**: الرفع بيخلّي الطالب ياخد كارت في
   شبكة وخلاص — ومفيش أي حاجة بتقوله إن الملف ده **بينفع** معاه ٣
   حاجات. الـ sheet بتخلي الرفع **تحويل** (upload ⇒ action).

   ⚠️ **بتتقفل من غير ضرر**: Escape / click خارج / زر الإغلاق — وكل
   الخيارات **بتفضل متاحة** من كارت الملف نفسه.

   ⚠️ **الأسعار ظاهرة**: «١ credit» — عشان القرار يكون معلوم مش مفاجئ.
   ========================================================================== */

type Action = "deck" | "summary" | "ask";

export function DocumentActionSheet({
  materialId,
  title,
  content,
  fileType,
  onDeck,
  onClose,
}: {
  materialId: string;
  title: string;
  content: string;
  fileType: string | null;
  /** «عرض تقديمي» — فتح اللوحة (أو توليد أول جزء). */
  onDeck: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** تلخيص — نداء مباشر على `/api/ai/file-analysis`. */
  const runSummary = useCallback(async () => {
    setBusy("summary");
    setError(null);
    try {
      const res = await fetch("/api/ai/file-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId, action: "summarize" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "مقدرناش نلخّص الملف.");
        return;
      }
      setSummary(body?.result ?? "");
    } catch {
      setError("مقدرناش نلخّص الملف.");
    } finally {
      setBusy(null);
    }
  }, [materialId]);

  /** «اسأل» — نزرع المصدر في المساعد ونوديه. */
  const runAsk = useCallback(() => {
    setAiSeed(title, content);
    const params = new URLSearchParams();
    params.set("subject", title);
    params.set("content", content.slice(0, 4000));
    router.push(`/chat?${params.toString()}`);
  }, [title, content, router]);

  const tiles: Array<{
    action: Action;
    icon: typeof Sparkles;
    title: string;
    desc: string;
    credit: string;
    disabled?: boolean;
    onClick: () => void;
  }> = [
    {
      action: "deck",
      icon: Presentation,
      title: "عرض تقديمي",
      desc: "شرائح مع مرجع لكل نقطة",
      credit: "١ credit",
      // ⚠️ **النوع من (MIME + الامتداد)** — الـ MIME لوحده ممكن يكون
      //    فاضي أو نوع تاني ⇒ بلاطة «عرض تقديمي» كانت بتطلع **معطّلة**
      //    على ملفات PDF سليمة.
      disabled: !["pdf", "pptx", "docx"].includes(fileKindFor(fileType, title)),
      onClick: () => {
        onDeck();
        onClose();
      },
    },
    {
      action: "summary",
      icon: FileText,
      title: "تلخيص",
      desc: "أهم النقاط + أسئلة",
      credit: "١ credit",
      onClick: () => void runSummary(),
    },
    {
      action: "ask",
      icon: MessageCircle,
      title: "اسأل عن الملف",
      desc: "المصدر جوّه إجابات المساعد",
      credit: "مجاني",
      onClick: runAsk,
    },
  ];

  return (
    <div className="rounded-2xl border border-rule bg-[var(--card-secondary)] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold text-ink">
          <Sparkles size={13} className="text-[var(--accent)]" aria-hidden />
          <span>ماذا تحب نعمل بيه؟</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="grid h-6 w-6 place-items-center rounded-md border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <X size={12} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const loading = busy === tile.action;
          return (
            <button
              key={tile.action}
              type="button"
              onClick={tile.onClick}
              disabled={tile.disabled || busy !== null}
              className="flex flex-col items-center gap-1 rounded-xl border border-rule bg-[var(--card-primary)] p-2.5 text-center transition-all hover:border-[var(--accent)] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <span
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                  color: "var(--accent)",
                }}
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : (
                  <Icon size={15} aria-hidden />
                )}
              </span>
              <span className="text-[11px] font-bold leading-tight text-ink">
                {tile.title}
              </span>
              <span className="text-[10px] leading-tight text-ink-soft">
                {tile.desc}
              </span>
              <span className="tag-box mono mt-0.5 text-[9px] text-ink-soft">
                {tile.credit}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-ink"
        >
          {error}
        </p>
      )}

      {summary && (
        <div className="rounded-xl border border-rule bg-[var(--card-primary)] p-3">
          <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">
            ✦ الملخّص
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink">
            {summary}
          </pre>
        </div>
      )}
    </div>
  );
}
