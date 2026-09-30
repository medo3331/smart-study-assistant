"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, FileDown, FileText } from "lucide-react";

/* ==========================================================================
   🎓 مساحة مذاكرة المحاضرة — Phase 4-B polish
   ═══════════════════════════════════════════════════════════════════════

   السبب: الصفحة كانت بتعرض الملخص والشرح والبطاقات والأسئلة والتفريغ كلهم
   مفتوحين في نفس الوقت — «جدار» بيضيّع التركيز.

   ═══ ليه Context ═══
   حالة الفتح/الطي لازم تتبقى في مكان واحد، وكل قسم يقراها. لو مرّرناها
   كـ props لكل قسم، كل واحد فيهم هيبقى knows عن الباقي — وبقة وصعب
   التطوير. الـ context بيخلي كل قسم يشتغل لوحده: `<LectureSection id=... />`.

   ⚠️ **ليه conditional rendering (مش CSS بس)**: لو قفلنا بـ
   `display:none` بس، المحتوى المخفي لسه بيتقري من قارئ الشاشة. فتح &&
   `hidden` على الحاوية = وصول صح + حالة بتتحفظ.
   ═══════════════════════════════════════════════════════════════════════ */

export type SectionId = "summary" | "explanation" | "flashcards" | "mcq" | "transcript";

/** الأقسام اللي بتتعمل لها focus: فتح واحد بيقفل الباقي. */
const FOCUSABLE: SectionId[] = ["explanation", "flashcards", "mcq"];

type WorkspaceContextValue = {
  isOpen: (id: SectionId) => boolean;
  toggle: (id: SectionId) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("LectureSection لازم يكون جوه LectureWorkspace");
  return value;
}

export function LectureWorkspace({
  defaultOpen = ["summary"],
  children,
}: {
  defaultOpen?: SectionId[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of defaultOpen) initial[id] = true;
    return initial;
  });

  /**
   * 🎯 طيّ/فتح قسم.
   *
   * ⚠️ **منطق الـ focus**: لو القسم ده focusable، فتحه بيقفل الباقي —
   * لأن الطالب لما يفتح «شرح المحاضرة» عايز يقرأ الشرح. **بس** الفتح
   * التاني مش ممنوع: بنقفل بـ `open[x] = false` مش بنمنع الفتح.
   */
  const toggle = useCallback((id: SectionId) => {
    setOpen((prev) => {
      const isCurrentlyOpen = prev[id] === true;
      const next: Record<string, boolean> = { ...prev, [id]: !isCurrentlyOpen };
      if (!isCurrentlyOpen && FOCUSABLE.includes(id)) {
        for (const other of FOCUSABLE) {
          if (other !== id) next[other] = false;
        }
      }
      return next;
    });
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ isOpen: (id) => open[id] === true, toggle }),
    [open, toggle],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}
/* ═══════════════════════ القسم ═══════════════════════ */

/**
 * 📦 قسم قابل للطي.
 *
 * ⚠️ **`aria-expanded` + `aria-controls`**: قارئ الشاشة بيعرف القسم ده
 * مفتوح ولا مقفول، وبيقدر ينتقل للمحتوى بالضغط على الهيدر.
 */
export function LectureSection({
  id,
  icon,
  title,
  lede,
  toolbar,
  children,
}: {
  id: SectionId;
  icon: string;
  title: string;
  lede?: string;
  /** شريط أدوات اختياري (تصدير مثلاً) — بيظهر وقت الفتح بس. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const { isOpen, toggle } = useWorkspace();
  const open = isOpen(id);
  const contentId = `lecture-section-${id}`;

  return (
    <section
      aria-labelledby={`${contentId}-title`}
      className="overflow-hidden rounded-2xl border border-rule bg-[var(--card-primary)]"
    >
      <h2 id={`${contentId}-title`} className="m-0">
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-full items-center gap-3 px-5 py-3 text-start transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
        >
          <span aria-hidden className="text-lg leading-none">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">{title}</span>
            {lede && (
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{lede}</span>
            )}
          </span>
          {/* ⬇️ الأيقونة بتتقلب — إشارة بصرية أن القسم بيتفتح/يتقفل. */}
          <ChevronDown
            size={18}
            aria-hidden
            className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>

      {/* ⚠️ `hidden` مش `display:none` جوه — دي الطريقة الصح لقارئ الشاشة:
          المحتوى المقفول مابيتقريش، والمفتوح بيترجم صح. */}
      <div id={contentId} hidden={!open}>
        {open && (
          <div className="border-t border-rule px-5 py-4">
            {toolbar && <div className="mb-4">{toolbar}</div>}
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════ شريط التصدير ═══════════════════════ */

function useExport(format: "pdf" | "docx", lectureId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/lectures/${encodeURIComponent(lectureId)}/export?format=${format}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "حدث خطأ أثناء تجهيز الملف. حاول مرة أخرى.");
        return;
      }
      // ⬇️ blob مش JSON: الملف بايتات، مش رد API.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // الاسم من السيرفر، ومطهّر هناك. بنقريه من الـ header مع fallback.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      link.download = match?.[1] ?? `Magicly-lecture-explanation.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("حدث خطأ أثناء تجهيز الملف. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }, [busy, format, lectureId]);

  return { busy, error, download };
}

function ExportButton({
  format,
  lectureId,
}: {
  format: "pdf" | "docx";
  lectureId: string;
}) {
  const { busy, error, download } = useExport(format, lectureId);
  const isPdf = format === "pdf";
  const label = isPdf ? "PDF" : "Word";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-rule bg-[var(--card-secondary)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPdf ? <FileDown size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
        <span>
          {busy
            ? `جاري تجهيز ${label}...`
            : isPdf
              ? "تصدير PDF"
              : "تصدير Word"}
        </span>
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}

/** 🧰 شريط الأدوات: إخفاء + تصدير. بيظهر جوه قسم الشرح وقت الفتح. */
export function LectureToolbar({ lectureId }: { lectureId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ExportButton format="pdf" lectureId={lectureId} />
      <ExportButton format="docx" lectureId={lectureId} />
    </div>
  );
}