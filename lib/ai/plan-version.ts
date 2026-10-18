/**
 * plan-version.ts — Plan versioning helper for subscription plans.
 *
 * Calls RPC `public.get_active_plan_version(p_plan_key)` via service_role client
 * and returns the active plan version for the given plan_key
 * (effective_date <= now() and highest version).
 *
 * Server-only — uses service_role (bypasses RLS).
 */
import { createServiceClient } from "@/lib/supabase/admin";

export type PlanKey = "free" | "pro" | "ultra" | string;

export interface ActivePlanVersion {
  plan_key: string;
  name: string;
  display_name_ar: string;
  profile_limit: number;
  messages_per_2h: number;
  uploads_daily: number;
  max_file_size_mb: number;
  file_types: string[];
  video_audio_exclusive: boolean;
  priority_queue: string;
  trial_days: number;
  is_active: boolean;
  version: number;
  effective_date: string | null;
}

export interface GetActivePlanVersionResult {
  /** The active plan row or null if no active key found */
  row: ActivePlanVersion | null;
  /** Plan key exists in table but is not active / effective_date not yet reached */
  foundButInactive: boolean;
  /** Error when key not found */
  error?: string;
}

/**
 * Calls `get_active_plan_version` to get the active plan row for `plan_key`.
 *
 * Selection rule (from SQL):
 *   WHERE plan_key = $1 AND is_active = true AND effective_date <= now()
 *   ORDER BY version DESC
 *   LIMIT 1
 *
 * @param planKey — plan key (e.g. 'free', 'pro', 'ultra')
 * @returns result with `row` (active plan) or `foundButInactive` (key exists but inactive)
 */
export async function getActivePlanVersion(
  planKey: string
): Promise<GetActivePlanVersionResult> {
  try {
    const privileged = createServiceClient();
    const { data, error } = await privileged.rpc(
      "get_active_plan_version",
      { p_plan_key: planKey } as { p_plan_key: string }
    );

    if (error) {
      return { row: null, foundButInactive: false, error: error.message };
    }

    const rows = (data as unknown[] | null) ?? [];
    if (rows.length === 0) {
      // Could be inactive or not found — check via planKeyExists
      const exists = await planKeyExists(planKey);
      return {
        row: null,
        foundButInactive: exists,
        error: exists
          ? "Plan key exists but no active version (is_active=false or effective_date in future)"
          : "Plan key not found",
      };
    }

    return {
      row: rows[0] as ActivePlanVersion,
      foundButInactive: false,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { row: null, foundButInactive: false, error: msg };
  }
}

/**
 * Fetches the full active plan row for a given plan key.
 * Convenience wrapper around getActivePlanVersion returning just the row.
 */
export async function getActivePlanRow(
  planKey: string
): Promise<ActivePlanVersion | null> {
  const result = await getActivePlanVersion(planKey);
  return result.row;
}

/**
 * Checks whether a plan_key exists in subscription_plans table
 * (regardless of is_active / effective_date).
 */
export async function planKeyExists(planKey: string): Promise<boolean> {
  try {
    const privileged = createServiceClient();
    const { data, error } = await privileged.rpc(
      "get_active_plan_version",
      { p_plan_key: planKey } as { p_plan_key: string }
    );
    if (error) return false;
    const rows = (data as unknown[] | null) ?? [];
    return rows.length > 0;
  } catch {
    return false;
  }
}
