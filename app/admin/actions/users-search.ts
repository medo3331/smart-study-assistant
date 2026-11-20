"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/credits/grants";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";

export interface UserSearchResult {
  id: string;
  display_name: string | null;
  email: string | null;
  persona: string | null;
  role: string | null;
  user_code: string | null;
  public_user_code: string | null;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  plan_key: string | null;
  on_trial: boolean;
  plan_status: "active" | "free" | "expired" | "unknown";
  plan_expires_at: string | null;
  active_activation_id: string | null;
  payment_status: "paid" | "unpaid" | "unknown";
  payment_total: number | null;
  payment_currency: string | null;
  payment_method: string | null;
  last_payment_at: string | null;
  admin_category: string | null;
  issue_status: string | null;
  issue_note: string | null;
  internal_note: string | null;
  admin_record_available: boolean;
  created_at: string | null;
}

/**
 * بحث المستخدمين — Phase 4.4: فلاتر حقيقية على الداتابيز عبر service client.
 *
 * - q: بحث ilike على display_name/email/public_user_code.
 * - planFilter: free (بلا premium) / premium (غير تجربة) / trial (مصدر premium_trial_0_5).
 * - statusFilter: banned = profiles.is_banned = true (الفجوة الموثقة أُغلقت — الحالة حقيقية من DB).
 * - codeFilter: with_code (public_user_code غير فارغ) / without_code (فارغ).
 * - createdAfter/createdBefore: نطاق تاريخ (YYYY-MM-DD) على profiles.created_at.
 * - ترتيب: الأحدث أولًا. حد أقصى 50.
 */
async function listAllAuthUsers(privileged: ReturnType<typeof createServiceClient>) {
  const users: Array<{ id: string; email?: string }> = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await privileged.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("تعذر تحميل قائمة الحسابات المسجلة.");
    const rows = data?.users ?? [];
    users.push(...rows.map((user) => ({ id: user.id, email: user.email ?? undefined })));
    if (rows.length < 1000) return users;
  }
  throw new Error("تجاوز دليل الحسابات حد المسح الآمن.");
}

export async function searchUsers(
  query: string,
  planFilter: string = "all",
  statusFilter: string = "all",
  codeFilter: string = "all",
  createdAfter: string | null = null,
  createdBefore: string | null = null
): Promise<UserSearchResult[]> {
  // ⚠️ أمان (P0، 2026-11): كانت بتشتغل بـ service_role بدون أي فحص — أي حد
  // يقدر يسحب كل المستخدمين وإيميلاتهم (من auth.users كمان).
  try {
    await requireAdminActor("users.read");
  } catch (e) {
    if (e instanceof ActionAuthError) return [];
    throw e;
  }

  try {
    const privileged = createServiceClient();
    const q = (query || "").trim();

    let baseQuery = privileged
      .from("profiles")
      .select("id, display_name, email, persona, role, public_user_code, is_banned, banned_at, ban_reason, created_at");

    let codeMatchUserId: string | null = null;
    if (isUuid(q)) {
      baseQuery = baseQuery.eq("id", q);
    } else if (q) {
      const like = `%${q.replace(/[%,()]/g, " ")}%`;
      baseQuery = baseQuery.or(
        `display_name.ilike.${like},email.ilike.${like},public_user_code.ilike.${like}`
      );
      if (/^[a-z0-9-]{4,32}$/i.test(q)) {
        try {
          const { data: codeMatch } = await privileged.from("user_codes").select("user_id").eq("code", q.toUpperCase()).eq("is_active", true).maybeSingle();
          codeMatchUserId = codeMatch?.user_id ?? null;
        } catch { /* codes schema is optional */ }
      }
    }

    if (statusFilter === "banned") baseQuery = baseQuery.eq("is_banned", true);
    else if (statusFilter === "active") baseQuery = baseQuery.or("is_banned.is.null,is_banned.eq.false");

    if (codeFilter === "with_code") baseQuery = baseQuery.not("public_user_code", "is", null);
    else if (codeFilter === "without_code") baseQuery = baseQuery.is("public_user_code", null);

    if (createdAfter && /^\d{4}-\d{2}-\d{2}$/.test(createdAfter)) {
      baseQuery = baseQuery.gte("created_at", createdAfter);
    }
    if (createdBefore && /^\d{4}-\d{2}-\d{2}$/.test(createdBefore)) {
      baseQuery = baseQuery.lte("created_at", createdBefore + "T23:59:59.999Z");
    }

    baseQuery = baseQuery.order("created_at", { ascending: false, nullsFirst: false });

    const { data, error } = await baseQuery.limit(50);
    let searchRows = data ?? [];
    if (!error && codeMatchUserId && !searchRows.some((row: any) => row.id === codeMatchUserId)) {
      const { data: codeProfile } = await privileged.from("profiles").select("id, display_name, email, persona, role, public_user_code, is_banned, banned_at, ban_reason, created_at").eq("id", codeMatchUserId).maybeSingle();
      if (codeProfile) searchRows = [codeProfile, ...searchRows].slice(0, 50);
    }
    // Enrich emails from auth.users (profiles.email is often NULL).
    // Resolve only the current page's IDs so large auth directories are not rescanned per query.
    let emailMap: Record<string, string> = {};
    try {
      for (const id of searchRows.map((row: any) => row.id).filter(Boolean)) {
        const { data: account, error: accountError } = await privileged.auth.admin.getUserById(id);
        if (!accountError && account.user?.email) emailMap[id] = account.user.email;
      }
    } catch (error) {
      console.error("[admin users-search] auth email lookup failed", error);
    }

    // Fetch related codes/entitlements separately (no FK dependency on PostgREST joins)
    const profileIds = searchRows.map((r: any) => r.id).filter(Boolean);
    const codesByUser: Record<string, string | null> = {};
    const entitlementsByUser: Record<string, any[]> = {};
    let entitlementsAvailable = true;
    if (profileIds.length) {
      try {
        const { data: codeRows } = await privileged
          .from("user_codes")
          .select("user_id, code, is_active")
          .in("user_id", profileIds);
        for (const c of codeRows ?? []) {
          if (c?.is_active && c?.user_id && !codesByUser[c.user_id]) codesByUser[c.user_id] = c.code ?? null;
        }
      } catch {}
      try {
        const { data: entRows, error: entitlementsError } = await privileged
          .from("entitlements")
          .select("user_id, kind, value, metadata, expires_at, created_at")
          .in("user_id", profileIds);
        if (entitlementsError) entitlementsAvailable = false;
        for (const e of entRows ?? []) {
          if (!e?.user_id) continue;
          if (!entitlementsByUser[e.user_id]) entitlementsByUser[e.user_id] = [];
          entitlementsByUser[e.user_id].push(e);
        }
      } catch {
        entitlementsAvailable = false;
      }
    }

    // Attach nested-like fields for mapRows compatibility
    const enrichedData = searchRows.map((r: any) => ({
      ...r,
      user_codes: codesByUser[r.id] ? [{ code: codesByUser[r.id], is_active: true }] : [],
      entitlements: entitlementsByUser[r.id] ?? [],
      entitlements_available: entitlementsAvailable,
    }));
    const operationalData = await loadUserOperationalData(privileged, profileIds);
    const rowsWithOperations = enrichedData.map((row: any) => ({ ...row, ...(operationalData[row.id] ?? {}) }));

    if (error) {
      if (error?.message?.includes("created_at")) {
        const retry = await privileged
          .from("profiles")
          .select("id, display_name, email, persona, role, public_user_code, is_banned, banned_at, ban_reason")
          .limit(50);
        if (retry.error || !retry.data) throw new Error(retry.error?.message || "profiles retry failed");
        // enrich retry too
        const retryIds = (retry.data ?? []).map((r: any) => r.id).filter(Boolean);
        const retryCodes: Record<string, string | null> = {};
        const retryEnts: Record<string, any[]> = {};
        if (retryIds.length) {
          try {
            const { data: cr } = await privileged.from("user_codes").select("user_id, code, is_active").in("user_id", retryIds);
            for (const c of cr ?? []) if (c?.is_active && c?.user_id && !retryCodes[c.user_id]) retryCodes[c.user_id] = c.code ?? null;
          } catch {}
          try {
            const { data: er } = await privileged.from("entitlements").select("user_id, kind, value, metadata").in("user_id", retryIds);
            for (const e of er ?? []) {
              if (!e?.user_id) continue;
              if (!retryEnts[e.user_id]) retryEnts[e.user_id] = [];
              retryEnts[e.user_id].push(e);
            }
          } catch {}
        }
        const retryEnriched = (retry.data ?? []).map((r: any) => ({
          ...r,
          user_codes: retryCodes[r.id] ? [{ code: retryCodes[r.id], is_active: true }] : [],
          entitlements: retryEnts[r.id] ?? [],
        }));
        const retryOps = await loadUserOperationalData(privileged, retryIds);
        const mappedRetry = mapRows(retryEnriched.map((row: any) => ({ ...row, ...(retryOps[row.id] ?? {}), entitlements_available: true })) as any[], planFilter);
        return mappedRetry.map((u) => ({ ...u, email: u.email || emailMap[u.id] || null }));
      }
      throw new Error(error.message || "profiles query failed");
    }
    if (!data) throw new Error("profiles query returned no data");

    const mapped = mapRows(rowsWithOperations as any[], planFilter);
    const enriched = mapped.map((u) => ({ ...u, email: u.email || emailMap[u.id] || null }));
    // fallback: profiles.email غالباً NULL...
    if (q && enriched.length === 0) {
      try {
        const authUsers = await listAllAuthUsers(privileged);
        const needle = q.toLowerCase();
        const matchedIds = authUsers
          .filter((u) => (u.email ?? "").toLowerCase().includes(needle))
          .slice(0, 50)
          .map((u) => u.id);
        if (matchedIds.length > 0) {
          const { data: fallbackRows } = await privileged
            .from("profiles")
            .select("id, display_name, email, persona, role, public_user_code, is_banned, banned_at, ban_reason, created_at")
            .in("id", matchedIds)
            .limit(50);
          if (fallbackRows) {
            const fbIds = fallbackRows.map((r: any) => r.id).filter(Boolean);
            const fbCodes: Record<string, string | null> = {};
            const fbEnts: Record<string, any[]> = {};
            if (fbIds.length) {
              try {
                const { data: cr } = await privileged.from("user_codes").select("user_id, code, is_active").in("user_id", fbIds);
                for (const c of cr ?? []) if (c?.is_active && c?.user_id && !fbCodes[c.user_id]) fbCodes[c.user_id] = c.code ?? null;
              } catch {}
              try {
                const { data: er } = await privileged.from("entitlements").select("user_id, kind, value, metadata").in("user_id", fbIds);
                for (const e of er ?? []) {
                  if (!e?.user_id) continue;
                  if (!fbEnts[e.user_id]) fbEnts[e.user_id] = [];
                  fbEnts[e.user_id].push(e);
                }
              } catch {}
            }
            const fbEnriched = fallbackRows.map((r: any) => ({
              ...r,
              user_codes: fbCodes[r.id] ? [{ code: fbCodes[r.id], is_active: true }] : [],
              entitlements: fbEnts[r.id] ?? [],
              entitlements_available: true,
            }));
            const fbOps = await loadUserOperationalData(privileged, fbIds);
            return mapRows(fbEnriched.map((row: any) => ({ ...row, ...(fbOps[row.id] ?? {}) })) as any[], planFilter).map((u) => ({ ...u, email: u.email || emailMap[u.id] || null }));
          }
        }
      } catch {
        // fallback الأفضل جهد — لو فشل، أرجع النتائج الأصلية (فارغة)
      }
    }

    return enriched;
  } catch (e: any) {
    console.error("[admin users-search] failed:", e?.message || e);
    throw new Error(e?.message || "searchUsers failed");
  }
}

type UserOperationalData = Pick<UserSearchResult,
  | "plan_key" | "plan_status" | "plan_expires_at" | "active_activation_id"
  | "payment_status" | "payment_total" | "payment_currency" | "payment_method" | "last_payment_at"
  | "admin_category" | "issue_status" | "issue_note" | "internal_note" | "admin_record_available"
>;

async function loadUserOperationalData(
  privileged: ReturnType<typeof createServiceClient>,
  userIds: string[]
): Promise<Record<string, Partial<UserOperationalData>>> {
  const result: Record<string, Partial<UserOperationalData>> = {};
  for (const id of userIds) result[id] = {
    plan_key: null, plan_status: "unknown", plan_expires_at: null, active_activation_id: null,
    payment_status: "unknown", payment_total: null, payment_currency: null, payment_method: null, last_payment_at: null,
    admin_category: null, issue_status: null, issue_note: null, internal_note: null, admin_record_available: false,
  };
  if (!userIds.length) return result;

  const [entitlementsResult, activationsResult, paymentsResult, adminRecordsResult, ticketsResult] = await Promise.all([
    privileged.from("entitlements").select("user_id, kind, value, metadata, expires_at, created_at").in("user_id", userIds).eq("kind", "plan"),
    privileged.from("subscription_activations").select("id, user_id, plan_key, duration_days, created_at, revoked_at").in("user_id", userIds).is("revoked_at", null).order("created_at", { ascending: false }).limit(Math.max(userIds.length * 10, 100)),
    privileged.from("payments").select("user_id, amount, currency, method, paid_at").in("user_id", userIds).order("paid_at", { ascending: false }).limit(5000),
    privileged.from("admin_user_operations").select("user_id, category, payment_status, paid_amount, currency, payment_method, paid_at, issue_status, internal_note").in("user_id", userIds),
    privileged.from("support_tickets").select("user_id, status, subject, category, updated_at").in("user_id", userIds).order("updated_at", { ascending: false }).limit(Math.max(userIds.length * 10, 100)),
  ]);

  const now = Date.now();
  const adminOperationsAvailable = !adminRecordsResult.error;
  const activationHistoryAvailable = !activationsResult.error;
  const entitlementHistoryAvailable = !entitlementsResult.error;
  const entitlementByUser = new Map<string, any>();
  for (const row of entitlementsResult.data ?? []) {
    if (row.kind !== "plan") continue;
    const expiry = row.expires_at ? new Date(row.expires_at).getTime() : Infinity;
    if (expiry <= now) continue;
    const previous = entitlementByUser.get(row.user_id);
    const currentCreated = new Date(row.created_at ?? 0).getTime();
    const previousCreated = new Date(previous?.created_at ?? 0).getTime();
    if (!previous || currentCreated >= previousCreated) entitlementByUser.set(row.user_id, row);
  }

  const activationByUser = new Map<string, any>();
  for (const row of activationsResult.data ?? []) {
    if (!activationByUser.has(row.user_id)) activationByUser.set(row.user_id, row);
  }

  const paymentsByUser = new Map<string, { total: number; currency: string; lastPaidAt: string | null; method: string | null }>();
  for (const row of paymentsResult.data ?? []) {
    const previous = paymentsByUser.get(row.user_id);
    if (previous) {
      if (previous.currency === row.currency) previous.total += Number(row.amount) || 0;
      if (!previous.lastPaidAt || (row.paid_at && row.paid_at > previous.lastPaidAt)) previous.lastPaidAt = row.paid_at;
    } else {
      paymentsByUser.set(row.user_id, { total: Number(row.amount) || 0, currency: row.currency ?? "EGP", lastPaidAt: row.paid_at ?? null, method: row.method ?? null });
    }
  }
  const categoriesByUser = new Map<string, any>();
  for (const row of adminRecordsResult.data ?? []) categoriesByUser.set(row.user_id, row);
  const ticketsByUser = new Map<string, any>();
  for (const row of ticketsResult.data ?? []) if (!ticketsByUser.has(row.user_id)) ticketsByUser.set(row.user_id, row);

  for (const id of userIds) {
    const entitlement = entitlementByUser.get(id);
    const activation = activationByUser.get(id);
    const payment = paymentsByUser.get(id);
    const hasLegacyPayment = !!payment;
    const adminRecord = categoriesByUser.get(id);
    const ticket = ticketsByUser.get(id);
    const activationExpiry = activation?.created_at
      ? new Date(new Date(activation.created_at).getTime() + Number(activation.duration_days) * 86_400_000)
      : null;
    const activationIsActive = !!activationExpiry && activationExpiry.getTime() > now;
    const isTrial = entitlement?.metadata?.source === "premium_trial_0_5";
    let planKey = entitlement?.value ?? (activationIsActive ? activation.plan_key : null);
    let planStatus: UserOperationalData["plan_status"] = "unknown";
    if (entitlement || activationIsActive) {
      planStatus = "active";
    } else if (!entitlementHistoryAvailable || !activationHistoryAvailable) {
      planStatus = "unknown";
    } else {
      planStatus = activation ? "expired" : "free";
    }
    if (planStatus === "free") planKey = "free";
    if (planStatus === "expired" && !planKey) planKey = activation?.plan_key ?? null;
    result[id] = {
      plan_key: planKey ?? null,
      plan_status: planStatus,
      plan_expires_at: entitlement?.expires_at ?? (activationIsActive ? activationExpiry?.toISOString() ?? null : null),
      active_activation_id: activationIsActive ? activation.id : null,
      payment_status: adminRecord?.payment_status ?? (paymentsResult.error || adminRecordsResult.error || !adminRecord && !hasLegacyPayment ? "unknown" : hasLegacyPayment ? "paid" : "unknown"),
      payment_total: adminRecord?.payment_status === "paid" && adminRecord.paid_amount != null ? Number(adminRecord.paid_amount) : payment?.total ?? null,
      payment_currency: adminRecord?.payment_status === "paid" ? adminRecord.currency : payment?.currency ?? null,
      payment_method: adminRecord?.payment_status === "paid" ? adminRecord.payment_method : payment?.method ?? null,
      last_payment_at: adminRecord?.payment_status === "paid" ? adminRecord.paid_at : payment?.lastPaidAt ?? null,
      admin_category: adminRecord?.category ?? null,
      issue_status: adminRecord?.issue_status === "in_progress"
        ? "in_progress"
        : ticket && !["resolved", "closed"].includes(ticket.status)
          ? "open"
          : adminRecord?.issue_status ?? (ticketsResult.error ? null : ticket ? "resolved" : "none"),
      issue_note: ticket && !["resolved", "closed"].includes(ticket.status)
        ? ticket.subject
        : adminRecord?.internal_note ?? (ticketsResult.error ? null : ticket?.subject ?? null),
      internal_note: adminRecord?.internal_note ?? null,
      admin_record_available: adminOperationsAvailable,
      ...(isTrial ? { plan_status: "active" as const } : {}),
    };
  }
  return result;
}

function mapRows(rows: any[], planFilter: string): UserSearchResult[] {
  return rows
    .map((row: any) => {
      const ents = row.entitlements as any[] | undefined;
      const isTrial = !!ents?.some?.((e: any) => e.kind === "plan" && e.metadata?.source === "premium_trial_0_5");
      const operational = row.admin_record_available === undefined ? {} : row;
      const activePlanEntitlement = ents?.find?.((e: any) => e.kind === "plan" && (!e.expires_at || new Date(e.expires_at).getTime() > Date.now()));
      const fallbackPlan = activePlanEntitlement?.value ?? row.plan_key ?? (row.entitlements_available === false ? null : "free");
      const planKey = operational.plan_key ?? fallbackPlan;
      const planStatus = operational.plan_status ?? (row.entitlements_available === false ? "unknown" : activePlanEntitlement ? "active" : "free");
      return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        persona: row.persona,
        role: row.role,
        user_code: row.user_codes?.[0]?.code || null,
        public_user_code: row.public_user_code || null,
        is_banned: row.is_banned === true,
        banned_at: row.banned_at || null,
        ban_reason: row.ban_reason || null,
        plan_key: planKey,
        plan_status: planStatus,
        plan_expires_at: operational.plan_expires_at ?? activePlanEntitlement?.expires_at ?? null,
        active_activation_id: operational.active_activation_id ?? null,
        payment_status: operational.payment_status ?? "unknown",
        payment_total: operational.payment_total ?? null,
        payment_currency: operational.payment_currency ?? null,
        payment_method: operational.payment_method ?? null,
        last_payment_at: operational.last_payment_at ?? null,
        admin_category: operational.admin_category ?? null,
        issue_status: operational.issue_status ?? null,
        issue_note: operational.issue_note ?? null,
        internal_note: operational.internal_note ?? null,
        admin_record_available: operational.admin_record_available === true,
        on_trial: isTrial,
        created_at: row.created_at || null,
      } as UserSearchResult;
    })
    .filter((u) => {
      if (planFilter === "premium") return ["pro", "ultra", "premium"].includes(u.plan_key ?? "") && !u.on_trial && u.plan_status === "active";
      if (planFilter === "trial") return u.on_trial;
      if (planFilter === "free") return u.plan_key === "free" || u.plan_status === "free";
      return true;
    });
}
