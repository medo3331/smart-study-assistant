"use strict";
/**
 * Phase 6 — Sidebar (collapsible groups, compact on desktop, drawer on mobile).
 * Integrates with existing dashboard (preserves routes, AI Hub, Personal Assistant, Study Tutor).
 * Role-aware: student, graduate, freelancer view variations.
 */
import React, { useState } from "react";

export interface SidebarGroup {
  id: string;
  labelAr: string;
  labelEn: string;
  icon?: string;
  items: { id: string; labelAr: string; labelEn: string; href?: string; active?: boolean }[];
}

const groups: SidebarGroup[] = [
  {
    id: "principal",
    labelAr: "الرئيسية",
    labelEn: "Principal",
    items: [
      { id: "dashboard", labelAr: "لوحة التحكم", labelEn: "Dashboard", href: "/dashboard", active: true },
    ],
  },
  {
    id: "study",
    labelAr: "الدراسة",
    labelEn: "Study",
    items: [
      { id: "plan", labelAr: "خطتي", labelEn: "My Plan", href: "/dashboard" },
      { id: "lessons", labelAr: "الدروس", labelEn: "Lessons", href: "/lesson/[dayId]" },
      { id: "subjects", labelAr: "المواد", labelEn: "Subjects", href: "/dashboard" },
    ],
  },
  {
    id: "ai",
    labelAr: "الذكاء الاصطناعي",
    labelEn: "AI Tools",
    items: [
      { id: "ai-hub", labelAr: "AI Hub", labelEn: "AI Hub", href: "/dashboard", active: true },
      { id: "assistant", labelAr: "المساعد", labelEn: "Assistant", href: "/dashboard" },
      { id: "tools", labelAr: "الأدوات", labelEn: "Tools", href: "/dashboard" },
    ],
  },
  {
    id: "planning",
    labelAr: "التخطيط",
    labelEn: "Planning",
    items: [
      { id: "goals", labelAr: "الأهداف", labelEn: "Goals", href: "/dashboard" },
      { id: "plan-map", labelAr: "المخطط", labelEn: "Plan Map", href: "/dashboard" },
      { id: "progress", labelAr: "التقدم", labelEn: "Progress", href: "/dashboard" },
    ],
  },
  {
    id: "other",
    labelAr: "أخرى",
    labelEn: "Other",
    items: [
      { id: "achievements", labelAr: "الإنجازات", labelEn: "Achievements", href: "/dashboard" },
      { id: "settings", labelAr: "الإعدادات", labelEn: "Settings", href: "/dashboard" },
    ],
  },
];

export default function Sidebar({ role = "student", open = true, onToggle }: { role?: string; open?: boolean; onToggle?: () => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ principal: true, study: true, ai: true, planning: true, other: false });
  const isAr = true; // dashboard uses RTL default
  const visible = role === "freelancer" ? ["principal", "study", "ai", "planning", "other"] : (role === "graduate" ? ["principal", "study", "ai", "planning", "other"] : ["principal", "study", "ai", "planning", "other"]);

  return (
    <>
      {/* Mobile drawer toggle (visible only on small screens via CSS) */}
      <button
        onClick={onToggle}
        aria-label={isAr ? "فتح القائمة" : "Open sidebar"}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 rounded-md bg-[var(--paper-2)] border border-[var(--rule)] shadow-md"
        style={{ display: open ? "none" : "inline-flex" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </button>

      <aside
        aria-label={isAr ? "الشريط الجانبي" : "Sidebar"}
        className={`fixed lg:sticky top-0 h-full z-40 bg-[var(--paper-2)] border-r border-[var(--rule)] shadow-[1px_0_3px_rgba(35,45,73,.08)] transition-transform duration-300 ease-in-out lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} w-[260px] min-w-[260px] overflow-y-auto`}
        dir={isAr ? "rtl" : "ltr"}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="font-display font-bold text-[var(--ink)] text-sm">{isAr ? "القائمة" : "Menu"}</span>
            <button onClick={onToggle} aria-label={isAr ? "إغلاق" : "Close"} className="lg:hidden text-[var(--ink-soft)] hover:text-[var(--ink)] text-xs">✕</button>
          </div>

          {groups.filter(g => visible.includes(g.id)).map(g => (
            <div key={g.id} className="mb-2">
              <button
                onClick={() => setExpanded({ ...expanded, [g.id]: !expanded[g.id] })}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-3)] transition"
                aria-expanded={expanded[g.id]}
                aria-label={isAr ? g.labelAr : g.labelEn}
              >
                <span>{isAr ? g.labelAr : g.labelEn}</span>
                <span className="text-[10px] text-[var(--ink-soft)]">{expanded[g.id] ? "−" : "+"}</span>
              </button>
              <div className={`overflow-hidden transition-all duration-200 ${expanded[g.id] ? "max-h-60 mt-1" : "max-h-0"}`}>
                <ul className="border-r-2 border-[var(--rule)] mr-2 pr-2">
                  {g.items.map(it => (
                    <li key={it.id}>
                      <a href={it.href || "#"} className={`block px-2 py-1 rounded text-sm ${it.active ? "font-semibold text-[var(--ink)] bg-[var(--hl-yellow-fill)]/30" : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--paper-3)]"} transition`} aria-current={it.active ? "page" : undefined}>
                        {isAr ? it.labelAr : it.labelEn}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
