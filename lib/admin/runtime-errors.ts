import { isPgConfigured, pgQuery } from "./pg";

export type RuntimeErrorRow = {
  id: string;
  createdAt: string;
  route: string;
  feature: string | null;
  errorType: string;
  category: string;
  outcome: string | null;
  provider: string | null;
  model: string | null;
  traceId: string | null;
  message: string | null;
  userId: string | null;
};

export type RuntimeErrorReport = {
  available: boolean;
  reason: "ok" | "db_not_configured" | "schema_missing" | "read_error";
  message: string | null;
  rows: RuntimeErrorRow[];
  summary: { total: number; byCategory: { category: string; count: number }[]; byRoute: { route: string; count: number }[] };
  generatedAt: string;
};

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /relation .* does not exist|42P01|runtime_error_events/i.test(msg) && /does not exist|42P01/i.test(msg);
}

export async function fetchRuntimeErrorsReport(filters: { from?: string; to?: string; route?: string; category?: string; limit?: number } = {}): Promise<RuntimeErrorReport> {
  if (!isPgConfigured()) {
    return { available: false, reason: "db_not_configured", message: "DATABASE_URL is not configured.", rows: [], summary: { total: 0, byCategory: [], byRoute: [] }, generatedAt: new Date().toISOString() };
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
  const from = filters.from ? new Date(filters.from) : new Date(Date.now() - 7 * 86400000);
  const to = filters.to ? new Date(filters.to) : new Date();
  const safeFrom = Number.isFinite(from.getTime()) ? from : new Date(Date.now() - 7 * 86400000);
  const safeTo = Number.isFinite(to.getTime()) ? to : new Date();
  const where: string[] = ["created_at >= $1", "created_at <= $2"];
  const params: unknown[] = [safeFrom.toISOString(), safeTo.toISOString()];
  if (filters.route?.trim()) { params.push(filters.route.trim()); where.push(`route = $${params.length}`); }
  if (filters.category?.trim()) { params.push(filters.category.trim()); where.push(`category = $${params.length}`); }
  const whereSql = where.join(" AND ");
  try {
    const rows = await pgQuery<any>(`SELECT id::text, created_at::text, route, feature, error_type, category, outcome, provider, model, trace_id, message_sanitized, user_id::text FROM public.runtime_error_events WHERE ${whereSql} ORDER BY created_at DESC LIMIT ${limit}`, params);
    const byCategory = await pgQuery<{ category: string; count: number }>(`SELECT category, count(*)::int AS count FROM public.runtime_error_events WHERE ${whereSql} GROUP BY category ORDER BY count DESC`, params);
    const byRoute = await pgQuery<{ route: string; count: number }>(`SELECT route, count(*)::int AS count FROM public.runtime_error_events WHERE ${whereSql} GROUP BY route ORDER BY count DESC LIMIT 20`, params);
    return {
      available: true,
      reason: "ok",
      message: null,
      rows: rows.map((r) => ({
        id: String(r.id),
        createdAt: r.created_at ?? null,
        route: String(r.route),
        feature: r.feature ?? null,
        errorType: String(r.error_type),
        category: String(r.category),
        outcome: r.outcome ?? null,
        provider: r.provider ?? null,
        model: r.model ?? null,
        traceId: r.trace_id ?? null,
        message: r.message_sanitized ?? null,
        userId: r.user_id ?? null,
      })),
      summary: {
        total: rows.length,
        byCategory: byCategory.map((r) => ({ category: String(r.category), count: Number(r.count) })),
        byRoute: byRoute.map((r) => ({ route: String(r.route), count: Number(r.count) })),
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (isMissingTableError(err)) {
      return { available: false, reason: "schema_missing", message: "runtime_error_events table is missing. Apply db/17-runtime-error-events.sql manually.", rows: [], summary: { total: 0, byCategory: [], byRoute: [] }, generatedAt: new Date().toISOString() };
    }
    return { available: false, reason: "read_error", message: err instanceof Error ? err.message : String(err), rows: [], summary: { total: 0, byCategory: [], byRoute: [] }, generatedAt: new Date().toISOString() };
  }
}
