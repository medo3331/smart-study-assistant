"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MagicAvatar } from "@/components/MagicAvatar";
import {
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS,
  initialOnboardingState,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding/steps";

/* جولة التعريف بالمنصة — Magic يمشي الطالب خطوة بخطوة في الداشبورد.
   الحالة محفوظة على السيرفر (onboarding_progress) ⇒ بتكمل لو خرج،
   ومبتتكررش بعد الإكمال أو التخطي. بدون AI ⇒ بدون خصم. */

function stepIndex(state: OnboardingState): number {
  if (!state.currentStep) return 0;
  return ONBOARDING_STEPS.findIndex((s) => s.id === state.currentStep);
}

export function OnboardingTour() {
  const [state, setState] = useState<OnboardingState>(initialOnboardingState);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justFinished, setJustFinished] = useState(false);

  const post = useCallback(async (action: string): Promise<OnboardingState | null> => {
    try {
      const res = await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data?.state as OnboardingState) ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/progress");
        if (!res.ok) throw new Error("onboarding load failed");
        const data = await res.json();
        if (!alive) return;
        const loadedState = (data?.state as OnboardingState) ?? initialOnboardingState();
        setState(loadedState);
        // أول زيارة: نبدأ الجولة تلقائيًا (بيسجّل الحالة على السيرفر).
        if (!loadedState.started && !loadedState.completed && !loadedState.skipped) {
          const started = await post("start");
          if (alive && started) setState(started);
        }
      } catch {
        // فشل التحميل ⇒ الجولة مستخبية بصمت (best-effort زي باقي نظام Magic).
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [post]);

  if (!loaded || justFinished) {
    if (justFinished) {
      return (
        <div className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
          <MagicAvatar size="md" />
          <p className="text-sm font-bold text-[var(--color-text-primary)]">
            ✅ تمام يا بطل! أنا معاك في أي وقت — اسألني من الشات أو من الزرار العايم.
          </p>
        </div>
      );
    }
    return null;
  }

  if (state.completed) return null;
  if (state.skipped) return null;

  const step: OnboardingStep | undefined = state.currentStep
    ? ONBOARDING_STEPS.find((s) => s.id === state.currentStep)
    : undefined;
  if (!step) return null;

  const idx = stepIndex(state);
  const isLast = idx === ONBOARDING_TOTAL_STEPS - 1;

  const handleNext = async () => {
    if (saving) return;
    setSaving(true);
    const next = await post("next");
    setSaving(false);
    if (next) {
      setState(next);
      if (next.completed) {
        setJustFinished(true);
        setTimeout(() => setJustFinished(false), 4000);
      }
    }
  };

  const handleSkip = async () => {
    if (saving) return;
    setSaving(true);
    const next = await post("skip");
    setSaving(false);
    if (next) setState(next);
  };

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
      <div className="flex items-start gap-3">
        <MagicAvatar size="md" state="speaking" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow eyebrow-flush">
              جولة تعريف — خطوة {idx + 1} من {ONBOARDING_TOTAL_STEPS}
            </p>
            <button
              onClick={handleSkip}
              disabled={saving}
              className="shrink-0 text-[10px] text-ink-soft hover:text-ink transition disabled:opacity-50"
            >
              تخطي الجولة
            </button>
          </div>
          <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">
            {step.icon} {step.title}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)] leading-relaxed">{step.body}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.cta && (
              <Link
                href={step.cta.href}
                className="rounded-full border border-rule bg-paper px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-paper-3"
              >
                {step.cta.label}
              </Link>
            )}
            <button
              onClick={handleNext}
              disabled={saving}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              {isLast ? "يلا نبدأ ⚡" : "التالي ←"}
            </button>
          </div>

          {/* نقاط التقدم */}
          <div className="mt-3 flex items-center gap-1.5" aria-label={`خطوة ${idx + 1} من ${ONBOARDING_TOTAL_STEPS}`}>
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.id}
                aria-hidden
                className={`h-1.5 rounded-full transition-all ${
                  i < idx ? "w-4 bg-emerald-400" : i === idx ? "w-6 bg-emerald-500" : "w-4 bg-[var(--color-border)]"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingTour;
