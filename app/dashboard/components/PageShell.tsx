"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NavRail } from "./NavRail";
import { THEME_STYLES } from "./theme-helpers";
import { PEN_THEME_KEY } from "./nav-config";
import { FeedbackWidget, type FeedbackPage } from "@/components/FeedbackWidget";
import type { ThemeColor } from "./types";

/* ==========================================================================
   قشرة الصفحات الفرعية

   كل صفحة تحت /dashboard بتلبس نفس القشرة: نفس الشريط الجانبي، نفس الحشو
   اللي بيمنع المحتوى من إنه يدخل تحت الشريط، ونفس الترويسة.

   ليه مش layout.tsx؟ لأن صفحة الداشبورد نفسها بتركّب NavRail بإعدادات
   مختلفة (بتفتح مودالاتها من غير تنقّل)، فلو حطّينا الشريط في الـ layout
   كان هيتكرر مرتين عندها.
   ========================================================================== */

function isThemeColor(v: unknown): v is ThemeColor {
  return v === "amber" || v === "emerald" || v === "coral" || v === "cyan";
}

/** لون القلم المختار. الداشبورد بتحفظه محلياً، والصفحات دي بتقراه. */
export function usePenTheme(): ThemeColor {
  const [theme, setTheme] = useState<ThemeColor>("amber");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PEN_THEME_KEY);
      if (isThemeColor(saved)) setTheme(saved);
          } catch {
      // الستوريج مقفول — الأصفر ديفولت مقبول
    }
  }, []);
  return theme;
}

interface PageShellProps {
  /** لافتة صغيرة فوق العنوان */
  eyebrow: string;
  title: string;
  /** سطر شرح تحت العنوان */
  lede?: string;
  /** حاجة تتحط على يسار الترويسة (زرار مثلاً) */
  action?: React.ReactNode;
  /**
   * معرّف الصفحة لسؤال الرأي.
   *
   * ⚠️ حطّه هنا مش في كل صفحة على حدة: القشرة دي بتلبسها كل الصفحات
   * الفرعية، فسطر واحد هنا بيغطّي المخطط والكورسات ومساحة العمل
   * والتقويم والإنجازات والمسار المهني والشرايح مرة واحدة.
   * لو اتساب فاضي الودجت مابتظهرش — فأي صفحة جديدة لازم تمرّره.
   */
  feedbackPage?: FeedbackPage;
  /** اسم الميزة في سؤال الرأي. الافتراضي عنوان الصفحة. */
  feedbackLabel?: string;
  children: React.ReactNode;
}

export function PageShell({
  eyebrow,
  title,
  lede,
  action,
  feedbackPage,
  feedbackLabel,
  children,
}: PageShellProps) {
  const router = useRouter();
  const theme = usePenTheme();
  const themeStyles = THEME_STYLES[theme];

  return (
    <div
      className="min-h-screen p-4 sm:p-6 md:p-10 lg:pe-[16.5rem] xl:pe-[18.5rem] font-sans bg-paper text-ink pb-24"
      dir="rtl"
    >
      <NavRail themeStyles={themeStyles} />

      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="eyebrow eyebrow-flush mb-2">{eyebrow}</p>
            {/* الضربة الوحيدة في الصفحة: عنوانها */}
            <h1 className="h2">
              <span className="mark mark-tilt">{title}</span>
            </h1>
            {lede && <p className="text-xs text-ink-soft leading-relaxed mt-2 max-w-xl">{lede}</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {action}
            <button onClick={() => router.push("/dashboard")} className="btn btn-quiet text-sm">
              الداشبورد
            </button>
          </div>
        </div>

        {children}
      </div>

      {feedbackPage && (
        <FeedbackWidget page={feedbackPage} featureLabel={feedbackLabel ?? title} />
      )}
    </div>
  );
}

/* ---- حالة فاضية موحّدة: بنفس شكل الملزمة، مش صندوق رمادي ---- */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="sheet-card p-8 text-center space-y-2">
      <p className="text-3xl leading-none" aria-hidden>
        {icon}
      </p>
      <p className="font-display font-extrabold text-base text-ink">{title}</p>
      <p className="text-xs text-ink-soft leading-relaxed max-w-sm mx-auto">{body}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/* ---- سكيلتون تحميل: نفس إيقاع الكروت عشان الصفحة ماتنقزش ---- */
export function LoadingSheets({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="sr-only">بيحمّل</p>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sheet-card p-5 space-y-3">
          <div className="skel skel-line w-1/3" />
          <div className="skel skel-line w-2/3" />
        </div>
      ))}
    </div>
  );
}

/* ---- رسالة خطأ موحّدة. بتستعمل لـ «الجدول لسه ما اتعملش» كمان ---- */
export function DataNotice({ message }: { message: string }) {
  return (
    <div className="notice notice-error" role="alert">
      <span aria-hidden>⚠️</span>
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}