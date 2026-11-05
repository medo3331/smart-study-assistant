// TODO(B4.0.3): integrate after page.tsx migration to server component
// Currently orphan — see merge/sidebar-clean-to-main commit 768eb102
import Link from "next/link";
import type { LectureCard as LectureCardType } from "@/lib/workspace/overview";

export function LectureCard({ lecture }: { lecture: LectureCardType }) {
  const statusColors: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-400",
    processing: "bg-amber-500/15 text-amber-400",
    failed: "bg-rose-500/15 text-rose-400",
    pending: "bg-slate-500/15 text-slate-400",
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" dir="rtl">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-white truncate">
          {lecture.title || lecture.originalFilename || "محاضرة بدون عنوان"}
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[lecture.status] || statusColors.pending}`}>
          {lecture.status}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {new Date(lecture.createdAt).toLocaleDateString("ar-EG")}
        {lecture.sourceType && ` · ${lecture.sourceType}`}
      </p>
      <div className="flex gap-2 mt-3">
        <Link
          href={`/lectures`}
          className="text-xs rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700"
        >
          افتح المحاضرة
        </Link>
        <Link
          href={`/chat?lectureId=${lecture.id}`}
          className="text-xs rounded bg-amber-500/15 px-3 py-1.5 text-amber-400 hover:bg-amber-500/25"
        >
          اسأل المعلم
        </Link>
      </div>
    </div>
  );
}