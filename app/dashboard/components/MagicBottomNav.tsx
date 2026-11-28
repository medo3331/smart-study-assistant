"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, MoreHorizontal, Sparkles, LayoutDashboard } from "lucide-react";

const OPEN_NAV_EVENT = "magicly:open-nav";

const DESTINATIONS = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { href: "/dashboard/courses", label: "المواد", icon: BookOpen, match: (p: string) => p.startsWith("/dashboard/courses") },
  { href: "/chat", label: "المعلم الذكي", icon: Sparkles, match: (p: string) => p.startsWith("/chat") },
] as const;

export function MagicBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="التنقل السريع"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface-1)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="grid grid-cols-4">
        {DESTINATIONS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-marker text-onmarker" : ""
                }`}
              >
                <Icon size={18} />
              </span>
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
          className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full">
            <MoreHorizontal size={18} />
          </span>
          المزيد
        </button>
      </div>
    </nav>
  );
}
