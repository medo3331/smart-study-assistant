"use client";

import { useMemo, useState } from "react";

import type { Grant } from "@/lib/admin/grants";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<Grant["status"], { text: string; cls: string }> = {
  active: { text: "نشطة", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  expired: { text: "منتهية", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  exhausted: { text: "مستنفدة", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** جدول المنح مع فلاتر محلية وترقيم صفحات — بيانات الصفحة تمرّرها كاملة. */
export default function GrantsTable({ grants }: { grants: Grant[] }) {
  const [status, setStatus] = useState<"all" | Grant["status"]>("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const sources = useMemo(
    () => Array.from(new Set(grants.map((grant) => grant.source))).sort(),
    [grants]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grants.filter((grant) => {
      if (status !== "all" && grant.status !== status) return false;
      if (source !== "all" && grant.source !== source) return false;
      if (q === "") return true;
      return (
        grant.user_id.toLowerCase().includes(q) ||
        (grant.user_email ?? "").toLowerCase().includes(q) ||
        (grant.user_name ?? "").toLowerCase().includes(q) ||
        grant.grant_ref.toLowerCase().includes(q)
      );
    });
  }, [grants, status, source, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block text-sm text-slate-300">
          الحالة
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          >
            <option value="all">الكل</option>
            <option value="active">نشطة</option>
            <option value="expired">منتهية</option>
            <option value="exhausted">مستنفدة</option>
          </select>
        </label>

        <label className="block text-sm text-slate-300">
          المصدر
          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(0); }}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          >
            <option value="all">الكل</option>
            {sources.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-slate-300">
          بحث (بريد / اسم / User ID)
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="w-full text-[11px] sm:text-xs">
          <thead className="bg-slate-900/60 text-amber-300">
            <tr>
              <th className="px-3 py-2 text-right">المستخدم</th>
              <th className="px-3 py-2 text-right">المصدر</th>
              <th className="px-3 py-2 text-right">المبلغ</th>
              <th className="px-3 py-2 text-right">مستهلك / متبقٍّ</th>
              <th className="px-3 py-2 text-right">ينتهي</th>
              <th className="px-3 py-2 text-right">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  لا توجد منح مطابقة
                </td>
              </tr>
            ) : (
              rows.map((grant) => (
                <tr key={grant.id} className="border-t border-slate-700/70">
                  <td className="px-3 py-2">
                    <div className="font-medium">{grant.user_name || grant.user_email || "—"}</div>
                    <div className="font-mono text-[10px] text-slate-500" dir="ltr">{grant.user_id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{grant.source}</td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{grant.amount}</td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{grant.consumed} / {grant.remaining}</td>
                  <td className="px-3 py-2">{formatDate(grant.expires_at)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_LABEL[grant.status].cls}`}>
                      {STATUS_LABEL[grant.status].text}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{filtered.length} منحة · صفحة {safePage + 1} من {pageCount}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40"
          >
            السابق
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      </div>
    </div>
  );
}
