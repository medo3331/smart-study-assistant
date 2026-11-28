/**
 * تجميع حالة الكريديت والاستهلاك — منطق نقي قابل للاختبار.
 *
 * لا يستورد Supabase ولا Next. يُستخدم في `/api/me/credits` وفي الاختبارات.
 * المصادر: `ai_credit_ledger` (RLS: owner reads) و`entitlements` (owner reads)
 * و`subscription_plans` (قراءة service_role لبيانات تسعير عامة).
 */

export type LedgerRow = {
  delta: number | string | null;
  reason: string | null;
  ref_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type EntitlementRow = {
  value: string | null;
  expires_at: string | null;
};

export type PlanInfo = {
  plan_key: string;
  name?: string | null;
  display_name_ar?: string | null;
  credits_monthly?: number | null;
};

export type UsageSlice = { key: string; label: string; used: number };

export type CreditsSummary = {
  balance: number;
  month: {
    start: string;
    end: string;
    used: number;
    granted: number;
    byKind: UsageSlice[];
    daily: { date: string; used: number }[];
    daysElapsed: number;
    daysInMonth: number;
  };
  subscription: {
    tier: string;
    planName: string;
    creditsMonthly: number;
    expiresAt: string | null;
    daysRemaining: number | null;
    expired: boolean;
    usedPercent: number | null;
  };
  recent: {
    at: string;
    delta: number;
    label: string;
    reason: string;
    refId: string | null;
  }[];
};

/* ═══ تسميات عربية ═══ */

const REASON_LABELS: Record<string, string> = {
  ai_reserve: "استخدام الذكاء الاصطناعي",
  ai_refund: "استرجاع حجز",
  grant: "منحة رصيد",
  grant_ai_credits: "منحة رصيد",
  purchase: "شراء رصيد",
  store_purchase: "شراء من المتجر",
  earn: "مكافأة",
  spend: "صرف",
  box: "صندوق",
  admin: "تعديل إداري",
  premium_trial: "تجربة premium",
};

const KIND_LABELS: Record<string, string> = {
  text: "محادثة ونصوص",
  vision: "صور وملفات",
};

export function reasonLabel(reason: string | null | undefined): string {
  const key = (reason ?? "").trim();
  return REASON_LABELS[key] ?? (key || "عملية");
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/* ═══ أدوات التجميع ═══ */

export function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** بداية الشهر الحالي بتوقيت UTC — نفس مرجع الشهر لكل الحسابات. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function monthEndUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function dayKeyUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function daysBetweenUtc(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

/** التصنيف المستخدم لعرض "استهلك في إيه": metadata.kind ثم metadata.agent ثم reason. */
export function usageBucket(row: LedgerRow): string {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const kind = typeof meta.kind === "string" && meta.kind.trim() ? meta.kind.trim() : null;
  if (kind) return kindLabel(kind);
  const agent = typeof meta.agent === "string" && meta.agent.trim() ? meta.agent.trim() : null;
  if (agent) return agent;
  const feature = typeof meta.feature === "string" && meta.feature.trim() ? meta.feature.trim() : null;
  if (feature) return feature;
  return reasonLabel(row.reason);
}

export type CreditsSummaryInput = {
  ledger: LedgerRow[];
  entitlement: EntitlementRow | null;
  plan: PlanInfo | null;
  now?: string;
};

export function buildCreditsSummary(input: CreditsSummaryInput): CreditsSummary {
  const now = input.now ? new Date(input.now) : new Date();
  const mStart = monthStartUtc(now);
  const mEnd = monthEndUtc(now);
  const mStartIso = mStart.toISOString();
  const mEndIso = mEnd.toISOString();

  let balance = 0;
  let monthUsed = 0;
  let monthGranted = 0;

  const byKind = new Map<string, number>();
  const daily = new Map<string, number>();

  for (const row of input.ledger ?? []) {
    const delta = toNumber(row.delta);
    balance += delta;
    const at = new Date(row.created_at);
    if (Number.isNaN(at.getTime()) || at < mStart || at >= mEnd) continue;

    if (delta < 0) {
      const used = Math.abs(delta);
      monthUsed += used;
      const bucket = usageBucket(row);
      byKind.set(bucket, (byKind.get(bucket) ?? 0) + used);
      const key = dayKeyUtc(row.created_at);
      if (key) daily.set(key, (daily.get(key) ?? 0) + used);
    } else {
      monthGranted += delta;
    }
  }

  const daysInMonth = Math.ceil((mEnd.getTime() - mStart.getTime()) / 86_400_000);
  const daysElapsed = Math.min(
    daysInMonth,
    Math.max(1, Math.ceil((now.getTime() - mStart.getTime()) / 86_400_000))
  );

  const dailySeries: { date: string; used: number }[] = [];
  for (let i = 0; i < daysElapsed; i++) {
    const d = new Date(mStart.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    dailySeries.push({ date: key, used: daily.get(key) ?? 0 });
  }

  const tier = (input.entitlement?.value ?? "free").trim() || "free";
  const expiresAt = input.entitlement?.expires_at ?? null;
  let daysRemaining: number | null = null;
  let expired = false;
  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (!Number.isNaN(exp.getTime())) {
      const diff = Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
      expired = exp.getTime() <= now.getTime();
      daysRemaining = Math.max(0, diff);
    }
  }

  const creditsMonthly = Math.max(0, Math.trunc(toNumber(input.plan?.credits_monthly ?? 0)));
  const usedPercent =
    creditsMonthly > 0
      ? Math.min(100, Math.max(0, Math.round((monthUsed / creditsMonthly) * 100)))
      : null;

  const recent = (input.ledger ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15)
    .map((row) => ({
      at: row.created_at,
      delta: toNumber(row.delta),
      label: usageBucket(row),
      reason: row.reason ?? "",
      refId: row.ref_id ?? null,
    }));

  const byKindList: UsageSlice[] = [...byKind.entries()]
    .map(([key, used]) => ({ key, label: key, used }))
    .sort((a, b) => b.used - a.used);

  return {
    balance,
    month: {
      start: mStartIso,
      end: mEndIso,
      used: monthUsed,
      granted: monthGranted,
      byKind: byKindList,
      daily: dailySeries,
      daysElapsed,
      daysInMonth,
    },
    subscription: {
      tier,
      planName: input.plan?.display_name_ar || input.plan?.name || tier,
      creditsMonthly,
      expiresAt,
      daysRemaining,
      expired,
      usedPercent,
    },
    recent,
  };
}
