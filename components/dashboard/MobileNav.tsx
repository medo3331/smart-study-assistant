"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/types";
import {
  Home,
  BookOpen,
  Landmark,
  Settings,
} from "lucide-react";

/**
 * Mobile navigation items — real routes only. كل عنصر بيوصل لصفحة موجودة
 * فعلاً (مافيش روابط ميتة لـ /dashboard).
 */
export const mobileNavItems: NavItem[] = [
  { label: "لوحة التحكم", href: "/dashboard", icon: Home },
  { label: "عباداتي", href: "/worship", icon: Landmark },
  { label: "القرآن", href: "/worship/quran", icon: BookOpen },
  { label: "الأذكار", href: "/worship/adhkar", icon: BookOpen },
  { label: "الإعدادات", href: "/worship/settings", icon: Settings },
];

interface MobileNavProps {
  /** Active href to highlight. */
  activeHref?: string;
}

/**
 * Bottom mobile navigation bar.
 * - Fixed to bottom, respects safe-area insets
 * - Thumb-friendly (≥44px touch targets)
 * - Only visible on md:hidden
 * - Respects prefers-reduced-motion
 */
export function MobileNav({ activeHref }: MobileNavProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isActive = (href: string) => {
    if (activeHref) return activeHref === href;
    // الأب /worship يفضل نشط في كل الصفحات الفرعية.
    if (href === "/worship") {
      if (!pathname) return false;
      return pathname === "/worship" || pathname.startsWith("/worship/");
    }
    return pathname === href;
  };

  return (
    <motion.nav
      initial={reduceMotion ? undefined : { y: 100 }}
      animate={reduceMotion ? undefined : { y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-x-0 bottom-0 z-40 md:hidden pb-[env(safe-area-inset-bottom,0.5rem)]"
    >
      <div className="mx-2 mb-2 rounded-[28px] border border-white/[0.08] bg-[#0D1029]/80 backdrop-blur-xl">
        <div className="flex items-center justify-around h-14 px-2">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200",
                  active
                    ? "text-[#B69CFF]"
                    : "text-[#9AA0C0] hover:text-[#E7E9F5]"
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                    active
                      ? "bg-[#7C5CFF]/15 text-[#7C5CFF]"
                      : "text-[#9AA0C0] hover:bg-white/[0.04]"
                  )}
                >
                  <Icon size={20} aria-hidden />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}

/**
 * Determine the active nav item from the current URL path.
 * Worship subpages should highlight the "عباداتي" parent.
 */
export function getActiveNav(href: string): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;

  if (href === "/worship") {
    return path === "/worship" || path.startsWith("/worship/");
  }

  return path === href;
}
