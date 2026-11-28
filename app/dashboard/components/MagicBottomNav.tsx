"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  FolderOpen,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

const OPEN_NAV_EVENT = "magicly:open-nav";

const DESTINATIONS = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { href: "/dashboard/courses", label: "المواد", icon: BookOpen, match: (p: string) => p.startsWith("/dashboard/courses") },
  { href: "/dashboard/workspace", label: "مساحة العمل", icon: FolderOpen, match: (p: string) => p.startsWith("/dashboard/workspace") },
  { href: "/chat", label: "المعلم الذكي", icon: Sparkles, match: (p: string) => p.startsWith("/chat") },
  { href: "/dashboard/progress", label: "تقدمي", icon: BarChart3, match: (p: string) => p.startsWith("/dashboard/progress") },
  { href: "/shop", label: "المتجر", icon: ShoppingBag, match: (p: string) => p.startsWith("/shop") },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings, match: (p: string) => p.startsWith("/dashboard/settings") },
] as const;

export function MagicBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="التنقل السريع"
      className="mw-bottom-nav lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface-1)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="flex items-center py-1.5">
        <div className="mw-nav-viewport relative min-w-0 flex-1 overflow-hidden">
          <div className="mw-nav-track flex w-max items-center">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
                {DESTINATIONS.map(({ href, label, icon: Icon, match }) => {
                  const active = match(pathname);
                  return (
                    <Link
                      key={`${copy}-${href}`}
                      href={href}
                      tabIndex={copy === 1 ? -1 : undefined}
                      aria-current={copy === 0 && active ? "page" : undefined}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-[11px] font-bold transition-colors ${
                        active
                          ? "bg-marker text-onmarker"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      <Icon size={15} aria-hidden />
                      {label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
          className="flex shrink-0 flex-col items-center gap-0.5 border-s border-[var(--color-border)] px-4 py-1 text-[11px] font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          <MoreHorizontal size={18} aria-hidden />
          المزيد
        </button>
      </div>
    </nav>
  );
}
