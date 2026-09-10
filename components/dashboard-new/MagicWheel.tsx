"use client";

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  FolderOpen,
  GraduationCap,
  Home,
  Landmark,
  Settings,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { setNavIntent } from "@/app/dashboard/components/nav-config";
import styles from "./MagicWheel.module.css";

export type DashboardWheelLocale = "ar" | "en";

interface Branch {
  id: "home" | "courses" | "lesson" | "workspace" | "worship" | "ai" | "shop" | "analytics" | "settings";
  ar: string;
  en: string;
  href: string;
  icon: typeof Home;
  color: string;
}

const BRANCHES: Branch[] = [
  { id: "home", ar: "الرئيسية", en: "Home", href: "/dashboard", icon: Home, color: "#E8342F" },
  { id: "courses", ar: "الكورسات", en: "Courses", href: "/dashboard/courses", icon: BookOpen, color: "#F2994A" },
  { id: "lesson", ar: "الدرس", en: "Lesson", href: "/lesson/[dayId]", icon: GraduationCap, color: "#F2C94C" },
  { id: "workspace", ar: "مساحة العمل", en: "Workspace", href: "/dashboard/workspace", icon: FolderOpen, color: "#6FCF97" },
  { id: "worship", ar: "عباداتي", en: "Worship", href: "/worship", icon: Landmark, color: "#2FD4C4" },
  { id: "ai", ar: "المساعد الذكي", en: "AI Assistant", href: "/chat", icon: Sparkles, color: "#4FA9F5" },
  { id: "shop", ar: "المتجر", en: "Shop", href: "/shop", icon: ShoppingBag, color: "#7B7EF4" },
  { id: "analytics", ar: "التحليلات", en: "Analytics", href: "/dashboard#analytics", icon: BarChart3, color: "#B57BF4" },
  { id: "settings", ar: "الإعدادات", en: "Settings", href: "/dashboard", icon: Settings, color: "#F26FA1" },
];

const ANGLES = [-90, -50, -10, 30, 70, 110, 150, 190, 230];

type CSSWithVars = CSSProperties & {
  "--branch-color"?: string;
  "--branch-angle"?: string;
};

export interface MagicWheelProps {
  locale: DashboardWheelLocale;
  currentDayId?: string | null;
  currentDayNumber?: number | null;
  totalDays?: number | null;
  subject?: string | null;
}

function positionFor(index: number): { left: string; top: string } {
  const radians = (ANGLES[index] * Math.PI) / 180;
  return {
    left: `${50 + Math.cos(radians) * 42}%`,
    top: `${50 + Math.sin(radians) * 42}%`,
  };
}

function branchLabel(branch: Branch, locale: DashboardWheelLocale): string {
  return locale === "ar" ? branch.ar : branch.en;
}

export function MagicWheel({
  locale,
  currentDayId = null,
  currentDayNumber = null,
  totalDays = null,
  subject = null,
}: MagicWheelProps) {
  const router = useRouter();

  const navigate = (branch: Branch) => {
    if (branch.id === "settings") {
      setNavIntent({ kind: "modal", target: "settings" });
      router.push("/dashboard");
      return;
    }

    if (branch.id === "analytics") {
      setNavIntent({ kind: "scroll", target: "analytics" });
      router.push("/dashboard#analytics");
      return;
    }

    if (branch.id === "lesson") {
      if (currentDayId) {
        router.push(`/lesson/${currentDayId}`);
      } else {
        // لا يوجد درس فعلي متاح؛ لا نخترع dayId ولا نرسل المستخدم إلى 404.
        router.push("/dashboard");
      }
      return;
    }

    router.push(branch.href);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLAnchorElement>, branch: Branch) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate(branch);
    }
  };

  const renderBranch = (branch: Branch, index: number, mobile = false) => {
    const Icon = branch.icon;
    const label = branchLabel(branch, locale);
    const resolvedHref = branch.id === "lesson"
      ? (currentDayId ? `/lesson/${currentDayId}` : "/dashboard")
      : branch.href;
    const position = positionFor(index);
    const branchStyle: CSSWithVars = {
      "--branch-color": branch.color,
      ...(mobile ? {} : position),
    };

    return (
      <a
        key={`${mobile ? "mobile" : "radial"}-${branch.id}`}
        href={resolvedHref}
        onClick={(event) => {
          event.preventDefault();
          navigate(branch);
        }}
        onKeyDown={(event) => handleKeyDown(event, branch)}
        aria-label={`${branchLabel(branch, locale)} — ${locale === "ar" ? branch.en : branch.ar}`}
        className={mobile ? styles.mobileBranch : styles.branch}
        style={branchStyle}
      >
        <span className={styles.branchIcon} aria-hidden>
          <Icon size={mobile ? 23 : 25} strokeWidth={1.9} />
        </span>
        <span className={styles.branchLabel}>{label}</span>
        <span className={styles.branchLatin}>{locale === "ar" ? branch.en : branch.ar}</span>
        {!mobile && branch.id === "home" && subject && (
          <span className={styles.branchBadge}>
            {subject}
            {currentDayNumber ? ` · ${locale === "ar" ? "يوم" : "Day"} ${currentDayNumber}${totalDays ? `/${totalDays}` : ""}` : ""}
          </span>
        )}
        {!mobile && branch.id === "lesson" && currentDayNumber && (
          <span className={styles.branchBadge}>{locale === "ar" ? "يوم" : "Day"} {currentDayNumber}</span>
        )}
      </a>
    );
  };

  return (
    <section className={styles.section} aria-labelledby="magic-wheel-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{locale === "ar" ? "التنقّل الرئيسي" : "PRIMARY NAVIGATION"}</p>
          <h1 id="magic-wheel-title" className={styles.title}>Magic</h1>
          <p className={styles.subtitle}>{locale === "ar" ? "عجلة التنقّل" : "Navigation Wheel"}</p>
        </div>
        <p className={styles.helper}>
          {locale === "ar" ? "اختار وجهتك من العجلة" : "Choose a destination from the wheel"}
        </p>
      </div>

      <div className={styles.radial}>
        <div className={styles.orbitOuter} aria-hidden />
        <div className={styles.orbitInner} aria-hidden />
        <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {BRANCHES.map((branch, index) => {
            const position = positionFor(index);
            return (
              <line
                key={branch.id}
                x1="50"
                y1="50"
                x2={parseFloat(position.left)}
                y2={parseFloat(position.top)}
                pathLength="1"
              />
            );
          })}
        </svg>

        <Link href="/dashboard" className={styles.center} aria-label={locale === "ar" ? "Magic — العودة للداشبورد" : "Magic — back to dashboard"}>
          <span className={styles.centerMark}>M<span aria-hidden>✦</span></span>
          <span className={styles.centerName}>Magicly</span>
          <span className={styles.centerSub}>{locale === "ar" ? "داشبوردك" : "YOUR DASHBOARD"}</span>
        </Link>

        {BRANCHES.map((branch, index) => renderBranch(branch, index))}
      </div>

      <div className={styles.mobileGrid} aria-label={locale === "ar" ? "روابط الداشبورد" : "Dashboard links"}>
        {BRANCHES.map((branch, index) => renderBranch(branch, index, true))}
      </div>

      <p className={styles.srHint}>
        {locale === "ar" ? "كل فروع العجلة روابط قابلة للتنقل بالكيبورد." : "Every wheel branch is keyboard navigable."}
      </p>
    </section>
  );
}
