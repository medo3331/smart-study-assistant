import { isPgConfigured, pgQuery } from "@/lib/admin/pg";

export interface AiUsageFilters {
  from?: string;
  to?: string;
  feature?: string;
  provider?: string;
  status?: string;
}

export interface AiUsageGroupRow {
  key: string;
  events: number;
  completed: number;
  failed: number;
  units: number;
  promptTokensKnown: number;
  promptTokensTotal: number;
  completionTokensKnown: number;
  completionTokensTotal: number;
}

export interface AiUsageTopUser {
  userId: string | null;
  events: number;
  completed: number;
  failed: number;
  units: number;
  promptTokensKnown: number;
  promptTokensTotal: number;
  completionTokensKnown: number;
  completionTokensTotal: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface AiUsageReport {
  available: boolean;
  reason: "ok" | "db_not_configured" | "schema_missing" | "read_error";
  message: string | null;
  defaultRangeDays: number;
  filters: { from: string; to: string; feature: string; provider: string; status: string };
  summary: {
    totalEvents: number;
    completed: number;
    failedNoResponse: number;
    failedAfterResponse: number;
    errors: number;
    skipped: number;
    failedTotal: number;
    unitsTotal: number;
    usersWithEvents: number;
    anonymousEvents: number;
    promptTokensKnown: number;
    promptTokensTotal: number;
    completionTokensKnown: number;
    completionTokensTotal: number;
    latencySamples: number;
    latencyAvgMs: number | null;
  };
  byFeature: AiUsageGroupRow[];
  byProvider: AiUsageGroupRow[];
  byModel: AiUsageGroupRow[];
  byStatus: { status: string; events: number; units: number }[];
  topUsers: AiUsageTopUser[];
  generatedAt: string;
}

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 90;

function trim(v: string | undefined): string { return (v ?? "").trim(); }

function parseBoundary(value: string | undefined, fallback: Date, endOfDay: boolean): Date {
  const raw = trim(value);
  if (!raw) return fallback;
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    d = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  } else { d = new Date(raw); }
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function clampRange(from: Date, to: Date): { from: Date; to: Date } {
  if (from.getTime() > to.getTime()) { const tmp = from; from = to; to = tmp; }
  const maxMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) from = new Date(to.getTime() - maxMs);
  return { from, to };
}

function toIso(d: Date): string { return d.toISOString(); }
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeAiUsageFilters(input: AiUsageFilters): { from: Date; to: Date; feature: string; provider: string; status: string } {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const parsedFrom = parseBoundary(input.from, defaultFrom, false);
  const parsedTo = parseBoundary(input.to, now, true);
  const { from, to } = clampRange(parsedFrom, parsedTo);
  return { from, to, feature: trim(input.feature), provider: trim(input.provider), status: trim(input.status) };
}
export async function fetchAiUsageReport(input: AiUsageFilters = {}): Promise<AiUsageReport> {
  const filters = normalizeAiUsageFilters(input);
  if (!isPgConfigured()) {
    return emptyReport(filters, "db_not_configured", "DATABASE_URL غير متاح — تقرير الاستخدام غير قابل للتحقق من هنا.");
  }
  try {
    const reg = await pgQuery<{ reg: string | null }>("SELECT to_regclass('public.ai_usage_events')::text AS reg");
    if (!reg[0]?.reg) {
      return emptyReport(filters, "schema_missing", "جدول ai_usage_events غير موجود. التتبع غير مفعّل — هذا ليس استخدامًا صفرًا.");
    }
  } catch (e) {
    return emptyReport(filters, "read_error", (e as { message?: string })?.message || "تعذر التحقق من جدول ai_usage_events.");
  }
  const fromIso = toIso(filters.from);
  const toIsoStr = toIso(filters.to);
  const baseWhere = `created_at >= $1 AND created_at <= $2
    AND ($3 = '' OR feature = $3)
    AND ($4 = '' OR COALESCE(provider, '') = $4)
    AND ($5 = '' OR status = $5)`;
  const params = [fromIso, toIsoStr, filters.feature, filters.provider, filters.status];
  try {
    const [summaryRows] = await Promise.all([
      pgQuery<{ total_events: number; completed: number; failed_no_response: number; failed_after_response: number; errors: number; skipped: number; units_total: number; users_with_events: number; anonymous_events: number; prompt_tokens_known: number; prompt_tokens_total: number; completion_tokens_known: number; completion_tokens_total: number; latency_samples: number; latency_avg_ms: number | string | null; }>(
        `SELECT count(*)::int AS total_events, count(*) FILTER (WHERE status = 'completed')::int AS completed, count(*) FILTER (WHERE status = 'failed_no_response')::int AS failed_no_response, count(*) FILTER (WHERE status = 'failed_after_response')::int AS failed_after_response, count(*) FILTER (WHERE status = 'error')::int AS errors, count(*) FILTER (WHERE status = 'skipped')::int AS skipped, coalesce(sum(units), 0)::int AS units_total, count(DISTINCT user_id)::int AS users_with_events, count(*) FILTER (WHERE user_id IS NULL)::int AS anonymous_events, count(*) FILTER (WHERE prompt_tokens IS NOT NULL)::int AS prompt_tokens_known, coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens_total, count(*) FILTER (WHERE completion_tokens IS NOT NULL)::int AS completion_tokens_known, coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens_total, count(*) FILTER (WHERE latency_ms IS NOT NULL)::int AS latency_samples, avg(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS latency_avg_ms FROM public.ai_usage_events WHERE ${baseWhere}`, params),
    ]);
    const s = summaryRows[0];
    const summary = {
      totalEvents: num(s?.total_events), completed: num(s?.completed), failedNoResponse: num(s?.failed_no_response), failedAfterResponse: num(s?.failed_after_response), errors: num(s?.errors), skipped: num(s?.skipped), failedTotal: num(s?.failed_no_response) + num(s?.failed_after_response) + num(s?.errors), unitsTotal: num(s?.units_total), usersWithEvents: num(s?.users_with_events), anonymousEvents: num(s?.anonymous_events), promptTokensKnown: num(s?.prompt_tokens_known), promptTokensTotal: num(s?.prompt_tokens_total), completionTokensKnown: num(s?.completion_tokens_known), completionTokensTotal: num(s?.completion_tokens_total), latencySamples: num(s?.latency_samples), latencyAvgMs: nullableNum(s?.latency_avg_ms),
    };
    const featureRows = await pgQuery<{ feature: string; events: number; completed: number; failed: number; units: number; prompt_tokens_known: number; prompt_tokens_total: number; completion_tokens_known: number; completion_tokens_total: number; }>(`SELECT feature, count(*)::int AS events, count(*) FILTER (WHERE status = 'completed')::int AS completed, count(*) FILTER (WHERE status IN ('failed_no_response','failed_after_response','error'))::int AS failed, coalesce(sum(units), 0)::int AS units, count(*) FILTER (WHERE prompt_tokens IS NOT NULL)::int AS prompt_tokens_known, coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens_total, count(*) FILTER (WHERE completion_tokens IS NOT NULL)::int AS completion_tokens_known, coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens_total FROM public.ai_usage_events WHERE ${baseWhere} GROUP BY feature ORDER BY events DESC LIMIT 50`, params);
    const providerRows = await pgQuery<{ provider: string | null; events: number; completed: number; failed: number; units: number; prompt_tokens_known: number; prompt_tokens_total: number; completion_tokens_known: number; completion_tokens_total: number; }>(`SELECT provider, count(*)::int AS events, count(*) FILTER (WHERE status = 'completed')::int AS completed, count(*) FILTER (WHERE status IN ('failed_no_response','failed_after_response','error'))::int AS failed, coalesce(sum(units), 0)::int AS units, count(*) FILTER (WHERE prompt_tokens IS NOT NULL)::int AS prompt_tokens_known, coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens_total, count(*) FILTER (WHERE completion_tokens IS NOT NULL)::int AS completion_tokens_known, coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens_total FROM public.ai_usage_events WHERE ${baseWhere} GROUP BY provider ORDER BY events DESC LIMIT 50`, params);
    const modelRows = await pgQuery<{ model: string | null; events: number; completed: number; failed: number; units: number; prompt_tokens_known: number; prompt_tokens_total: number; completion_tokens_known: number; completion_tokens_total: number; }>(`SELECT model, count(*)::int AS events, count(*) FILTER (WHERE status = 'completed')::int AS completed, count(*) FILTER (WHERE status IN ('failed_no_response','failed_after_response','error'))::int AS failed, coalesce(sum(units), 0)::int AS units, count(*) FILTER (WHERE prompt_tokens IS NOT NULL)::int AS prompt_tokens_known, coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens_total, count(*) FILTER (WHERE completion_tokens IS NOT NULL)::int AS completion_tokens_known, coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens_total FROM public.ai_usage_events WHERE ${baseWhere} GROUP BY model ORDER BY events DESC LIMIT 50`, params);
    const statusRows = await pgQuery<{ status: string; events: number; units: number; }>(`SELECT status, count(*)::int AS events, coalesce(sum(units), 0)::int AS units FROM public.ai_usage_events WHERE ${baseWhere} GROUP BY status ORDER BY events DESC`, params);
    const userRows = await pgQuery<{ user_id: string | null; events: number; completed: number; failed: number; units: number; prompt_tokens_known: number; prompt_tokens_total: number; completion_tokens_known: number; completion_tokens_total: number; first_seen: string; last_seen: string; }>(`SELECT user_id::text AS user_id, count(*)::int AS events, count(*) FILTER (WHERE status = 'completed')::int AS completed, count(*) FILTER (WHERE status IN ('failed_no_response','failed_after_response','error'))::int AS failed, coalesce(sum(units), 0)::int AS units, count(*) FILTER (WHERE prompt_tokens IS NOT NULL)::int AS prompt_tokens_known, coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens_total, count(*) FILTER (WHERE completion_tokens IS NOT NULL)::int AS completion_tokens_known, coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens_total, min(created_at)::text AS first_seen, max(created_at)::text AS last_seen FROM public.ai_usage_events WHERE ${baseWhere} GROUP BY user_id ORDER BY events DESC LIMIT 20`, params);
    return {
      available: true, reason: "ok", message: null, defaultRangeDays: DEFAULT_RANGE_DAYS,
      filters: { from: fromIso, to: toIsoStr, feature: filters.feature, provider: filters.provider, status: filters.status },
      summary,
      byFeature: featureRows.map((r) => ({ key: r.feature === null || r.feature === undefined || r.feature === "" ? "(غير محدد)" : String(r.feature), events: num(r.events), completed: num(r.completed), failed: num(r.failed), units: num(r.units), promptTokensKnown: num(r.prompt_tokens_known), promptTokensTotal: num(r.prompt_tokens_total), completionTokensKnown: num(r.completion_tokens_known), completionTokensTotal: num(r.completion_tokens_total) })),
      byProvider: providerRows.map((r) => ({ key: r.provider === null || r.provider === undefined || r.provider === "" ? "(غير محدد)" : String(r.provider), events: num(r.events), completed: num(r.completed), failed: num(r.failed), units: num(r.units), promptTokensKnown: num(r.prompt_tokens_known), promptTokensTotal: num(r.prompt_tokens_total), completionTokensKnown: num(r.completion_tokens_known), completionTokensTotal: num(r.completion_tokens_total) })),
      byModel: modelRows.map((r) => ({ key: r.model === null || r.model === undefined || r.model === "" ? "(غير محدد)" : String(r.model), events: num(r.events), completed: num(r.completed), failed: num(r.failed), units: num(r.units), promptTokensKnown: num(r.prompt_tokens_known), promptTokensTotal: num(r.prompt_tokens_total), completionTokensKnown: num(r.completion_tokens_known), completionTokensTotal: num(r.completion_tokens_total) })),
      byStatus: statusRows.map((r) => ({ status: String(r.status), events: num(r.events), units: num(r.units) })),
      topUsers: userRows.map((r) => ({ userId: r.user_id === null || r.user_id === undefined ? null : String(r.user_id), events: num(r.events), completed: num(r.completed), failed: num(r.failed), units: num(r.units), promptTokensKnown: num(r.prompt_tokens_known), promptTokensTotal: num(r.prompt_tokens_total), completionTokensKnown: num(r.completion_tokens_known), completionTokensTotal: num(r.completion_tokens_total), firstSeen: r.first_seen ?? null, lastSeen: r.last_seen ?? null })),
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return emptyReport(filters, "read_error", (e as { message?: string })?.message || "تعذر قراءة ai_usage_events.");
  }
}


function emptyReport(filters: ReturnType<typeof normalizeAiUsageFilters>, reason: AiUsageReport["reason"], message: string | null): AiUsageReport {
  return {
    available: false, reason, message, defaultRangeDays: DEFAULT_RANGE_DAYS,
    filters: { from: toIso(filters.from), to: toIso(filters.to), feature: filters.feature, provider: filters.provider, status: filters.status },
    summary: { totalEvents:0, completed:0, failedNoResponse:0, failedAfterResponse:0, errors:0, skipped:0, failedTotal:0, unitsTotal:0, usersWithEvents:0, anonymousEvents:0, promptTokensKnown:0, promptTokensTotal:0, completionTokensKnown:0, completionTokensTotal:0, latencySamples:0, latencyAvgMs:null },
    byFeature: [], byProvider: [], byModel: [], byStatus: [], topUsers: [], generatedAt: new Date().toISOString(),
  };
}

