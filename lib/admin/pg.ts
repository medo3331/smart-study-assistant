import pg from "pg";

/**
 * استعلام مباشر على Postgres — نفس الدالة اللي كانت جوه app/admin/page.tsx
 * (اتنقلت هنا عشان الصفحات الفرعية تستخدمها من غير تكرار). بتتجاوز RLS
 * وبتشتغل من غير SUPABASE_SERVICE_ROLE_KEY، بس محتاجة DATABASE_URL.
 *
 * ⚠️ لو DATABASE_URL مش موجود بترجّع [] عن قصد — عشان الواجهة تعرض
 * "غير قابل للتحقق من هنا" بدل ما تخترع رقم.
 */
export function isPgConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function pgQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];
  const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(sql, params);
    return r.rows as T[];
  } finally {
    await c.end();
  }
}
