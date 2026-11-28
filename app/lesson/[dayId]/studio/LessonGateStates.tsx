"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LessonShell, GlassCard } from "../components/LessonChrome";

/* ==========================================================================
   شاشات البوابة (P1-9) — منقولة حرفيًا من page.tsx:
   تحميل / مش موجود / مقفول — نفس الـ markup والنصوص.
   ========================================================================== */

export function LessonLoadingScreen() {
  return (
    <LessonShell>
      <div className="flex min-h-screen items-center justify-center" dir="rtl">
        <p className="text-sm text-[var(--muted)]">بيحمّل الدرس…</p>
      </div>
    </LessonShell>
  );
}

export function LessonNotFoundScreen() {
  const router = useRouter();
  return (
    <LessonShell>
      <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
        <GlassCard className="w-full max-w-sm space-y-4 p-6">
          <div>
            <p className="mb-1.5 text-xs font-bold tracking-wide text-[var(--accent-highlight)]">مش موجود</p>
            <h1 className="text-lg font-bold text-[var(--text)]">الدرس ده مش متاح</h1>
          </div>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            الدرس ده مش موجود، أو معندكش صلاحية توصله من الحساب ده.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--on-marker)] text-sm font-semibold transition-colors hover:brightness-110"
          >
            الرجوع للداشبورد
          </button>
        </GlassCard>
      </div>
    </LessonShell>
  );
}

export function LessonLockedScreen({ previousDayId, configId }: { previousDayId: string | null; configId: string }) {
  const router = useRouter();
  return (
    <LessonShell>
      <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
        <GlassCard className="w-full max-w-sm space-y-4 p-6">
          <div>
            <p className="mb-1.5 text-xs font-bold tracking-wide text-[var(--accent-highlight)]">مقفول</p>
            <h1 className="text-lg font-bold text-[var(--text)]">الدرس ده لسه مقفول</h1>
          </div>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            خلّص الدرس اللي قبله الأول عشان يفتح. تقدر كمان تفتحه بدري من الداشبورد مقابل 150 XP.
          </p>
          <div className="flex flex-col gap-2">
            {previousDayId && (
              <button
                onClick={() => router.push(`/lesson/${previousDayId}`)}
                className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--on-marker)] text-sm font-semibold transition-colors hover:brightness-110"
              >
                افتح الدرس السابق
              </button>
            )}
            <button
              onClick={() => router.push(`/lessons/${configId}`)}
              className="inline-flex h-10 w-full items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--text)] text-sm font-semibold transition-colors hover:bg-[var(--card-secondary)]"
            >
              كل دروس المادة
            </button>
          </div>
        </GlassCard>
      </div>
    </LessonShell>
  );
}
