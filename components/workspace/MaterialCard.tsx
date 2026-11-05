import Link from "next/link";
import type { MaterialCard as MaterialCardType } from "@/lib/workspace/overview";

export function MaterialCard({ material, onOpen }: {
  material: MaterialCardType;
  onOpen?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" dir="rtl">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-white truncate">{material.title}</h3>
        <span className="text-xs text-slate-500">{material.fileType || "file"}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {new Date(material.createdAt).toLocaleDateString("ar-EG")} ·{" "}
        {material.contentLength.toLocaleString()} حرف
      </p>
      <div className="flex flex-wrap gap-1 mt-2">
        {material.hasSummary && (
          <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded">ملخص</span>
        )}
        {material.hasNote && (
          <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded">ملاحظات</span>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onOpen}
          className="text-xs rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700"
        >
          افتح
        </button>
        <Link
          href={`/chat?fileId=${material.id}`}
          className="text-xs rounded bg-amber-500/15 px-3 py-1.5 text-amber-400 hover:bg-amber-500/25"
        >
          اسأل المساعد
        </Link>
      </div>
    </div>
  );
}