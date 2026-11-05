import { createServiceClient } from "@/lib/supabase/admin";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import {
  grantStatus,
  isExpiringSoon,
  isUuid,
  type GrantStatus,
} from "@/lib/credits/grants";

/**
 * طبقة قراءة المنح للوحة الأدمن (Phase B2.4).
 *
 * ⚠️ سيرفر فقط: `createServiceClient` يتجاوز RLS. الصفحة تستدعي
 * `requireAdminPermission('credits.manage')` قبل أي نداء هنا.
 * ⚠️ كل الاستعلامات parameterized (pgQuery) — لا تركيب SQL بالنصوص.
 */

export type Grant = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  amount: number;
  consumed: number;
  remaining: number;
  source: string;
  grant_ref: string;
  expires_at: string;
  created_at: string;
  notes: string | null;
  status: GrantStatus;
};

export type GrantsOverview = {
  total_grants: number;
  active_grants: number;
  expired_grants: number;
  exhausted_grants: number;
  total_granted: number;
  total_consumed: number;
  total_remaining: number;
  expiring_soon: number;
};

export type GrantsFilters = {
  status?: GrantStatus | "all";
  source?: string;
  /** UUID أو جزء من البريد الإلكتروني. */
  query?: string;
  limit?: number;
};

const GRANT_COLUMNS =
  "id, user_id, amount, consumed, remaining, source, grant_ref, expires_at, created_at, notes";
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const GRANT_SOURCES = ["monthly", "manual", "trial", "bonus", "refund"] as const;

function clampLimit(limit: number | undefined): number {
  const value = Number.isFinite(limit) ? Math.trunc(limit as number) : DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, value));
}

/** إثراء الصفوف بالبريد واسم العرض — استعلامان فقط بغضّ النظر عن عدد الصفوف. */
async function attachUsers(
  rows: Array<Record<string, unknown>>
): Promise<Grant[]> {
  const ids = Array.from(
    new Set(rows.map((row) => String(row.user_id ?? "")).filter((id) => isUuid(id)))
  );

  const emailById = new Map<string, string | null>();
  const nameById = new Map<string, string | null>();

  if (ids.length > 0) {
    if (isPgConfigured()) {
      try {
        const emailRows = await pgQuery<{ id: string; email: string | null }>(
          "select id::text as id, email from auth.users where id = any($1::uuid[])",
          [ids]
        );
        for (const row of emailRows) emailById.set(row.id, row.email);
      } catch {
        // البريد تحسين للعرض فقط — فشله لا يُسقط الصفحة.
      }
    }
    try {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
        nameById.set(row.id, row.display_name);
      }
    } catch {
      // نفس المنطق: اسم العرض تحسين.
    }
  }

  return rows.map((row) => {
    const expiresAt = String(row.expires_at ?? "");
    const remaining = Number(row.remaining ?? 0);
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      user_email: emailById.get(String(row.user_id)) ?? null,
      user_name: nameById.get(String(row.user_id)) ?? null,
      amount: Number(row.amount ?? 0),
      consumed: Number(row.consumed ?? 0),
      remaining,
      source: String(row.source ?? ""),
      grant_ref: String(row.grant_ref ?? ""),
      expires_at: expiresAt,
      created_at: String(row.created_at ?? ""),
      notes: (row.notes as string | null) ?? null,
      status: grantStatus({ remaining, expires_at: expiresAt }),
    };
  });
}

/** يحوّل نص البحث إلى قائمة معرّفات مستخدمين (UUID مباشرة أو بريد). */
async function resolveUserIdsForQuery(query: string): Promise<string[] | null> {
  const q = query.trim();
  if (q === "") return null;
  if (isUuid(q)) return [q];

  if (!isPgConfigured()) return [];

  try {
    const rows = await pgQuery<{ id: string }>(
      "select id::text as id from auth.users where lower(email) like $1 limit 50",
      [`%${q.toLowerCase()}%`]
    );
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

export async function listGrants(filters: GrantsFilters = {}): Promise<Grant[]> {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  let request = supabase
    .from("credit_grants")
    .select(GRANT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(clampLimit(filters.limit));

  switch (filters.status ?? "all") {
    case "active":
      request = request.gt("remaining", 0).gt("expires_at", nowIso);
      break;
    case "expired":
      request = request.lte("expires_at", nowIso);
      break;
    case "exhausted":
      request = request.lte("remaining", 0).gt("expires_at", nowIso);
      break;
    default:
      break;
  }

  if (filters.source && (GRANT_SOURCES as readonly string[]).includes(filters.source)) {
    request = request.eq("source", filters.source);
  }

  const ids = await resolveUserIdsForQuery(filters.query ?? "");
  if (ids !== null) {
    if (ids.length === 0) return [];
    request = request.in("user_id", ids);
  }

  const { data, error } = await request;
  if (error) throw new Error(`credit_grants read failed: ${error.message}`);

  return attachUsers((data ?? []) as Array<Record<string, unknown>>);
}

export async function getExpiringSoon(days = 7, limit = 50): Promise<Grant[]> {
  const supabase = createServiceClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + Math.max(0, days) * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("credit_grants")
    .select(GRANT_COLUMNS)
    .gt("remaining", 0)
    .gt("expires_at", now.toISOString())
    .lte("expires_at", horizon.toISOString())
    .order("expires_at", { ascending: true })
    .limit(Math.min(MAX_LIMIT, Math.max(1, limit)));

  if (error) throw new Error(`expiring grants read failed: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return (await attachUsers(rows)).filter((grant) => isExpiringSoon(grant, days, now));
}

export async function getGrantsOverview(): Promise<GrantsOverview> {
  if (isPgConfigured()) {
    try {
      const rows = await pgQuery<GrantsOverview>(
        `select
           count(*)::int as total_grants,
           count(*) filter (where remaining > 0 and expires_at > now())::int as active_grants,
           count(*) filter (where expires_at <= now())::int as expired_grants,
           count(*) filter (where remaining <= 0 and expires_at > now())::int as exhausted_grants,
           coalesce(sum(amount), 0)::int as total_granted,
           coalesce(sum(consumed), 0)::int as total_consumed,
           coalesce(sum(remaining), 0)::int as total_remaining,
           count(*) filter (
             where remaining > 0 and expires_at > now()
               and expires_at <= now() + interval '7 days'
           )::int as expiring_soon
         from public.credit_grants`
      );
      if (rows[0]) return rows[0];
    } catch {
      // نسقط لحساب الذاكرة أدناه.
    }
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("credit_grants")
    .select("amount, consumed, remaining, expires_at")
    .limit(5000);

  if (error) throw new Error(`grants overview read failed: ${error.message}`);

  const now = new Date();
  const overview: GrantsOverview = {
    total_grants: 0,
    active_grants: 0,
    expired_grants: 0,
    exhausted_grants: 0,
    total_granted: 0,
    total_consumed: 0,
    total_remaining: 0,
    expiring_soon: 0,
  };

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const grant = {
      remaining: Number(row.remaining ?? 0),
      expires_at: String(row.expires_at ?? ""),
    };
    const status = grantStatus(grant, now);
    overview.total_grants += 1;
    if (status === "active") overview.active_grants += 1;
    if (status === "expired") overview.expired_grants += 1;
    if (status === "exhausted") overview.exhausted_grants += 1;
    overview.total_granted += Number(row.amount ?? 0);
    overview.total_consumed += Number(row.consumed ?? 0);
    overview.total_remaining += Number(row.remaining ?? 0);
    if (isExpiringSoon(grant, 7, now)) overview.expiring_soon += 1;
  }

  return overview;
}
