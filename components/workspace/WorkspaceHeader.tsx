"use client";
import { Plus, Upload, MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import type { WorkspaceOverview } from "@/lib/workspace/overview";

export function WorkspaceHeader({ counts, displayName }: {
  counts: WorkspaceOverview["counts"];
  displayName: string | null;
}) {
  return (
    <div className="space-y-4 pb-6 border-b border-slate-800">
      <div>
        <h1 className="text-2xl font-extrabold text-white" dir="rtl">
          أهلاً يا {displayName ?? "صديقي"} 👋
        </h1>
        <p className="text-sm text-slate-400 mt-1" dir="rtl">
          عندك <strong className="text-white">{counts.files}</strong> ملف ·{" "}
          <strong className="text-white">{counts.lectures}</strong> محاضرة ·{" "}
          <strong className="text-white">{counts.chats}</strong> محادثة
        </p>
      </div>
      <div className="flex flex-wrap gap-2" dir="rtl">
        <Link
          href="/dashboard/workspace?tab=files&upload=1"
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 flex items-center gap-2"
        >
          <Upload size={16} /> ارفع ملف
        </Link>
        <Link
          href="/lecture-transcription"
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 flex items-center gap-2"
        >
          <Plus size={16} /> محاضرة جديدة
        </Link>
        <Link
          href="/chat"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 flex items-center gap-2"
        >
          <MessageSquarePlus size={16} /> محادثة جديدة
        </Link>
      </div>
    </div>
  );
}