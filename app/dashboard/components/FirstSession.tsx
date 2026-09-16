"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

interface FirstSessionProps {
  completedSteps: number;
  totalSteps: number;
  /** overallProgress 0-100 or 0 if no plan */
  progressPct: number;
  subject: string;
  /** current day object or null — for deep link to lesson */
  currentDayId?: string | null;
  onContinue: () => void;
  onOpenAi: () => void;
}

const LS_DISMISSED = "firstSessionDismissed";
const LS_MINI_DISMISSED = "firstSessionMiniDismissed";

/**
 * First Session — "ماذا تريد أن تفعل اليوم؟"
 *
 * يظهر كأول بلوك في الداشبورد:
 *  - أول زيارة (لا إنجاز + لم يُغلق): كارت كامل بـ 5 مسارات
 *  - زيارة راجعة (أُغلق أو عنده تقدّم): شريط مصغّر أفقي
 *  - بعد إغلاق المصغّر: يختفي تمامًا
 *
 * كل التوجيهات تستخدم مسارات موجودة بالفعل — لا صفحات جديدة.
 * كل الأرقام (progressPct / totalSteps / completedSteps) من حالة الداشبورد الحقيقية.
 */
export function FirstSession({
  completedSteps,
  totalSteps,
  progressPct,
  subject,
  currentDayId,
  onContinue,
  onOpenAi,
}: FirstSessionProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [miniDismissed, setMiniDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(LS_DISMISSED) === "1");
      setMiniDismissed(localStorage.getItem(LS_MINI_DISMISSED) === "1");
    } catch {
      // localStorage unavailable (private mode) — show full once
    }
  }, []);

  const hasProgress = completedSteps > 0;
  const hasPlan = totalSteps > 0;

  const persistDismiss = useCallback(() => {
    try {
      localStorage.setItem(LS_DISMISSED, "1");
    } catch {}
    setDismissed(true);
  }, []);

  const handleSkip = useCallback(() => {
    persistDismiss();
  }, [persistDismiss]);

  const handleDismissMini = useCallback(() => {
    try {
      localStorage.setItem(LS_MINI_DISMISSED, "1");
    } catch {}
    setMiniDismissed(true);
  }, []);

  // Intent handlers — كل واحد يغلق الكارت الكامل ثم يوجّه
  const handleStudy = useCallback(() => {
    persistDismiss();
    if (hasPlan) {
      onContinue();
    } else {
      router.push("/dashboard/create");
    }
  }, [hasPlan, onContinue, persistDismiss, router]);

  const handleReview = useCallback(() => {
    persistDismiss();
    // مسار المراجعة الحقيقي — الكورسات تحتوي StudySections والبطاقات
    // لو المستخدم داخل صفحة الداشبورد نفسها، الأفضل scroll بدل تنقّل
    // لكن التنقّل لـ /dashboard/courses أوضح ولا يعتمد على DOM id
    if (hasPlan) {
      // حاول الـ scroll أولاً لو القسم موجود، وإلا انتقل للكورسات
      const el = document.getElementById("study-sections") || document.querySelector("details");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // افتح الـ details لو مقفول
        const details = document.querySelector("details") as HTMLDetailsElement | null;
        if (details && !details.open) details.open = true;
        return;
      }
    }
    router.push("/dashboard/courses");
  }, [hasPlan, persistDismiss, router]);

  const handleExam = useCallback(() => {
    persistDismiss();
    router.push("/exams");
  }, [persistDismiss, router]);

  const handleAsk = useCallback(() => {
    persistDismiss();
    onOpenAi();
  }, [onOpenAi, persistDismiss]);

  const handleContinuePlan = useCallback(() => {
    persistDismiss();
    if (currentDayId) {
      router.push(`/lesson/${currentDayId}`);
      return;
    }
    onContinue();
  }, [currentDayId, onContinue, persistDismiss, router]);

  // Avoid flash before localStorage read
  if (!mounted) return null;
  // User fully dismissed mini — hide completely
  if (miniDismissed) return null;

  const showFull = !dismissed && !hasProgress;
  // بعد الإغلاق أو عند وجود تقدّم: شريط مصغّر (ما لم يُغلق هو أيضًا)
  const showMini = !showFull;

  if (showFull) {
    return (
      <motion.section
        aria-label="ماذا تريد أن تفعل اليوم"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 0.8, 0.36, 1] }}
        className="relative overflow-hidden rounded-[24px] border backdrop-blur-xl p-5 sm:p-6"
        style={{
          backgroundColor: "var(--card-primary)",
          borderColor: "var(--rule)",
          boxShadow: "0 10px 36px var(--shade)",
        }}
      >
        {/* hairline */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(to left, transparent, var(--accent) 42%, transparent)",
            opacity: 0.5,
          }}
        />
        {/* wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(520px 360px at 90% 0%, color-mix(in srgb, var(--accent) 7%, transparent) 0%, transparent 65%)",
          }}
        />

        <div className="relative">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-sm"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)",
                  }}
                  aria-hidden
                >
                  🎯
                </span>
                <h2 className="text-[18px] font-bold leading-none sm:text-[20px]" style={{ color: "var(--text)" }}>
                  ماذا تريد أن تفعل اليوم؟
                </h2>
              </div>
              <p className="mt-2 max-w-[520px] text-sm leading-5" style={{ color: "var(--muted)" }}>
                اختر نيّتك — نوصّلك مباشرة بدون لفّ. يمكنك تغيير اختيارك في أي وقت.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="hidden items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition hover:brightness-110 active:scale-[0.98] sm:inline-flex"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                color: "var(--muted)",
                border: "1px solid var(--rule)",
              }}
              aria-label="تخطي والذهاب للداشبورد"
            >
              تخطّي · اذهب للداشبورد <span aria-hidden>←</span>
            </button>
          </div>

          {/* 5 intent cards */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3">
            {/* أذاكر — الأكثر اختيارًا */}
            <motion.button
              type="button"
              onClick={handleStudy}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0, ease: [0.22, 0.8, 0.36, 1] }}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-[20px] border p-[18px] text-right backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] active:scale-[0.98]"
              style={{
                backgroundColor: "var(--card-primary)",
                borderColor: "var(--rule)",
                boxShadow: "0 6px 20px var(--shade)",
              }}
              aria-label="أذاكر — ابدأ درسًا جديدًا أو أكمل من حيث توقفت"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)",
                    color: "var(--accent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
                  }}
                  aria-hidden
                >
                  📚
                </span>
                <span
                  className="inline-flex items-center rounded-full px-2 py-1 font-mono text-[10px] font-semibold"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
                    color: "var(--accent-highlight)",
                    border: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
                  }}
                >
                  الأكثر اختيارًا
                </span>
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
                  أذاكر
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>
                  ابدأ درسًا جديدًا أو أكمل من حيث توقفت
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>
                ابدأ الآن <span aria-hidden>←</span>
              </span>
            </motion.button>

            {/* أراجع */}
            <motion.button
              type="button"
              onClick={handleReview}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.045, ease: [0.22, 0.8, 0.36, 1] }}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-[20px] border p-[18px] text-right backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] active:scale-[0.98]"
              style={{
                backgroundColor: "var(--card-primary)",
                borderColor: "var(--rule)",
                boxShadow: "0 6px 20px var(--shade)",
              }}
              aria-label="أراجع — مراجعة ما ذاكرته وتثبيت المعلومات"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent-highlight) 12%, transparent)",
                  color: "var(--accent-highlight)",
                  border: "1px solid color-mix(in srgb, var(--accent-highlight) 14%, transparent)",
                }}
                aria-hidden
              >
                🔄
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
                  أراجع
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>
                  مراجعة ما ذاكرته وتثبيت المعلومات
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-highlight)" }}>
                مراجعة سريعة <span aria-hidden>←</span>
              </span>
            </motion.button>

            {/* أختبر نفسي */}
            <motion.button
              type="button"
              onClick={handleExam}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.09, ease: [0.22, 0.8, 0.36, 1] }}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-[20px] border p-[18px] text-right backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] active:scale-[0.98]"
              style={{
                backgroundColor: "var(--card-primary)",
                borderColor: "var(--rule)",
                boxShadow: "0 6px 20px var(--shade)",
              }}
              aria-label="أختبر نفسي — اختبر فهمك بأسئلة ذكية"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
                style={{
                  backgroundColor: "rgba(251,146,60,0.13)",
                  color: "#FB923C",
                  border: "1px solid rgba(251,146,60,0.14)",
                }}
                aria-hidden
              >
                📝
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
                  أختبر نفسي
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>
                  اختبر فهمك بأسئلة ذكية وتقييم فوري
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#FB923C" }}>
                ابدأ الاختبار <span aria-hidden>←</span>
              </span>
            </motion.button>

            {/* أفهم حاجة صعبة */}
            <motion.button
              type="button"
              onClick={handleAsk}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.135, ease: [0.22, 0.8, 0.36, 1] }}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-[20px] border p-[18px] text-right backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] active:scale-[0.98]"
              style={{
                backgroundColor: "var(--card-primary)",
                borderColor: "var(--rule)",
                boxShadow: "0 6px 20px var(--shade)",
              }}
              aria-label="أفهم حاجة صعبة — اشرح لي نقطة معينة ببساطة"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
                style={{
                  backgroundColor: "rgba(167,139,250,0.14)",
                  color: "#A78BFA",
                  border: "1px solid rgba(167,139,250,0.15)",
                }}
                aria-hidden
              >
                🧠
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
                  أفهم حاجة صعبة
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>
                  اشرح لي نقطة معيّنة ببساطة وأمثلة
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#A78BFA" }}>
                اسأل المساعد <span aria-hidden>←</span>
              </span>
            </motion.button>

            {/* أكمل خطتي — مميز */}
            <motion.button
              type="button"
              onClick={handleContinuePlan}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.18, ease: [0.22, 0.8, 0.36, 1] }}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-[20px] border p-[18px] text-right backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] active:scale-[0.98] sm:col-span-2 lg:col-span-1"
              style={{
                background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--card-primary)), var(--card-primary))",
                borderColor: "color-mix(in srgb, var(--accent) 22%, var(--rule))",
                boxShadow: "0 8px 28px var(--shade)",
              }}
              aria-label={`أكمل خطتي — متابعة الخطة ${subject ? `في ${subject}` : ""}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
                  style={{ backgroundColor: "var(--accent)", color: "white" }}
                  aria-hidden
                >
                  🎯
                </span>
                <div className="text-right">
                  <p className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
                    أكمل خطتي
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {hasPlan ? `الخطوة ${completedSteps + 1} من ${totalSteps}` : "ابدأ خطتك الأولى"}
                    {hasPlan && progressPct > 0 ? ` · ${progressPct}%` : ""}
                  </p>
                </div>
                {hasPlan && (
                  <span
                    className="mr-auto hidden items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold sm:inline-flex"
                    style={{ backgroundColor: "var(--accent)", color: "white" }}
                  >
                    {progressPct}% ← تابع
                  </span>
                )}
              </div>
              {hasPlan && (
                <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(0, progressPct))}%`, backgroundColor: "var(--accent)" }}
                  />
                </div>
              )}
              <span className="inline-flex items-center gap-1 text-xs font-semibold sm:hidden" style={{ color: "var(--accent)" }}>
                تابع خطتي <span aria-hidden>←</span>
              </span>
            </motion.button>
          </div>

          {/* Hint */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} aria-hidden />
              اختيارك يوجّهك مباشرة — بدون أسئلة إضافية
            </span>
            <span className="hidden opacity-40 sm:inline" aria-hidden>
              ·
            </span>
            <span>يمكنك تغييره من الداشبورد في أي وقت</span>
            <button
              type="button"
              onClick={handleSkip}
              className="mr-auto rounded-full px-3 py-1.5 text-xs font-semibold sm:hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid var(--rule)",
                color: "var(--muted)",
              }}
            >
              تخطّي
            </button>
          </div>
        </div>
      </motion.section>
    );
  }

  // ── Mini bar — للزائر الراجع ──────────────────────────────────────────
  if (showMini) {
    return (
      <motion.section
        aria-label="اختصار النية — تكمل إيه النهاردة"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 0.8, 0.36, 1] }}
        className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-[20px] border p-4 backdrop-blur-xl"
        style={{
          backgroundColor: "var(--card-primary)",
          borderColor: "var(--rule)",
          boxShadow: "0 8px 30px var(--shade)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(to left, transparent, var(--accent) 42%, transparent)",
            opacity: 0.45,
          }}
        />
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
            color: "var(--accent)",
          }}
          aria-hidden
        >
          🎯
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
            تكمل إيه النهاردة؟
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            اختيار سريع — يوصّلك مباشرة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:mr-auto">
          <button
            type="button"
            onClick={handleStudy}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
              color: "var(--accent-highlight)",
              border: "1px solid color-mix(in srgb, var(--accent) 16%, transparent)",
            }}
          >
            📚 أذاكر
          </button>
          <button
            type="button"
            onClick={handleReview}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: "rgba(45,212,191,0.10)",
              color: "#2DD4BF",
              border: "1px solid rgba(45,212,191,0.14)",
            }}
          >
            🔄 أراجع
          </button>
          <button
            type="button"
            onClick={handleExam}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: "rgba(251,146,60,0.10)",
              color: "#FB923C",
              border: "1px solid rgba(251,146,60,0.14)",
            }}
          >
            📝 أختبر
          </button>
          <button
            type="button"
            onClick={handleAsk}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: "rgba(167,139,250,0.10)",
              color: "#A78BFA",
              border: "1px solid rgba(167,139,250,0.14)",
            }}
          >
            🧠 أفهم
          </button>
          <button
            type="button"
            onClick={handleContinuePlan}
            className="rounded-full px-3.5 py-1.5 text-xs font-bold transition hover:brightness-110 active:scale-95"
            style={{ backgroundColor: "var(--accent)", color: "white", border: "1px solid var(--accent)" }}
          >
            🎯 أكمل خطتي
          </button>
        </div>

        <button
          type="button"
          onClick={handleDismissMini}
          aria-label="إخفاء شريط الاختيار السريع"
          className="hidden h-7 w-7 items-center justify-center rounded-full text-xs transition hover:bg-white/10 sm:inline-flex"
          style={{ color: "var(--muted)", border: "1px solid transparent" }}
          title="إخفاء"
        >
          ✕
        </button>
      </motion.section>
    );
  }

  return null;
}
