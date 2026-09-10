"use client";
/* eslint-disable react-hooks/set-state-in-effect -- MatchMedia is an intentional external-system sync. */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Home, BookOpen, FolderOpen, Landmark, Sparkles,
  ShoppingBag, BarChart3, Settings, GraduationCap,
} from "lucide-react";

/* ===========================================================================
   شعار ماجيكلي — حرف M + نجمة رباعية (من public/logo-mark.svg و BrandLogo)
   =========================================================================== */
function MagiclyGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56.87 45"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="8.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* M stroke — يتم رسمه تدريجياً عبر CSS animation على stroke-dasharray */}
      <path
        d="M4.15 40.8L4.15 5.8L23.67 22.55L39.47 5.6"
        strokeDasharray="120"
        strokeDashoffset="120"
        className="m-stroke"
      />
      {/* النجمة الرباعية — تظهر بنبضة */}
      <path
        d="M48.17 0Q48.17 8.65 56.87 8.65Q48.17 8.65 48.17 17.3Q48.17 8.65 39.47 8.65Q48.17 8.65 48.17 0Z"
        fill="currentColor"
        className="star-fill"
      />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   ألوان الحدود للـ 9 أفرع (كل فرع لون مختلف حسب البرومبت)
   -------------------------------------------------------------------------- */
const BRANCH_COLORS = [
  { border: "#E8342F", glow: "#E8342F", bgHover: "rgba(232,52,47,0.12)" }, // الرئيسية — أحمر
  { border: "#F2994A", glow: "#F2994A", bgHover: "rgba(242,153,74,0.12)" }, // الكورسات — برتقالي
  { border: "#F2C94C", glow: "#F2C94C", bgHover: "rgba(242,201,76,0.12)" }, // الدرس — أصفر
  { border: "#6FCF97", glow: "#6FCF97", bgHover: "rgba(111,207,151,0.12)" }, // مساحة العمل — أخضر
  { border: "#2FD4C4", glow: "#2FD4C4", bgHover: "rgba(47,212,196,0.12)" }, // العبادات — تركواز
  { border: "#4FA9F5", glow: "#4FA9F5", bgHover: "rgba(79,169,245,0.12)" }, // AI — أزرق
  { border: "#7B7EF4", glow: "#7B7EF4", bgHover: "rgba(123,126,244,0.12)" }, // المتجر — بنفسجي فاتح
  { border: "#B57BF4", glow: "#B57BF4", bgHover: "rgba(181,123,244,0.12)" }, // التحليلات — بنفسجي
  { border: "#F26FA1", glow: "#F26FA1", bgHover: "rgba(242,111,161,0.12)" }, // الإعدادات — وردي
];

/* --------------------------------------------------------------------------
   المسارات الحقيقية من المشروع
   -------------------------------------------------------------------------- */
export interface WheelBranchDef {
  id: string;
  label: string;
  latin: string;
  href: string;
  icon: React.ReactNode;
  exists: boolean;
  note?: string;
  kind: "page" | "signal" | "scroll" | "todo";
}

export const WHEEL_BRANCHES: WheelBranchDef[] = [
  { id: "home", label: "الرئيسية", latin: "Home", href: "/dashboard", icon: <Home size={18} strokeWidth={2} aria-hidden />, exists: true, kind: "page" },
  { id: "courses", label: "الكورسات", latin: "Courses", href: "/dashboard/courses", icon: <BookOpen size={18} strokeWidth={2} aria-hidden />, exists: true, note: "صفحة موجودة", kind: "page" },
  { id: "lesson", label: "الدرس", latin: "Lesson", href: "/lesson", icon: <GraduationCap size={18} strokeWidth={2} aria-hidden />, exists: true, kind: "page" },
  { id: "workspace", label: "مساحة العمل", latin: "Workspace", href: "/dashboard/workspace", icon: <FolderOpen size={18} strokeWidth={2} aria-hidden />, exists: true, note: "صفحة موجودة", kind: "page" },
  { id: "worship", label: "عباداتي", latin: "Worship", href: "/worship", icon: <Landmark size={18} strokeWidth={2} aria-hidden />, exists: true, kind: "page" },
  { id: "ai", label: "المساعد الذكي", latin: "AI Assistant", href: "/chat", icon: <Sparkles size={18} strokeWidth={2} aria-hidden />, exists: true, note: "صفحة المحادثة", kind: "page" },
  { id: "shop", label: "المتجر", latin: "Shop", href: "/shop", icon: <ShoppingBag size={18} strokeWidth={2} aria-hidden />, exists: true, kind: "page" },
  { id: "analytics", label: "التحليلات", latin: "Analytics", href: "/dashboard#analytics", icon: <BarChart3 size={18} strokeWidth={2} aria-hidden />, exists: true, note: "قسم scrollTo داخل /dashboard", kind: "scroll" },
  { id: "settings", label: "الإعدادات", latin: "Settings", href: "/dashboard", icon: <Settings size={18} strokeWidth={2} aria-hidden />, exists: true, note: "إشارة signal: settings داخل /dashboard", kind: "signal" },
];

const ANGLES_DEG = [270, 230, 190, 150, 110, 70, 30, -10, -50];

/* --------------------------------------------------------------------------
   Props للربط بالخطة
   -------------------------------------------------------------------------- */
export interface MagicWheelProps {
  currentDay?: number;
  currentDayId?: string | null;
  totalDays?: number;
  subject?: string;
  completedSteps?: number;
  progressPct?: number;
  currentChapter?: number;
}

/* ===========================================================================
   المكون الرئيسي
   =========================================================================== */
export default function MagicWheelDashboard({
  currentDay, currentDayId = null, totalDays, subject, completedSteps, progressPct, currentChapter,
}: MagicWheelProps = {}) {
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isVertical, setIsVertical] = useState(false);

  /* التنقل */
  const handleNavigate = useCallback(
    (branch: WheelBranchDef) => {
      if (!branch.exists) {
        console.warn(`[MagicWheel] المسار غير موجود فعليًا: ${branch.href}`);
        return;
      }
      if (branch.kind === "signal") {
        try {
          if (typeof window !== "undefined") {
            const intent = branch.id === "ai"
              ? JSON.stringify({ kind: "modal", target: "ai" })
              : branch.id === "settings"
                ? JSON.stringify({ kind: "modal", target: "settings" })
                : null;
            if (intent) window.sessionStorage.setItem("nav_intent", intent);
          }
        } catch { /* ignore */ }
        router.push(branch.href);
        return;
      }
      if (branch.kind === "scroll") {
        router.push(branch.href);
        return;
      }
      if (branch.id === "lesson") {
        router.push(currentDayId ? `/lesson/${currentDayId}` : "/dashboard");
        return;
      }
      router.push(branch.href);
    },
    [router, currentDayId]
  );

  /* Responsive */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 480px)");
    setIsVertical(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsVertical(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: "#000000", minHeight: "100vh", direction: "rtl" }}
      aria-label="عجلة ماجيك — التنقل الدائري للداشبورد"
    >
      {/* خلفية توهّج خفيف أحمر */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 42%, rgba(232,52,47,0.10) 0%, transparent 60%)",
          zIndex: 0,
        }}
        aria-hidden
      />

      {/* زر تبديل العرض (موبايل) */}
      <button
        onClick={() => setIsVertical((v) => !v)}
        className="fixed top-4 left-4 z-50 md:hidden flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1c1c1c] bg-[#0d0d0d]/90 text-[#f1f1f4] text-xs font-semibold shadow-lg backdrop-blur-sm hover:border-[#E8342F] transition"
        aria-label={isVertical ? "تبديل للعرض الدائري" : "تبديل للعرض العمودي"}
        tabIndex={0}
      >
        <span className="text-[#E8342F]">↻</span>
        <span>{isVertical ? "دائري" : "عمودي"}</span>
      </button>

      <div className="relative z-10 max-w-[1100px] mx-auto px-4 md:px-8 py-8 md:py-16 flex flex-col items-center justify-center gap-8 md:gap-12">

        {/* العنوان */}
        <header className="text-center space-y-2">
          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-[900] tracking-tight leading-[0.95] text-[#f1f1f4]"
            style={{ fontFamily: "'Cinzel Decorative', Georgia, serif", textShadow: "0 0 40px rgba(232,52,47,0.30)" }}
          >
            Magic
          </h1>
          <p className="text-[#a0a0a8] text-sm md:text-base font-medium tracking-[0.18em] uppercase">Wheel — عجلة التنقل</p>
        </header>

        {/* ═══════════════════════════════════════════════════════
            العرض الدائري
            ═══════════════════════════════════════════════════════ */}
        {!isVertical && (
          <div className="relative w-full max-w-[720px] aspect-square flex items-center justify-center">

            {/* الحلقة الخارجية — dashed أحمر */}
            <div
              className="absolute rounded-full border-2 border-dashed border-[#E8342F]/30"
              style={{ width: "clamp(320px, 64vw, 480px)", height: "clamp(320px, 64vw, 480px)", animation: "rotateDashed 28s linear infinite" }}
              aria-hidden
            />
            {/* الحلقة الوسطى — dotted بلون أفتح */}
            <div
              className="absolute rounded-full border-[1.5px] border-dotted border-[#E8342F]/25"
              style={{ width: "clamp(270px, 54vw, 400px)", height: "clamp(270px, 54vw, 400px)", animation: "rotateDotted 40s linear infinite reverse" }}
              aria-hidden
            />

            {/* الخطوط بين المركز والأفرع + النقاط المتحركة */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-[5]" aria-hidden>
              <defs>
                {WHEEL_BRANCHES.map((_, i) => (
                  <linearGradient key={i} id={`line-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="35%" stopColor="#E8342F" stopOpacity="0.45" />
                    <stop offset="60%" stopColor="#E8342F" stopOpacity="0.70" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                ))}
              </defs>
              {WHEEL_BRANCHES.map((b, i) => {
                const a = ANGLES_DEG[i];
                const r = 42;
                const rad = ((a - 90) * Math.PI) / 180;
                const cx = 50 + Math.sin(rad) * r;
                const cy = 50 + Math.cos(rad) * r;
                return (
                  <g key={b.id}>
                    <line
                      x1="50%" y1="50%"
                      x2={`${cx}%`} y2={`${cy}%`}
                      stroke={`url(#line-grad-${i})`}
                      strokeWidth="1.5" strokeLinecap="round"
                      strokeDasharray="300" strokeDashoffset="300"
                      style={{ animation: `drawLine 1.1s ease-out ${i * 160}ms forwards` }}
                    />
                    <circle r="3.5" fill="#E8342F" filter="drop-shadow(0 0 6px #E8342F)">
                      <animateMotion
                        dur="2.6s" begin={`${i * 160 + 900}ms`}
                        repeatCount="indefinite" calcMode="linear"
                        path={`M50 50 L${cx} ${cy}`}
                      />
                    </circle>
                  </g>
                );
              })}
            </svg>

            {/* ═══════════════════════════════════════════════════════
                المركز — البكرة الحمراء + شعار Magicly (M + نجمة)
                ═══════════════════════════════════════════════════════ */}
            <Link
              href="/dashboard"
              className="absolute z-20 flex flex-col items-center justify-center rounded-full bg-[#E8342F] border-[2.5px] border-[#E8342F]/40 shadow-[0_0_80px_rgba(232,52,47,0.45),inset_0_0_40px_rgba(255,255,255,0.08)] hover:scale-105 transition-transform duration-300 outline-none focus-visible:ring-[3px] focus-visible:ring-[#FFB13B] focus-visible:ring-offset-4"
              style={{ width: 170, height: 170, animation: "pulseInner 5s ease-in-out infinite" }}
              aria-label="Magic — العودة للرئيسية"
            >
              {/* شعار Magicly — حرف M + نجمة رباعية مع أنيميشن رسم */}
              <MagiclyGlyph className="w-14 h-11 text-[#FFB13B] drop-shadow-[0_0_12px_#FFB13B]" />
            </Link>

            {/* ═══════════════════════════════════════════════════════
                الـ 9 أفرع — دوائر كاملة بلون مختلف لكل فرع
                ═══════════════════════════════════════════════════════ */}
            {WHEEL_BRANCHES.map((b, i) => {
              const a = ANGLES_DEG[i];
              const r = 36;
              const rad = ((a - 90) * Math.PI) / 180;
              const cx = 50 + Math.sin(rad) * r;
              const cy = 50 + Math.cos(rad) * r;
              const color = BRANCH_COLORS[i];
              const delayMs = i * 130;
              return (
                <a
                  key={b.id}
                  href={b.exists ? (b.id === "lesson" ? (currentDayId ? `/lesson/${currentDayId}` : "/dashboard") : b.href) : undefined}
                  onClick={(e) => {
                    if (!b.exists) {
                      e.preventDefault();
                      handleNavigate(b);
                      return;
                    }
                    handleNavigate(b);
                  }}
                  className="absolute block outline-none select-none focus-visible:ring-[3px] focus-visible:ring-offset-4 rounded-full transition-all duration-300 hover:scale-110 hover:-translate-y-1"
                  style={{
                    top: `${cy}%`, left: `${cx}%`,
                    transform: `translate(-50%, -50%)`,
                    animationDelay: `${delayMs}ms`,
                    width: "clamp(80px, 13vw, 120px)",
                    height: "clamp(80px, 13vw, 120px)",
                  }}
                  aria-label={`${b.label} — ${b.latin}`}
                  tabIndex={0}
                  role="link"
                >
                  {/* الدائرة — لون مختلف لكل فرع */}
                  <div
                    className="relative w-full h-full rounded-full border-[2.5px] flex flex-col items-center justify-center gap-1 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-all duration-300 hover:shadow-[0_6px_30px_rgba(0,0,0,0.7)]"
                    style={{
                      borderColor: color.border,
                      backgroundColor: "#0d0d0d",
                      boxShadow: `0 0 20px ${color.glow}30`,
                      animation: `popIn 0.65s ease-out ${delayMs}ms both, floatBranch 5s ease-in-out infinite ${delayMs + 1100}ms`,
                    }}
                  >
                    {/* أيقونة بلون الفرع */}
                    <span className="text-[#f1f1f4] transition-transform duration-300 hover:rotate-[-4deg] hover:scale-110" style={{ color: color.border }}>
                      {b.icon}
                    </span>
                    <span className="text-[0.58rem] md:text-[0.62rem] font-extrabold text-[#f1f1f4] leading-tight text-center tracking-wide" style={{ color: color.border }}>
                      {b.label}
                    </span>
                    <span className="text-[0.42rem] md:text-[0.45rem] font-mono tracking-[0.15em] uppercase" style={{ color: color.glow }}>
                      {b.latin}
                    </span>
                    {/* بيانات الخطة إذا وُجدت */}
                    {(subject || currentDay || completedSteps !== undefined) && b.id === "home" && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#E8342F] text-white text-[0.45rem] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">
                        {subject ? `${subject}` : ""}{currentDay !== undefined ? ` · يوم ${currentDay}` : ""}{totalDays ? `/${totalDays}` : ""}
                      </span>
                    )}
                    {subject && b.id === "courses" && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#F2994A] text-[#0d0d0d] text-[0.45rem] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">{subject}</span>
                    )}
                    {currentDay && b.id === "lesson" && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#F2C94C] text-[#0d0d0d] text-[0.45rem] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">يوم {currentDay}</span>
                    )}
                    {currentChapter && b.id === "workspace" && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#6FCF97] text-[#0d0d0d] text-[0.45rem] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">فصل {currentChapter}</span>
                    )}
                    {!b.exists && (
                      <span className="absolute -top-1.5 -right-1 bg-[#E8342F] text-white text-[0.5rem] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg">!</span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            العرض العمودي (موبايل <480px)
            ═══════════════════════════════════════════════════════ */}
        {isVertical && (
          <div className="w-full max-w-md grid grid-cols-2 gap-3 md:hidden">
            {WHEEL_BRANCHES.map((b) => {
              const color = BRANCH_COLORS[WHEEL_BRANCHES.findIndex((x) => x.id === b.id)];
              return (
                <a
                  key={b.id}
                  href={b.exists ? (b.id === "lesson" ? (currentDayId ? `/lesson/${currentDayId}` : "/dashboard") : b.href) : undefined}
                  onClick={(e) => {
                    if (!b.exists) { e.preventDefault(); handleNavigate(b); return; }
                    handleNavigate(b);
                  }}
                  className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl border-[2px] bg-[#0d0d0d] hover:shadow-[0_6px_24px_rgba(232,52,47,0.3)] transition shadow-sm focus-visible:ring-[2px] focus-visible:ring-offset-2 outline-none"
                  style={{ borderColor: color.border }}
                  aria-label={`${b.label} — ${b.latin}`}
                  tabIndex={0}
                  role="link"
                >
                  <span className="text-[1.4rem]" style={{ color: color.border }}>{b.icon}</span>
                  <div className="min-w-0 text-center">
                    <span className="block text-sm font-extrabold text-[#f1f1f4]" style={{ color: color.border }}>{b.label}</span>
                    <span className="block text-[0.55rem] font-mono tracking-wider text-[#777]">{b.latin}</span>
                  </div>
                  {!b.exists && <span className="bg-[#E8342F] text-white text-[0.45rem] font-bold px-1.5 py-0.5 rounded-full">!</span>}
                </a>
              );
            })}
          </div>
        )}

        {/* قسم معلومات الربط */}
        <div className="w-full max-w-3xl rounded-2xl border border-[#1c1c1c]/60 bg-[#0a0a0c]/80 backdrop-blur-sm px-5 py-5 md:px-6 md:py-6">
          <h2 className="text-sm font-bold text-[#f1f1f4] mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8342F] inline-block" />
            قائمة الربط الفعلي لكل فرع
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs leading-relaxed">
            {WHEEL_BRANCHES.map((b) => (
              <div key={b.id} className="flex items-start gap-2">
                <span className={`mt-[3px] block w-1.5 h-1.5 rounded-full shrink-0 ${b.exists ? "bg-[#E8342F]" : "bg-[#FF6B5B]/60"}`} />
                <div className="min-w-0">
                  <span className="font-semibold text-[#f1f1f4]">{b.label}</span>
                  <span className="text-[#777] mx-1">→</span>
                  <code className="text-[#FFB13B] font-mono text-[0.7rem] truncate inline-block max-w-[120px] align-bottom">{b.href}</code>
                  {!b.exists && <span className="block text-[#FF6B5B] text-[0.65rem] mt-0.5">⚠️ {b.note ?? "صفحة غير موجودة — TODO"}</span>}
                  {b.exists && b.note && <span className="block text-[#777] text-[0.65rem] mt-0.5">ℹ {b.note}</span>}
                  <span className="inline-block text-[0.6rem] text-[#555] ml-1 align-top">({b.kind === "page" ? "صفحة" : b.kind === "signal" ? "إشارة" : b.kind === "scroll" ? "تمرير" : "ناقص"})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* أنيميشن CSS */}
      <style jsx global>{`
        @keyframes rotateDashed { to { transform: rotate(360deg); } }
        @keyframes rotateDotted { to { transform: rotate(-360deg); } }
        @keyframes pulseInner { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes floatBranch { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes drawLine { from{stroke-dashoffset:300} to{stroke-dashoffset:0} }
        @keyframes popIn { from{opacity:0; transform:scale(0.55) translateY(14px)} to{opacity:1; transform:scale(1) translateY(0)} }
        @keyframes drawStroke { to { stroke-dashoffset: 0; } }
        @keyframes fadeOut { 0%{opacity:1; transform:scale(1)} 60%{opacity:1; transform:scale(1)} 100%{opacity:0; transform:scale(0.85)} }
        @keyframes pulseStar { 0%,100%{transform:scale(1); opacity:1} 50%{transform:scale(1.15); opacity:0.85} }
        .m-stroke { animation: drawStroke 2s ease-out 0.3s forwards; }
        .star-fill { animation: pulseStar 3s ease-in-out infinite; }
      `}</style>
    </section>
  );
}
