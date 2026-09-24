"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";

/**
 * 📥 تصدير CSV حقيقي لنتائج بحث المستخدمين — Phase 4.4.
 *
 * - GET route هو اللي بيناديها (`/api/admin/users/export`) بعد فحص users.read.
 * - نفس فلاتر searchUsers بالظبط (q/plan/status/code/after/before) — بحد أقصى 500 صف للتصدير.
 * - CSV بترميز UTF-8 مع BOM عشان Excel يفتحه عربي صح + escape للفواصل والأسطر.
 */

function csvCell(v: string | null | undefined): string {
  const s = (v ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportUsersCsv(
  filters: { q?: string; plan?: string; status?: string; code?: string; after?: string | null; before?: string | null },
  adminUserId: string,
  adminEmail: string | null
): Promise<{ ok: boolean; csv?: string; count?: number; message?: string }> {
  const service = createServiceClient();
  const allowed = await hasPermission(service, adminUserId, adminEmail, "users.read");
  if (!allowed) {
    return { ok: false, message: "غير مصرح — تحتاج صلاحية users.read" };
  }

  const q = (filters.q || "").trim();
  let query = service
    .from("profiles")
    .select("id, display_name, email, persona, public_user_code, is_banned, created_at, entitlements(kind, value, metadata)")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (q) {
    const like = `%${q}%`;
    query = query.or(`display_name.ilike.${like},email.ilike.${like},public_user_code.ilike.${like}`);
  }
  if (filters.status === "banned") query = query.eq("is_banned", true);
  else if (filters.status === "active") query = query.or("is_banned.is.null,is_banned.eq.false");
  if (filters.code === "with_code") query = query.not("public_user_code", "is", null);
  else if (filters.code === "without_code") query = query.is("public_user_code", null);
  if (filters.after && /^\d{4}-\d{2}-\d{2}$/.test(filters.after)) query = query.gte("created_at", filters.after);
  if (filters.before && /^\d{4}-\d{2}-\d{2}$/.test(filters.before)) query = query.lte("created_at", filters.before + "T23:59:59.999Z");

  const { data, error } = await query;
  if (error || !data) {
    return { ok: false, message: "فشل الاستعلام: " + (error?.message || "لا بيانات") };
  }

  let rows = (data as any[]).map((r: any) => {
    const ents = r.entitlements as any[] | undefined;
    const isTrial = !!ents?.some?.((e: any) => e.kind === "plan" && e.metadata?.source === "premium_trial_0_5");
    const hasPremium = !!ents?.some?.((e: any) => e.kind === "plan" && e.value === "premium");
    return {
      ...r,
      plan: isTrial ? "trial" : hasPremium ? "premium" : "free",
    };
  });
  if (filters.plan === "premium") rows = rows.filter((r: any) => r.plan === "premium");
  else if (filters.plan === "trial") rows = rows.filter((r: any) => r.plan === "trial");
  else if (filters.plan === "free") rows = rows.filter((r: any) => r.plan === "free");

  const header = "id,display_name,email,persona,public_user_code,plan,is_banned,created_at";
  const lines = rows.map((r: any) =>
    [
      csvCell(r.id),
      csvCell(r.display_name),
      csvCell(r.email),
      csvCell(r.persona),
      csvCell(r.public_user_code),
      csvCell(r.plan),
      r.is_banned === true ? "banned" : "active",
      csvCell(r.created_at),
    ].join(",")
  );
  const csv = "﻿" + [header, ...lines].join("\n");
  return { ok: true, csv, count: rows.length };
}
