"use client";
import Link from "next/link";

type Tab = "chats" | "lectures" | "files";

export function WorkspaceTabs({ active, counts }: {
  active: Tab;
  counts: { files: number; lectures: number; chats: number };
}) {
  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "chats", label: "المحادثات", count: counts.chats },
    { key: "lectures", label: "المحاضرات", count: counts.lectures },
    { key: "files", label: "الملفات", count: counts.files },
  ];

  return (
    <div className="flex gap-1 border-b border-slate-800" dir="rtl">
      {tabs.map(t => (
        <Link
          key={t.key}
          href={`/dashboard/workspace?tab=${t.key}`}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition ${
            active === t.key
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          {t.label}
          <span className="mr-2 text-xs text-slate-500">({t.count})</span>
        </Link>
      ))}
    </div>
  );
}