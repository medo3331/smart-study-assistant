"use server";
import { pgQuery } from "@/lib/admin/pg";

export async function listTables(): Promise<string[]> {
  try {
    const rows = await pgQuery<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
    );
    return rows.map((r) => r.table_name);
  } catch {
    return [];
  }
}

export async function exportTable(table: string): Promise<{ ok: boolean; json?: string; message?: string }> {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) return { ok: false, message: "اسم جدول غير صالح" };
  try {
    const rows = await pgQuery<any>(`SELECT * FROM public.${table}`);
    return { ok: true, json: JSON.stringify(rows, null, 2) };
  } catch (e: any) {
    return { ok: false, message: e?.message || "فشل" };
  }
}

