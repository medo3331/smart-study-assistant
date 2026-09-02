import { createClient } from "@/lib/supabase/server";

export type PlanStateEvent = CustomEvent<{ freePeriodEnabled: boolean; paymentsEnabled: boolean }>;

export type PlanSetting = { key: string; value: string; updated_at?: string };

const FREE_KEY = "billing_free_period_enabled";
const PAY_KEY = "billing_payments_enabled";

function safeBool(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export async function getPlanSettings(): Promise<{ freePeriodEnabled: boolean; paymentsEnabled: boolean; source: "db" | "default" }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("key,value").in("key", [FREE_KEY, PAY_KEY]);
  if (error || !data || data.length === 0) {
    return { freePeriodEnabled: true, paymentsEnabled: false, source: "default" };
  }
  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    freePeriodEnabled: safeBool(map.get(FREE_KEY) ?? null),
    paymentsEnabled: safeBool(map.get(PAY_KEY) ?? null),
    source: "db",
  };
}

export async function isAdminOwner(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!ownerEmail) return false;
  const { data } = await supabase.from("profiles").select("email").eq("id", userId).single().catch(() => ({ data: null }));
  return (data as any)?.email?.trim().toLowerCase() === ownerEmail;
}
