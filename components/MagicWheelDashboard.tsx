"use client";

/* ==========================================================================
   🎡 عجلة ماجيك — بوّابة التنقل الدائرية للداشبورد
   --------------------------------------------------------------------------
   النسخة المنفِّذة لتصميم magiclly-design-final المعتمد:
   • 9 أفرع، كل واحد يودي على مسار حقيقي من المشروع (لا placeholder).
   • الألوان كلها من توكينز data-theme → الثيمات الأربعة (ملوّن/أسود-أحمر/
     أزرق/أبيض-رمادي) تشتغل عليها فورًا، والحفظ في localStorage.theme عبر
     ThemeProvider الموجود (مفيش نظام متوازي).
   • الإحصاءات والرسوم موصولة ببيانات حقيقية من الداشبورد (props من
     app/dashboard/page.tsx): كورسات من study_configs، تقدم من study_days،
     streak من profiles، نشاط من activity_log. مفيش أي mock.
   • الحركة محترمة لـ prefers-reduced-motion، وكل فرع Link حقيقي (كي بورد +
     focus ring + aria-label).
   ملاحظة: كلاسات `.wheel-*` في globals.css بتاعة عجلة حظ المتجر — دي `.mw-*`.
   ========================================================================== */

import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/* ميديا-كوئيري بدون setState جوه effect — النمط الموصى بيه في React 19
   (بيتفادى تحذير react-hooks/set-state-in-effect وبيتحدّث لحظيًا).
   SSR بيرندر الوضع الدائري، والعميل بيصوب أول حاجة لو الشاشة صغيرة. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    useCallback(
      (onStoreChange) => {
        const mql = window.matchMedia(query);
        mql.addEventListener("change", onStoreChange);
        return () => mql.removeEventListener("change", onStoreChange);
      },
      [query],
    ),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Home, BookOpen, FolderOpen, Landmark, Sparkles,
  ShoppingBag, BarChart3, Settings, GraduationCap, Bell, Flame,
} from "lucide-react";
import {
  useTheme,
  MAGIC_THEME_CYCLE,
  COLORFUL_WHEEL_THEMES,
  THEME_META,
  type ThemeId,
} from "@/theme/ThemeProvider";
import { useReducedMotion } from "@/lib/useReducedMotion";
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/* --------------------------------------------------------------------------
   ألوان الأفرع — وضع «الملون» بس (في باقي الثيمات الفرع بياخد لون الأكسنت).
   -------------------------------------------------------------------------- */
const BRANCH_COLORS = [
  "#E8342F", // الرئيسية — أحمر
  "#F2994A", // الكورسات — برتقالي
  "#F2C94C", // الدرس — أصفر
  "#6FCF97", // مساحة العمل — أخضر
  "#2FD4C4", // العبادات — تركواز
  "#4FA9F5", // المساعد الذكي — أزرق
  "#7B7EF4", // المتجر — بنفسجي فاتح
  "#B57BF4", // التحليلات — بنفسجي
  "#F26FA1", // الإعدادات — وردي
] as const;

/* مواضع الأفرع التسعة على الدائرة (نفس هندسة البريف المعتمد). */
const ANGLES_DEG = [270, 230, 190, 150, 110, 70, 30, -10, -50];

/* ==========================================================================
   تعريفات الأفرع — المسارات مستخرجة من app/ فعليًا (انضبطت يوم التنفيذ):
     /  ·  /dashboard/courses  ·  /lesson/[dayId]  ·  /dashboard/workspace
     /worship  ·  /chat  ·  /shop  ·  /dashboard/progress
     والإعدادات إجراء (openSettings) مش صفحة — درج الإعدادات جوه الداشبورد.
   ========================================================================== */
export type WheelBranchId =
  | "home" | "courses" | "lesson" | "workspace" | "worship"
  | "ai" | "shop" | "analytics" | "settings";

export interface WheelBranchDef {
  id: WheelBranchId;
  label: string;
  latin: string;
  icon: React.ReactNode;
  /** "link" = Next Link لمسار حقيقي · "action" = إجراء داخل الصفحة */
  kind: "link" | "action";
  href?: string;
  /** ملاحظة للجدول المرجعي في صفحة /magic-wheel */
  note: string;
}

export function buildWheelBranches(opts: { currentDay?: number | null; currentDayId?: string | null } = {}): WheelBranchDef[] {
  const { currentDay, currentDayId } = opts;
  return [
    { id: "home", label: "الرئيسية", latin: "Home", icon: <Home size={18} strokeWidth={2} aria-hidden />, kind: "link", href: "/", note: "صفحة الهبوط الرئيسية" },
    { id: "courses", label: "الكورسات", latin: "Courses", icon: <BookOpen size={18} strokeWidth={2} aria-hidden />, kind: "link", href: "/dashboard/courses", note: "قايمة التراكات (study_configs)" },
    {
      id: "lesson",
      label: currentDay ? `الدرس — يوم ${currentDay}` : "ابدأ درسك",
      latin: "Lesson",
      icon: <GraduationCap size={18} strokeWidth={2} aria-hidden />,
      kind: "link",
      // ⚠️ مفيش /lesson index — المسار الحقيقي /lesson/[dayId] ولازم id الدرس
      // الحقيقي (uuid من study_days) مش رقم اليوم — رقم اليوم لوحده بيرمي
      // المستخدم على «الدرس ده مش متاح». من غير id صالح بنفضّل الداشبورد
      // (لو فيه خطة بتتجهز) أو بوابة التوليد (لو مفيش خطة خالص).
      href: currentDayId ? `/lesson/${currentDayId}` : currentDay ? "/dashboard" : "/dashboard/create",
      note: currentDayId
        ? `/lesson/${currentDayId} (درس يوم ${currentDay} الحالي)`
        : currentDay
          ? "id الدرس لسه بيتحمّل → /dashboard"
          : "مفيش خطة بعد → /dashboard/create",
    },
    { id: "workspace", label: "مساحة العمل", latin: "Workspace", icon: <FolderOpen size={18} strokeWidth={2} aria-hidden />, kind: "link", href: "/dashboard/workspace", note: "الملفات والمذاكرة" },
    { id: "worship", label: "عباداتي", latin: "Worship", icon: <Landmark size={18} strokeWidth={2} aria-hidden />, kind: "link", href: "/worship", note: "الصلوات + الأذكار + القرآن" },
    { id: "ai", label: "المساعد الذكي", latin: "AI Assistant", icon: <Sparkles size={18} strokeWidth={2} aria-hidden />, kind: "link", href: "/chat", note: "الشات الحقيقي (/chat) — بقرار من المستخدم" },
    { id: "shop", label: "المتجر", latin: "Shop", icon: <ShoppingBag size={18} strokeWidth={2} aria-hidden />, kind: "link", href: "/shop", note: "نقاطك والرفيق والبالتات" },
    { id: "analytics", label: "التحليلات", latin: "Analytics", icon: <BarChart3 size={18} strokeWidth={2} aria-hidden />, kind: "link", href: "/dashboard/progress", note: "تقدم المنهج — صفحة فعلية" },
    { id: "settings", label: "الإعدادات", latin: "Settings", icon: <Settings size={18} strokeWidth={2} aria-hidden />, kind: "action", note: "مفيش صفحة إعدادات — بيفتح درج الإعدادات جوه /dashboard" },
  ];
}

/** للنسخ المرجعي (جدول الربط في صفحة /magic-wheel المستقلة). */
export const WHEEL_BRANCHES = buildWheelBranches();

/* --------------------------------------------------------------------------
   بيانات الداشبورد الحقيقية اللي بتنزل للعجلة كـ props
   -------------------------------------------------------------------------- */
export interface WheelSubjectDatum {
  name: string;
  /** إجمالي أيام الخطة للمادة دي */
  value: number;
  completed: number;
}

export interface WheelChartPoint {
  label: string;
  minutes: number;
  tasks: number;
}

export interface MagicWheelProps {
  /* التراك الحالي (من صفحة الداشبورد) */
  currentDay?: number;
  /** id الحقيقي لدرس اليوم الحالي (uuid من study_days) — بدونه رابط الدرس بيتكسر */
  currentDayId?: string | null;
  totalDays?: number;
  subject?: string;
  completedSteps?: number;
  progressPct?: number;
  currentChapter?: number;
  /* إحصاءات حقيقية */
  streak?: number;
  coursesCount?: number | null;
  subjectBreakdown?: WheelSubjectDatum[];
  /* رسم النشاط (نفس داتا activity_log اللي بتغذي AnalyticsSection) */
  activeChartData?: WheelChartPoint[];
  analyticsRange?: "weekly" | "monthly";
  onChangeRange?: (r: "weekly" | "monthly") => void;
  weeklyFocusHoursLabel?: string;
  notificationsEnabled?: boolean;
  /* فتح درج الإعدادات بدون تنقّل — الداشبورد بيمرّر setIsMenuOpen(true) */
  onOpenSettings?: () => void;
}

/* --------------------------------------------------------------------------
   قراية توكينز الثيم كألوان صريحة — recharts بيرسم SVG وvar() جوه
   presentation attributes مش مضمونة. نفس نمط app/dashboard/components/
   use-css-vars.ts، بس النسخة هنا مصغّرة عشان الكومبوننت يفضل مستقل.
   -------------------------------------------------------------------------- */
function useThemeColors() {
  const [colors, setColors] = useState({
    accent: "#E23A3A",
    highlight: "#FF6B5B",
    muted: "#8A8F98",
    rule: "rgba(128,128,128,0.25)",
    card: "#111113",
    text: "#f1f1f4",
  });
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
      setColors({
        accent: v("--accent", "#E23A3A"),
        highlight: v("--accent-highlight", "#FF6B5B"),
        muted: v("--muted", "#8A8F98"),
        rule: v("--rule", "rgba(128,128,128,0.25)"),
        card: v("--card-primary", "#111113"),
        text: v("--text", "#f1f1f4"),
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

/* ===========================================================================
   شعار ماجيكلي — حرف M + نجمة رباعية (public/logo-mark.svg)
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
      <path
        d="M4.15 40.8L4.15 5.8L23.67 22.55L39.47 5.6"
        strokeDasharray="120"
        strokeDashoffset="120"
        className="mw-glyph-m"
      />
      <path
        d="M48.17 0Q48.17 8.65 56.87 8.65Q48.17 8.65 48.17 17.3Q48.17 8.65 39.47 8.65Q48.17 8.65 48.17 0Z"
        fill="currentColor"
        className="mw-glyph-star"
      />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   كارت الفرع (أيقونة + اسم عربي + لافتة لاتينية) — مستخدّم في الوضعيين
   -------------------------------------------------------------------------- */
function BranchFace({
  branch, color, badge,
}: {
  branch: WheelBranchDef;
  color: string;
  badge?: string;
}) {
  return (
    <span className="relative flex h-full w-full flex-col items-center justify-center gap-1">
      <span style={{ color }} className="transition-transform duration-300">
        {branch.icon}
      </span>
      <span
        className="px-1 text-center text-[0.56rem] font-extrabold leading-tight tracking-wide md:text-[0.62rem]"
        style={{ color }}
      >
        {branch.label}
      </span>
      <span
        className="font-mono text-[0.42rem] uppercase tracking-[0.15em] md:text-[0.45rem]"
        style={{ color: `color-mix(in srgb, ${color} 70%, white 8%)` }}
      >
        {branch.latin}
      </span>
      {badge && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.45rem] font-bold text-[#0d0d0d] shadow-md"
          style={{ backgroundColor: color }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}

/* ===========================================================================
   المكوّن الرئيسي
   =========================================================================== */
export default function MagicWheelDashboard(props: MagicWheelProps = {}) {
  const {
    currentDay, currentDayId, totalDays, subject, completedSteps, progressPct, currentChapter,
    streak, coursesCount, subjectBreakdown,
    activeChartData, analyticsRange, onChangeRange, weeklyFocusHoursLabel,
    notificationsEnabled, onOpenSettings,
  } = props;

  const { theme, setTheme } = useTheme();
  const themeId = theme as ThemeId;
  const colorful = COLORFUL_WHEEL_THEMES.has(themeId);
  const reduced = useReducedMotion();
  const colors = useThemeColors();
  const router = useRouter();

  /* أقل من 640px (زي ما البريف بيعمل) → شبكة عمودية بدل الدائرة */
  const isVertical = useMediaQuery("(max-width: 640px)");

  const branches = buildWheelBranches({ currentDay, currentDayId });

  /* الإعدادات: إجراء مش مسار. من جوه الداشبورد بنفتح الدرج على طول؛ من أي
     صفحة تانية بنكتب النية في sessionStorage وننقل — نفس مفتاح/فورمات
     nav-config.ts (التكرار هنا مقصود زي ما الـ proxy بيكرر منطق الدور). */
  const openSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    try {
      window.sessionStorage.setItem(
        "nav_intent",
        JSON.stringify({ kind: "modal", target: "settings" }),
      );
    } catch {
      /* خاصية تصفح مقفلة — مجرد تنقّل للداشبورد كفاية */
    }
    router.push("/dashboard");
  }, [onOpenSettings, router]);

  /* 🎨 زرار الثيمات الأربعة — بيدور على MAGIC_THEME_CYCLE ويحفظ عبر
     ThemeProvider (localStorage.theme + data-theme) زي التصميم بالظبط. */
  const cycleIdx = MAGIC_THEME_CYCLE.indexOf(themeId);
  const nextTheme =
    cycleIdx === -1 ? MAGIC_THEME_CYCLE[0] : MAGIC_THEME_CYCLE[(cycleIdx + 1) % MAGIC_THEME_CYCLE.length];
  const currentLabel =
    THEME_META[themeId]?.label ?? (cycleIdx === -1 ? "ملوّن (حالي)" : themeId);
  const SWATCH_DOTS: { id: ThemeId; color: string }[] = [
    { id: "colorful", color: "#F0D24A" },
    { id: "crimson", color: "#E23A3A" },
    { id: "azure", color: "#4FA9F5" },
    { id: "mono", color: "#9CA3AF" },
  ];

  const colorFor = (i: number) => (colorful ? BRANCH_COLORS[i % BRANCH_COLORS.length] : colors.accent);

  /* داتا الخطة على الفروع — زي ما التصميم بيعرض، بس من props حقيقية */
  const badgeFor = (id: WheelBranchId): string | undefined => {
    if (id === "home" && subject && currentDay) return `${subject} · يوم ${currentDay}${totalDays ? `/${totalDays}` : ""}`;
    if (id === "courses" && subject) return subject;
    if (id === "lesson" && currentDay) return `يوم ${currentDay}`;
    if (id === "workspace" && currentChapter) return `فصل ${currentChapter}`;
    return undefined;
  };

  return (
    <section className="mw-root" aria-label="عجلة ماجيك — التنقل واللمحة السريعة">
      <div className="mw-glow" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-4 py-6 md:px-8 md:py-8">

        {/* ═════ الهيدر + زرار الثيم (سلوك التصميم: دورة على الأربعة + حفظ) ═════ */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${colors.accent} 16%, transparent)`, color: colors.accent }}
              aria-hidden
            >
              <Sparkles size={16} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-base font-extrabold leading-none md:text-lg" style={{ color: "var(--text)" }}>
                عجلة التنقل
              </h2>
              <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
                Magic Wheel
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            className="mw-theme-btn"
            aria-label={`تبديل الثيم — الحالي ${currentLabel}. الضغط يحوّل لـ ${THEME_META[nextTheme]?.label}. الثيمات: ملوّن، أسود وأحمر، أزرق، أبيض ورمادي.`}
          >
            <span className="flex items-center gap-1" aria-hidden>
              {SWATCH_DOTS.map((s) => (
                <span
                  key={s.id}
                  className="h-2.5 w-2.5 rounded-full border"
                  style={{
                    backgroundColor: s.color,
                    borderColor: s.id === themeId ? "var(--text)" : "transparent",
                    outline: s.id === themeId ? `1px solid ${s.color}` : "none",
                    outlineOffset: 1,
                  }}
                />
              ))}
            </span>
            <span>{currentLabel}</span>
          </button>
        </header>

        {/* ═════ أفرع العجلة — شبكة عمودية على الموبايل ═════ */}
        {isVertical ? (
          <nav
            aria-label="تنقل العجلة — عرض شبكي"
            className="grid w-full grid-cols-2 gap-3 md:grid-cols-3"
          >
            {branches.map((b, i) => (
              <WheelBranch
                key={b.id}
                branch={b}
                color={colorFor(i)}
                badge={badgeFor(b.id)}
                onOpenSettings={openSettings}
                layout="grid"
              />
            ))}
          </nav>
        ) : (
          /* ═════ العرض الدائري ═════ */
          <div className="relative mx-auto flex aspect-square w-full max-w-[720px] items-center justify-center">
            <div
              className="mw-ring mw-ring-dash"
              style={{ width: "clamp(320px, 62vw, 470px)", height: "clamp(320px, 62vw, 470px)" }}
              aria-hidden
            />
            <div
              className="mw-ring mw-ring-dot"
              style={{ width: "clamp(270px, 52vw, 390px)", height: "clamp(270px, 52vw, 390px)" }}
              aria-hidden
            />

            {/* الخطوط من المركز للفروع — لونها التوكين فبتتبع الثيم.
                الحاضن square فالـ viewBox هنا بيضمن إن الإحداثيات والمُتحرّك
                يعيشوا في نفس نظام 0–100 (في النسخة القديمة كانت الخطوط %
                والنقاط px فتتضارب). */}
            <svg
              className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              {branches.map((b, i) => {
                const a = ANGLES_DEG[i];
                const r = 42;
                const rad = ((a - 90) * Math.PI) / 180;
                const cx = 50 + Math.sin(rad) * r;
                const cy = 50 + Math.cos(rad) * r;
                return (
                  <g key={b.id}>
                    <line
                      x1="50" y1="50" x2={cx} y2={cy}
                      stroke={colors.accent}
                      strokeOpacity="0.4"
                      strokeWidth="0.4"
                      strokeLinecap="round"
                      className={reduced ? undefined : "mw-line"}
                      style={{ ["--mw-delay" as string]: `${i * 160}ms` }}
                    />
                    {!reduced && (
                      <circle r="1.1" fill={colors.highlight} style={{ filter: `drop-shadow(0 0 4px ${colors.highlight})` }}>
                        <animateMotion
                          dur="2.6s"
                          begin={`${i * 160 + 900}ms`}
                          repeatCount="indefinite"
                          calcMode="linear"
                          path={`M50 50 L${cx} ${cy}`}
                        />
                      </circle>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* المركز — لوجو Magicly، رجوع للرئيسية */}
            <Link
              href="/"
              className="mw-center"
              style={{ width: 160, height: 160 }}
              aria-label="Magic — العودة للرئيسية"
            >
              <MagiclyGlyph className="h-10 w-12 text-[#FFB13B] drop-shadow-[0_0_12px_rgba(255,177,59,0.75)]" />
              <span className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-white/80">
                Magicly
              </span>
            </Link>

            {/* الأفرع التسعة */}
            <nav aria-label="تنقل العجلة — عرض دائري" className="contents">
              {branches.map((b, i) => {
                const a = ANGLES_DEG[i];
                const r = 36;
                const rad = ((a - 90) * Math.PI) / 180;
                const cx = 50 + Math.sin(rad) * r;
                const cy = 50 + Math.cos(rad) * r;
                return (
                  <div
                    key={b.id}
                    className="absolute"
                    style={{ top: `${cy}%`, left: `${cx}%` }}
                  >
                    <WheelBranch
                      branch={b}
                      color={colorFor(i)}
                      badge={badgeFor(b.id)}
                      onOpenSettings={openSettings}
                      layout="circle"
                      delayMs={reduced ? 0 : i * 130}
                      size="clamp(80px, 13vw, 118px)"
                    />
                  </div>
                );
              })}
            </nav>
          </div>
        )}

        {/* ═════ شريط الإحصاءات — بيانات حقيقية من props الداشبورد ═════ */}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
          <StatTile
            icon={<BookOpen size={14} strokeWidth={2.2} aria-hidden />}
            label="الكورسات"
            value={coursesCount === null || coursesCount === undefined ? "—" : String(coursesCount)}
            hint="من جدول الكورسات"
          />
          <StatTile
            icon={<GraduationCap size={14} strokeWidth={2.2} aria-hidden />}
            label="تقدم التراك"
            value={progressPct !== undefined ? `${Math.round(progressPct)}%` : "—"}
            hint={
              totalDays
                ? `${completedSteps ?? 0} / ${totalDays} مهمة`
                : "لما تختار مادة"
            }
          />
          <StatTile
            icon={<Flame size={14} strokeWidth={2.2} aria-hidden />}
            label="الستريك"
            value={streak !== undefined ? `${streak} يوم` : "—"}
            hint="متتحدة من البروفايل"
          />
          <StatTile
            icon={<Bell size={14} strokeWidth={2.2} aria-hidden />}
            label="الإشعارات"
            value={notificationsEnabled === undefined ? "—" : notificationsEnabled ? "التذكير شغال" : "مقفولة"}
            hint="مفيش صندوق وارد لسه — التذكيرات اليومية بس"
            action={
              <button
                type="button"
                onClick={openSettings}
                className="text-[0.62rem] font-bold underline-offset-2 hover:underline"
                style={{ color: "var(--accent)" }}
                aria-label="إدارة الإشعارات — يفتح درج الإعدادات"
              >
                إدارة
              </button>
            }
          />
        </div>

        {/* ═════ الرسوم — بتظهر لما الداشبورد يمرر داتا (صفحة /magic-wheel
            المستقلة من غير داتا فبتعرض الحالة الفاضية الواضحة) ═════ */}
        <section aria-label="ملخص النشاط" className="grid gap-3 md:grid-cols-2 md:gap-4">
          <div className="mw-chart-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold md:text-sm" style={{ color: "var(--text)" }}>
                نشاط المذاكرة
              </h3>
              {onChangeRange && (
                <div className="flex gap-1" role="group" aria-label="نطاق الرسم البياني">
                  {(["weekly", "monthly"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onChangeRange(r)}
                      aria-pressed={analyticsRange === r}
                      className="rounded-full px-2.5 py-1 text-[0.6rem] font-bold transition"
                      style={
                        analyticsRange === r
                          ? { backgroundColor: "var(--accent)", color: "var(--on-marker, #fff)" }
                          : { border: "1px solid var(--rule)", color: "var(--muted)" }
                      }
                    >
                      {r === "weekly" ? "أسبوعي" : "شهري"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {activeChartData && activeChartData.length > 0 ? (
              <>
                <div className="h-36 w-full md:h-40" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activeChartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <XAxis
                        dataKey="label"
                        tick={{ fill: colors.muted, fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: colors.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: colors.rule, opacity: 0.35 }}
                        contentStyle={{
                          backgroundColor: colors.card,
                          border: `1px solid ${colors.rule}`,
                          borderRadius: 10,
                          fontSize: 11,
                          direction: "rtl",
                        }}
                      />
                      <Bar dataKey="minutes" name="دقايق تركيز" radius={[3, 3, 0, 0]} fill={colors.accent} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {weeklyFocusHoursLabel && (
                  <p className="mt-2 font-mono text-[0.6rem]" style={{ color: "var(--muted)" }}>
                    الإجمالي: {weeklyFocusHoursLabel} — من جدول النشاط (activity_log)
                  </p>
                )}
              </>
            ) : (
              <EmptyChartHint text="لسه مفيش نشاط مسجّل — ابدأ أول مهمة من «مساحة العمل» وهيرسم هنا." />
            )}
          </div>

          <div className="mw-chart-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold md:text-sm" style={{ color: "var(--text)" }}>
                توزيع المواد
              </h3>
              {coursesCount !== null && coursesCount !== undefined && (
                <span className="font-mono text-[0.6rem]" style={{ color: "var(--muted)" }}>
                  {coursesCount} كورس
                </span>
              )}
            </div>
            {subjectBreakdown && subjectBreakdown.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="relative h-36 w-36 shrink-0 md:h-40 md:w-40" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subjectBreakdown}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={3}
                        stroke={colors.card}
                        strokeWidth={2}
                        isAnimationActive={!reduced}
                      >
                        {subjectBreakdown.map((_, i) => (
                          <Cell key={i} fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.card,
                          border: `1px solid ${colors.rule}`,
                          borderRadius: 10,
                          fontSize: 11,
                          direction: "rtl",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-extrabold md:text-xl" style={{ color: "var(--text)" }}>
                      {Math.round(
                        (subjectBreakdown.reduce((s, d) => s + d.completed, 0) /
                          Math.max(1, subjectBreakdown.reduce((s, d) => s + d.value, 0))) * 100,
                      )}
                      %
                    </span>
                    <span className="font-mono text-[0.5rem] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                      مكتمل
                    </span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5" aria-label="اكتمال كل مادة">
                  {subjectBreakdown.slice(0, 6).map((d, i) => {
                    const pct = d.value ? Math.round((d.completed / d.value) * 100) : 0;
                    return (
                      <li key={d.name} className="flex items-center gap-2 text-[0.65rem] md:text-[0.7rem]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: "var(--text)" }}>
                          {d.name}
                        </span>
                        <span className="font-mono tabular-nums" style={{ color: "var(--muted)" }}>
                          {pct}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <EmptyChartHint text="مفيش مواد بعد — أول ما تولّد خطة من «ابدأ درسك» الدوناتة هنا هتتقسم لكل مادة ونسبة إنجازها." />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

/* ==========================================================================
   فرع واحد — Link حقيقي للـ href، أو Button لإجراء الإعدادات.
   keyboard-focusable بطبيعته (مفيش div بـ tabIndex) + aria-label مزدوج.
   ========================================================================== */
function WheelBranch({
  branch, color, badge, onOpenSettings, layout, delayMs = 0, size,
}: {
  branch: WheelBranchDef;
  color: string;
  badge?: string;
  onOpenSettings: () => void;
  layout: "circle" | "grid";
  delayMs?: number;
  size?: string;
}) {
  const ariaLabel = `${branch.label} — ${branch.latin}`;

  const face = <BranchFace branch={branch} color={color} badge={badge} />;

  const cssVars = {
    "--node-c": color,
    "--mw-delay": `${delayMs}ms`,
  } as React.CSSProperties;

  if (layout === "grid") {
    const cls =
      "group flex flex-col items-center gap-2 rounded-2xl bg-[var(--card-primary)] px-4 py-4 text-center shadow-sm transition hover:bg-[var(--card-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
    const style: React.CSSProperties = { border: `2px solid ${color}` };
    return branch.kind === "action" ? (
      <button type="button" onClick={onOpenSettings} className={cls} style={style} aria-label={ariaLabel}>
        {face}
      </button>
    ) : (
      <Link href={branch.href ?? "/"} className={cls} style={style} aria-label={ariaLabel}>
        {face}
      </Link>
    );
  }

  const circleStyle: React.CSSProperties = { ...cssVars, width: size, height: size };

  return branch.kind === "action" ? (
    <button type="button" onClick={onOpenSettings} className="mw-node" style={circleStyle} aria-label={ariaLabel}>
      <span className="mw-node-card" style={{ borderColor: color }}>
        {face}
      </span>
    </button>
  ) : (
    <Link href={branch.href ?? "/"} className="mw-node" style={circleStyle} aria-label={ariaLabel}>
      <span className="mw-node-card" style={{ borderColor: color }}>
        {face}
      </span>
    </Link>
  );
}

/* --------------------------------------------------------------------------
   بلاطة إحصاء + حالة فاضية — مفيش أرقام وهمية: null بتظهر «—» صراحةً
   -------------------------------------------------------------------------- */
function StatTile({
  icon, label, value, hint, action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mw-tile" role="group" aria-label={`${label}: ${value}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.68rem] font-bold md:text-[0.72rem]" style={{ color: "var(--muted)" }}>
          <span style={{ color: "var(--accent)" }} aria-hidden>{icon}</span>
          {label}
        </span>
        {action}
      </div>
      <p className="text-base font-extrabold leading-none tabular-nums md:text-lg" style={{ color: "var(--text)" }}>
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-[0.58rem] leading-snug md:text-[0.62rem]" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function EmptyChartHint({ text }: { text: string }) {
  return (
    <div
      className="flex h-36 items-center justify-center rounded-xl border border-dashed px-4 text-center text-[0.68rem] leading-relaxed md:h-40"
      style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
    >
      {text}
    </div>
  );
}

/* إعادة تصدير زرار الثيم لوحده — يستعمله أي صفحة عايزة نفس السلوك
   (صفحة /magic-wheel المستقلة مثلًا). */
export function useMagicThemeCycle() {
  const { theme, setTheme } = useTheme();
  const themeId = theme as ThemeId;
  const idx = MAGIC_THEME_CYCLE.indexOf(themeId);
  const next = idx === -1 ? MAGIC_THEME_CYCLE[0] : MAGIC_THEME_CYCLE[(idx + 1) % MAGIC_THEME_CYCLE.length];
  return { theme: themeId, next, setNext: () => setTheme(next) };
}
