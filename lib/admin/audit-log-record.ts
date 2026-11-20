// Server-only audit writer. This helper intentionally lives outside app/actions
// so callers cannot invoke it as an unauthenticated Server Action.
import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import type { AdminPermissionKey } from "@/lib/auth-roles";

export interface AuditLogEntry {
  actor: string | null;
  actor_email: string | null;
  action: AdminPermissionKey | string;
  resource_type: string;
  resource_id: string | null;
  details?: Record<string, unknown>;
  result: "PASS" | "FAIL" | "BLOCKED";
}

/** Record a sensitive operation in admin_audit_log using the service client. */
export async function recordAuditLog(
  entry: AuditLogEntry
): Promise<{ id: string | null; error: string | null }> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("admin_audit_log")
      .insert({
        actor: entry.actor ? (entry.actor as any) : null,
        actor_email: entry.actor_email,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        details: entry.details ?? {},
        created_at: new Date().toISOString(),
        result: entry.result,
      })
      .select("id")
      .single();

    if (error) return { id: null, error: error.message || error.toString() };
    return { id: data?.id || null, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[audit-log-record] Silent fail — audit not recorded:", message);
    return { id: null, error: message };
  }
}
