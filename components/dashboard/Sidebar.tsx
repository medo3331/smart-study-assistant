import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/types";
import { IconBadge } from "@/components/ui/IconBadge";

interface SidebarProps {
  items: NavItem[];
  user: { name: string; initials: string };
  className?: string;
}

/**
 * Fixed-width RTL sidebar. Spacing uses only the 4/8/16/24 scale.
 * Each item is a uniformly-sized row with a 40px IconBadge + label; the active
 * item gets a brand pill. Hover/focus states match the Button component.
 */
export function Sidebar({ items, user, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden w-64 shrink-0 flex-col gap-6 border-l border-white/[0.06] bg-[#0D1029]/40 p-6 md:flex",
        className
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7C5CFF] font-bold text-white">
          M
        </span>
        <span className="text-lg font-bold text-white">Magicly</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors",
                item.active
                  ? "bg-[#7C5CFF]/15 text-[#B69CFF]"
                  : "text-[#9AA0C0] hover:bg-white/[0.04] hover:text-[#E7E9F5]"
              )}
            >
              <Icon size={18} aria-hidden />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* User chip at the bottom */}
      <div className="mt-auto flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C5CFF]/20 font-bold text-[#B69CFF]">
          {user.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="text-xs text-[#9AA0C0]">عضوة مميزة</p>
        </div>
      </div>
    </aside>
  );
}
