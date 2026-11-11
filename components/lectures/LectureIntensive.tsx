"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Clock,
  Quote,
  Sparkles,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";

import { useLectureCitation, formatTimestamp } from "./lecture-citation-context";
import { useWorkspace } from "./LectureWorkspace";
import type {
  IntensiveExplanation,
  IntensivePart,
  IntensiveSection,
} from "@/lib/ai/lecture-intensive";

/* ==========================================================================
   🧠 الشرح المكثف مع المراجع — Phase 5
   ============================================================================

   ⚠️ **الـ chip مش رقم segment معروض**: التوقيت اللي الطالب بيشوفه
      (`⏱ 12:30`) بيتقرا من `claim.start` — وده **نسخة** من
      `segments[claim.seg].start` وقت التوليد. التوقيت **مش** جاي من
      الموديل خالص.

   ⚠️ **ليه source card جوّه الصفحة مش modal**: على الموبايل، القفزة
      للتفريغ بتضيّع مكان الطالب في الشرح. الكارت بيجاوب على سؤال
      الثقة *في مكانه*، والقفزة للتفريغ بتبقى اختيارية.

   ⚠️ **ليه مفيش `dangerouslySetInnerHTML`**: نص الجملة نص عادي بيتعرّض
      كـ children — زي بقية عارضات المحتوى في المشروع.

   ⚠️ **التوليد جزء-جزء (on-demand)**: كل جزء = نداء واحد (لحدّ الـ TPM
      بتاع المزوّد). فبنولّد الجزء اللي الطالب واقف عليه بس، وبسيب
      الباقي لوقتي. ده بيخلّي الكروت تتصرف على اللي بيقراه فعلاً.
   ========================================================================== */

/** حالة الجزء من ناحية الواجهة (الفرق عن المخزَّن: `loading`). */
type PartUiState = "ready" | "pending" | "failed" | "loading";

type AskMessage = { role: "user" | "assistant"; content: string };

export function LectureIntensive({
  lectureId,
  explanation,
  onChange,
}: {
  lectureId: string;
  /** الحالة (الأجزاء) — من السيرفر. */
  explanation: IntensiveExplanation;
  /**
   * بنبلّغ الأب بالنسخة الجديدة بعد توليد جزء.
   *
   * ⚠️ **اختياري**: في داخل `LectureProcessActions` (الزرار) الأب هو
   *    صاحب الحالة ⇒ بنبلّغه. وفي قسم الصفحة (بعد refresh) مافيش أب
   *    يقدر يمسك state (Server Component) ⇒ المكوّن يشيلها بنفسه.
   */
  onChange?: (next: IntensiveExplanation) => void;
}) {
  const { focusSegment } = useLectureCitation();
  const { open: openSection } = useWorkspace();
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ⚠️ **الحالة مزدوجة المصدر**: لو الأب بيبعت `onChange` ⇒ هو صاحب
   *    الحالة. لو لأ ⇒ المكوّن يشيلها بنفسه (بعد refresh مافيش أب).
   */
  const [localParts, setLocalParts] = useState<IntensivePart[]>(explanation.parts ?? []);
  const parts = useMemo(
    () => (onChange ? (explanation.parts ?? []) : localParts),
    [onChange, explanation.parts, localParts],
  );
  const total = parts.length;
  const part = parts[current];

  /**
   * ⚠️ الترتيب مهم: **نفس الـ event** لازم يغيّر الحالتين مع بعض
   * (فتح قسم التفريغ + تفعيل المقطع). لو اتغيّروا في نداءين
   * منفصلين، الـ effect بتاع الـ viewer ممكن يركض قبل ما القسم
   * يتفتح ⇒ مفيش إبراز.
   */
  const goToTranscript = useCallback(
    (seg: number) => {
      openSection("transcript");
      focusSegment(seg);
    },
    [openSection, focusSegment],
  );

  /** يولّد جزء واحد (أو يعيد توليده). */
  const generatePart = useCallback(
    async (partIndex: number) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/lectures/${encodeURIComponent(lectureId)}/intensive`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partIndex }),
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          part?: IntensivePart;
          explanation?: IntensiveExplanation;
          error?: { code?: string; message?: string };
        } | null;

        if (!response.ok || !payload?.success || !payload.part) {
          setError(payload?.error?.message ?? "مقدرناش نجهّز الجزء ده. جرّب تاني.");
          return;
        }

        // ⚠️ الحالة الكاملة من الراوت (الجزء اتحفظ في القاعدة).
        if (payload.explanation) {
          if (onChange) onChange(payload.explanation);
          else setLocalParts(payload.explanation.parts ?? []);
        }
      } catch {
        setError("مقدرناش نجهّز الجزء ده. جرّب تاني.");
      } finally {
        setBusy(false);
      }
    },
    [lectureId, onChange],
  );

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setCurrent(index);
      setOpenClaim(null);
      setError(null);
      // ⚠️ لو الجزء ده لسه مش متولّد ⇒ نولّده on-demand (نداء واحد).
      if (parts[index]?.status !== "ready" && !busy) {
        void generatePart(index);
      }
    },
    [total, parts, busy, generatePart],
  );

  const state: PartUiState = busy ? "loading" : (part?.status ?? "pending");

  return (
    <section
      aria-labelledby="lecture-intensive-heading"
      className="overflow-hidden rounded-2xl border border-rule bg-[var(--card-primary)]"
    >
      {/* ───────── الترويسة ───────── */}
      <header className="flex items-start gap-3 border-b border-rule bg-black/[0.03] px-5 py-4 dark:bg-white/[0.03]">
        <span
          aria-hidden
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"
        >
          <Sparkles size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="lecture-intensive-heading"
            className="flex items-center gap-2 text-base font-extrabold text-ink"
          >
            🧠 شرح مكثف مع المصادر
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            شرح مفصّل، وكل معلومة فيه ليها مصدر بتوقيتها في المحاضرة.
          </p>
        </div>
      </header>

      {/* ───────── شريط الأجزاء ───────── */}
      <PartNav
        total={total}
        current={current}
        parts={parts}
        busy={busy}
        onSelect={goTo}
      />

      <div className="space-y-4 px-5 py-5">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
          >
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-ink">{error}</p>
          </div>
        )}

        {state === "loading" && <PartSkeleton />}

        {state === "failed" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
            <p className="text-sm leading-relaxed text-ink">
              {part?.error ?? "الجزء ده فشل يتولّد."}
            </p>
            <button
              type="button"
              onClick={() => void generatePart(current)}
              disabled={busy}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-rule bg-[var(--card-secondary)] px-3 text-sm font-semibold text-ink transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            >
              <RotateCcw size={15} aria-hidden />
              <span>أعد المحاولة</span>
            </button>
          </div>
        )}

        {state === "pending" && !busy && (
          <div className="rounded-xl border border-rule bg-black/[0.02] p-4 text-center dark:bg-white/[0.02]">
            <p className="text-sm leading-relaxed text-ink-soft">
              الجزء ده لسه مش متولّد.
            </p>
            <button
              type="button"
              onClick={() => void generatePart(current)}
              disabled={busy}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-rule bg-[var(--card-secondary)] px-3 text-sm font-semibold text-ink transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            >
              <Sparkles size={15} aria-hidden />
              <span>ولّد الجزء ده</span>
            </button>
          </div>
        )}

        {state === "ready" && (
          <>
            {part?.sections.map((section, sectionIndex) => (
              <IntensiveSectionBlock
                key={`${sectionIndex}-${section.heading}`}
                section={section}
                openClaim={openClaim}
                onOpenClaim={(claimId) =>
                  setOpenClaim((current) => (current === claimId ? null : claimId))
                }
                onFocusSegment={goToTranscript}
              />
            ))}

            {/* ───────── سؤال على الجزء ده ─────────
                ⚠️ `key={current}` — لما الطالب ينقل جزء، المكوّن
                    بيتفكّك ويتبنى من جديد ⇒ المحادثة القديمة (كانت على
                    الجزء القديم) بتروح. ده أنضف من `useEffect` بيصفّر
                    state (وReact بينصحAgainstه). */}
            <PartAsk key={current} lectureId={lectureId} partIndex={current} />
          </>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════ شريط الأجزاء ═══════════════════════════ */

function PartNav({
  total,
  current,
  parts,
  busy,
  onSelect,
}: {
  total: number;
  current: number;
  parts: IntensivePart[];
  busy: boolean;
  onSelect: (index: number) => void;
}) {
  const readyCount = parts.filter((p) => p.status === "ready").length;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSelect(current - 1)}
          disabled={current === 0 || busy}
          aria-label="الجزء السابق"
          className="grid h-8 w-8 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        <span className="min-w-[6.5rem] text-center text-xs font-semibold text-ink-soft">
          الجزء {current + 1} من {total}
        </span>
        <button
          type="button"
          onClick={() => onSelect(current + 1)}
          disabled={current >= total - 1 || busy}
          aria-label="الجزء التالي"
          className="grid h-8 w-8 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
      </div>

      <span className="text-[11px] text-ink-soft">
        {readyCount} من {total} متولّد
        {parts[current]?.status === "ready" && parts[current].start > 0
          ? ` · من الدقيقة ${formatTimestamp(parts[current].start)}`
          : null}
      </span>
    </div>
  );
}

/* ═══════════════════════════ هيكل تحميل ═══════════════════════════ */

/** هيكل تحميل للجزء — بيوضح إن في حاجة بتحصل. */
function PartSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="جاري تجهيز الجزء">
      <div className="h-5 w-1/3 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]" />
      <div className="h-4 w-full animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.07]" />
      <div className="h-4 w-11/12 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.07]" />
      <div className="h-4 w-9/12 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.07]" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.07]" />
      <p className="pt-1 text-xs text-ink-soft">جاري توليد الجزء ده…</p>
    </div>
  );
}

/* ═══════════════════════════ الأقسام ═══════════════════════════ */

/** قسم واحد — عنوانه وجمله. */
function IntensiveSectionBlock({
  section,
  openClaim,
  onOpenClaim,
  onFocusSegment,
}: {
  section: IntensiveSection;
  openClaim: string | null;
  onOpenClaim: (claimId: string) => void;
  onFocusSegment: (seg: number) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-base font-extrabold text-ink">{section.heading}</h4>
      <ul className="space-y-2.5">
        {section.claims.map((claim, claimIndex) => {
          const claimId = `${section.heading}-${claimIndex}`;
          const isOpen = openClaim === claimId;
          // ⚠️ `seg === null` = المرجع ما تقدرش يتحقَّق منه ⇒ الجملة
          //    بتظهر من غير chip. مخفيين الـ chip أحسن من chip مكسور.
          const hasSource = claim.seg !== null && claim.start !== null;
          return (
            <li key={claimId} className="text-[0.98rem] leading-[1.95] text-ink">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>{claim.text}</span>
                {hasSource && (
                  <button
                    type="button"
                    onClick={() => onOpenClaim(claimId)}
                    aria-expanded={isOpen}
                    aria-label={`مصدر المعلومة — الدقيقة ${formatTimestamp(claim.start as number)}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rule bg-black/[0.04] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:bg-white/[0.06]"
                  >
                    <Clock size={11} aria-hidden />
                    <span>{formatTimestamp(claim.start as number)}</span>
                  </button>
                )}
              </div>

              {isOpen && hasSource && (
                <SourceCard
                  seg={claim.seg as number}
                  start={claim.start as number}
                  onFocusSegment={onFocusSegment}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * كارت المصدر — بيظهر تحت الجملة لما الطالب يضغط على الـ chip.
 *
 * ⚠️ **ليه بيعرض رقم المقطع مش نص المقطع**: نص المقطع بيتبين لما
 *    الطالب يفتح في التفريغ (وهو بيبرزه). هنا رقم المقطع + التوقيت
 *    كفاية يأكدوا إن المعلومة لها مصدر.
 */
function SourceCard({
  seg,
  start,
  onFocusSegment,
}: {
  seg: number;
  start: number;
  onFocusSegment: (seg: number) => void;
}) {
  return (
    <div className="mt-1.5 rounded-xl border border-rule bg-black/[0.03] p-3 dark:bg-white/[0.03]">
      <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-ink-soft">
        <Quote size={12} aria-hidden />
        <span>
          المصدر: المقطع رقم {seg} — الدقيقة {formatTimestamp(start)}
        </span>
      </p>
      <button
        type="button"
        onClick={() => onFocusSegment(seg)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-[var(--card-secondary)] px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <span>افتح في التفريغ</span>
        <span aria-hidden>←</span>
      </button>
    </div>
  );
}

/* ═══════════════════════════ سؤال على الجزء ═══════════════════════════ */

/**
 * سؤال على الجزء الحالي بس.
 *
 * ⚠️ **ليه `partIndex` بيبعت مع السؤال**: عشان الـ AI يجاوب من
 *    **الجزء ده** تحديداً — مش من أول ٨٠٠٠ حرف في المحاضرة (ده اللي
 *    بيحصل في المساعد العام).
 */
function PartAsk({
  lectureId,
  partIndex,
}: {
  lectureId: string;
  partIndex: number;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/lectures/${encodeURIComponent(lectureId)}/ask`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partIndex, question: q }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        answer?: string;
        error?: { message?: string };
      } | null;

      if (!response.ok || !payload?.success) {
        setError(payload?.error?.message ?? "مقدرنش نجاوب دلوقتي. جرّب تاني.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: payload.answer ?? "—" }]);
    } catch {
      setError("مقدرنش نجاوب دلوقتي. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [question, loading, lectureId, partIndex]);

  const history = useMemo(() => messages, [messages]);

  return (
    <div className="rounded-xl border border-rule bg-black/[0.02] p-3 dark:bg-white/[0.02]">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-soft">
        <MessageCircle size={13} aria-hidden />
        <span>اسأل عن الجزء ده</span>
      </p>

      {history.length > 0 && (
        <div className="mb-2 max-h-56 space-y-2 overflow-auto">
          {history.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg p-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[color-mix(in_srgb,var(--color-interactive)_12%,transparent)] text-ink"
                  : "bg-[var(--paper-2)] text-ink"
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
          placeholder="اسأل عن الجزء ده…"
          aria-label={`سؤال عن الجزء ${partIndex + 1}`}
          className="flex-1 rounded-lg border border-rule bg-[var(--card-primary)] px-2 py-1 text-sm text-ink"
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={loading || !question.trim()}
          aria-label="إرسال السؤال"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-[var(--card-secondary)] px-3 text-sm font-semibold text-ink transition-colors hover:border-[var(--accent)] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <Send size={15} aria-hidden />
          )}
          <span>اسأل</span>
        </button>
      </div>
    </div>
  );
}
