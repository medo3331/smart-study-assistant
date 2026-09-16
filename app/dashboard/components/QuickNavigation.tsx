"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  FolderOpen,
  BookOpen,
  BarChart3,
  Trophy,
  ShoppingBag,
  Landmark,
  Settings,
} from "lucide-react";

export interface QuickNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  ariaLabel: string;
}

interface QuickNavigationProps {
  items: QuickNavItem[];
}

/**
 * QuickNavigation — §6-11 of the spec.
 * - Grid: 2 cols mobile, 3 tablet, 4 desktop (mobile-first, no horizontal scroll)
 * - Each tile: icon container 40-48px rounded-square, label small, subtle border
 * - Entrance: opacity 0→1, scale 0.96→1, translateY 8→0, 250-350ms, stagger 50-70ms
 * - Hover: scale 1.02-1.03 + subtle glow (accent border), transition 180ms
 * - Click: scale 0.97 (active)
 * - Respects prefers-reduced-motion
 * - Keyboard accessible: Link/button with focus ring, aria-label
 */
export function QuickNavigation({ items }: QuickNavigationProps) {
  const reduce = useReducedMotion();

  return (
    <section aria-label="التنقل السريع" className="space-y-3">
      <h2 className="px-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
        التنقل السريع
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
        {items.map((it, idx) => {
          const content = (
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: reduce ? 0 : idx * 0.06,
                ease: [0.22, 0.8, 0.36, 1],
              }}
              className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl border p-4 text-center backdrop-blur-xl transition-[transform,box-shadow,border-color,background-color] duration-200 hover:scale-[1.02] hover:shadow-[0_8px_24px_var(--shade)] active:scale-[0.97] focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--app-bg)]"
              style={{
                backgroundColor: "var(--card-primary)",
                borderColor: "var(--rule)",
                boxShadow: "0 6px 20px var(--shade)",
              }}
              // hover glow via border accent subtle — handled by group-hover via inline? use CSS var
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl md:h-12 md:w-12 md:rounded-2xl"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
                  color: "var(--accent)",
                  border: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
                }}
                aria-hidden
              >
                {it.icon}
              </span>
              <span
                className="line-clamp-2 text-xs font-semibold leading-5 sm:text-[13px]"
                style={{ color: "var(--text)" }}
              >
                {it.label}
              </span>
            </motion.div>
          );

          // Render as Link if href, else button
          if (it.href) {
            return (
              <Link
                key={it.id}
                href={it.href}
                aria-label={it.ariaLabel}
                className="block h-full focus:outline-none"
                prefetch={false}
              >
                {content}
              </Link>
            );
          }
          return (
            <button
              key={it.id}
              type="button"
              onClick={it.onClick}
              aria-label={it.ariaLabel}
              className="block h-full w-full text-center focus:outline-none"
            >
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Factory for the 8 standard items — callers wire onClick for signal items. */
export function buildQuickNavItems(opts: {
  onOpenAi: () => void;
  onOpenSettings: () => void;
}): QuickNavItem[] {
  return [
    {
      id: "ai",
      label: "المساعد الذكي",
      icon: <Bot size={20} strokeWidth={2} aria-hidden />,
      onClick: opts.onOpenAi,
      ariaLabel: "فتح المساعد الذكي",
    },
    {
      id: "workspace",
      label: "مساحة العمل",
      icon: <FolderOpen size={20} strokeWidth={2} aria-hidden />,
      href: "/dashboard/workspace",
      ariaLabel: "الانتقال إلى مساحة العمل",
    },
    {
      id: "courses",
      label: "الكورسات",
      icon: <BookOpen size={20} strokeWidth={2} aria-hidden />,
      href: "/dashboard/courses",
      ariaLabel: "الانتقال إلى الكورسات",
    },
    {
      id: "analytics",
      label: "التحليلات",
      icon: <BarChart3 size={20} strokeWidth={2} aria-hidden />,
      href: "/dashboard/progress",
      ariaLabel: "الانتقال إلى التحليلات",
    },
    {
      id: "achievements",
      label: "الإنجازات",
      icon: <Trophy size={20} strokeWidth={2} aria-hidden />,
      href: "/dashboard/achievements",
      ariaLabel: "الانتقال إلى الإنجازات",
    },
    {
      id: "shop",
      label: "المتجر",
      icon: <ShoppingBag size={20} strokeWidth={2} aria-hidden />,
      href: "/shop",
      ariaLabel: "الانتقال إلى المتجر",
    },
    {
      id: "worship",
      label: "العبادة",
      icon: <Landmark size={20} strokeWidth={2} aria-hidden />,
      href: "/worship",
      ariaLabel: "الانتقال إلى العبادة",
    },
    {
      id: "settings",
      label: "الإعدادات",
      icon: <Settings size={20} strokeWidth={2} aria-hidden />,
      onClick: opts.onOpenSettings,
      ariaLabel: "فتح الإعدادات",
    },
  ];
}
