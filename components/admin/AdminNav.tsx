"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export interface AdminNavLink {
  href: string;
  label: string;
}

/**
 * قائمة تنقل الأدمن — الروابط بتتحدد في السيرفر (layout) حسب صلاحيات الدور،
 * والعميل هنا مسؤول بس عن تمييز الرابط النشط. يعني حتى لو أحد ضاف رابط يدوي
 * في الـDOM، الصفحة نفسها هترفضه لأن كل صفحة عندها requireAdminPermission().
 */
export default function AdminNav({ links }: { links: AdminNavLink[] }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`text-xs px-3 py-1.5 rounded whitespace-nowrap border transition ${
              active
                ? "bg-amber-500/20 border-amber-500/40 text-amber-200 font-bold"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
