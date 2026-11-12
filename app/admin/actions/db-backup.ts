"use server";

import { pgQuery } from "@/lib/admin/pg";
import { guardAction } from "@/lib/admin/action-guard";

/**
 * 🗄️ نسخة من قاعدة البيانات — Server Actions.
 *
 * ⚠️ أمان (P0، 2026-11):
 *   قبل كده الدالتين دول كانوا **بدون أي فحص صلاحية**، و`exportTable` بتنفّذ
 *   `SELECT * FROM public.<table>` على `DATABASE_URL` (postgres — بيتجاوز RLS
 *   تمامًا). ولأن الملف بيتستورد من كومبوننت `"use client"`، كان أي حد يقدر
 *   يجيب الـ action ID من الـ bundle ويسحب `profiles` / `payments` / أي جدول.
 *
 *   دلوقتي:
 *     - الصلاحية `admins.manage` (Owner فقط) بتتفرض على الاتنين.
 *     - الهوية من الجلسة، مفيش باراميتر هوية.
 *     - اسم الجدول بيتأكد إنه جدول حقيقي في `public` — مش بس regex.
 *     - أخطاء الداتابيز مش بتترجع للعميل خام.
 */

const BACKUP_PERMISSION = "admins.manage" as const;

/** أقصى عدد صفوف في التصدير — نسخة كاملة من جدول ضخم مش طلب معقول. */
const MAX_EXPORT_ROWS = 50_000;

async function publicTableExists(table: string): Promise<boolean> {
  const rows = await pgQuery<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = $1`,
    [table]
  );
  return rows.length > 0;
}

/**
 * أسماء الجداول المتاحة للتصدير.
 * بيرجّع `[]` لو مفيش صلاحية (بدل ما يكسر الصفحة).
 */
export const listTables = guardAction(BACKUP_PERMISSION, async (): Promise<string[]> => {
  const rows = await pgQuery<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name`
  );
  return rows.map((r) => r.table_name);
});

/**
 * تصدير جدول كـ JSON.
 *
 * ⚠️ اسم الجدول بيتحقق منه مرتين: regex (يمنع الحقن) + وجود حقيقي في
 * `information_schema` (يمنع الوصول لجداول مش موجودة أو مخططات تانية).
 */
export const exportTable = guardAction(
  BACKUP_PERMISSION,
  async (_ctx, table: string): Promise<{ ok: boolean; json?: string; message?: string }> => {
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      return { ok: false, message: "اسم جدول غير صالح" };
    }

    try {
      if (!(await publicTableExists(table))) {
        return { ok: false, message: "الجدول غير موجود" };
      }

      const rows = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM public."${table}" LIMIT ${MAX_EXPORT_ROWS}`
      );
      return { ok: true, json: JSON.stringify(rows, null, 2) };
    } catch (e: unknown) {
      // تفاصيل الخطأ تفضل في اللوج السيرفر — مش في رد للعميل.
      console.error("[db-backup] exportTable failed:", e instanceof Error ? e.message : e);
      return { ok: false, message: "فشل تصدير الجدول" };
    }
  }
);
