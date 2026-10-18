import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SUBS_KEY = "is_subscriptions_enabled";
const PAYMENTS_KEY = "is_payments_enabled";
const FREE_KEY = "billing_free_period_enabled";
const PAY_KEY = "billing_payments_enabled";

function safeBool(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export async function GET() {
  try {
    const supabase = await createClient();
    // 1) Master Switch: الاشتراكات والدفع من system_settings
    const { data: sysRows } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [SUBS_KEY, PAYMENTS_KEY]);
    const sysMap = new Map((sysRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const isSubscriptionsEnabled = safeBool(sysMap.get(SUBS_KEY) ?? null);
    const isPaymentsEnabled = safeBool(sysMap.get(PAYMENTS_KEY) ?? null);

    // 2) إعدادات الفواتير من app_settings
    const { data: billRows } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [FREE_KEY, PAY_KEY]);
    const billMap = new Map((billRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const freePeriodEnabled = billMap.get(FREE_KEY) !== undefined ? safeBool(billMap.get(FREE_KEY)) : true;

    return NextResponse.json({
      ok: true,
      settings: {
        freePeriodEnabled,
        paymentsEnabled: isPaymentsEnabled,
        isSubscriptionsEnabled,
        isPaymentsEnabled,
      },
      source: "db",
    });
  } catch {
    // Safe defaults — never accidentally enable payments on failure
    return NextResponse.json({
      ok: true,
      settings: {
        freePeriodEnabled: true,
        paymentsEnabled: false,
        isSubscriptionsEnabled: true,
        isPaymentsEnabled: false,
      },
      source: "fallback-safe",
    });
  }
}
