"use client";
import { useState } from "react";
import { listTables, exportTable } from "@/app/admin/actions/db-backup";

export default function DbBackupClient({ initialTables }: { initialTables: string[] }) {
  const [tables] = useState(initialTables);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function download(table: string) {
    setLoading(table);
    setMsg(null);
    const res = await exportTable(table);
    if (!res.ok || !res.json) {
      setMsg(res.message || "فشل");
      setLoading(null);
      return;
    }
    const blob = new Blob([res.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">نسخة من قاعدة البيانات (JSON لكل جدول). للمالك فقط.</p>
      {msg && <p className="text-sm text-red-400">{msg}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tables.map((t) => (
          <button key={t} onClick={() => download(t)} disabled={loading === t} className="border rounded px-3 py-2 text-sm hover:bg-slate-800">
            {loading === t ? "..." : t}
          </button>
        ))}
      </div>
    </div>
  );
}
