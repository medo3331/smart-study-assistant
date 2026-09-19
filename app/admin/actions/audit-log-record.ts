// ============================================================
// EPIC-2 — Audit Log Recording (server-only, service_role allowed)
// Created 2026-09-19 — requires DB execution of `audit_log` table first.
// ============================================================

import { createServiceClient } from "@/lib/supabase/admin";
import type { AdminPermissionKey } from "@/lib/auth-roles";

export interface AuditLogEntry {
  actor: string | null;        // user UUID
  actor_email: string | null;
  action: AdminPermissionKey | string;
  resource_type: string;
  resource_id: string | null;
  details?: Record<string, unknown>;
  result: "PASS" | "FAIL" | "BLOCKED";
}

/** تسجيل عملية حساسة في audit_log — يستخدم service_role (يتخطى RLS). */
export async function recordAuditLog(entry: AuditLogEntry): Promise<{ id: string | null; error: string | null }> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("audit_log")
      .insert({
        actor: entry.actor ? (entry.actor as any) : null,
        actor_email: entry.actor_email,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        details: (entry.details ? JSON.stringify(entry.details) : undefined) || null,
        timestamp: new Date().toISOString(),
        result: entry.result,
      })
      .select("id")
      .single();

    if (error) return { id: null, error: error.message || error.toString() };
    return { id: data?.id || null, error: null };
  } catch (e: any) {
    // في حالة فشل الـDB (مثلاً جدول audit_log مش موجود بعد) — لا نوقف التنفيذ
    // بس نسجل الخطأ (silent fail per spec: audit must not break user flow)
    console.error("[audit-log-record] Silent fail — audit not recorded:", e?.message || e);
    return { id: null, error: e?.message || String(e) };
  }
}
