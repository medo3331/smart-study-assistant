import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  PUBLIC_CONFIG_KEYS,
  buildPublicConfig,
  buildPublicPlans,
} from "@/lib/config/public-config";

/**
 * GET /api/config/public — إعدادات المنصة **العامة**.
 *
 * ⚠️ لماذا endpoint مستقل:
 *   - بياناته عامة (رقم الدعم/القالب/العملة/الأسعار) ولا تحتاج مصادقة.
 *   - قابل لإعادة الاستخدام في /dashboard/profile و/pricing و/checkout.
 *   - لا يخلط إعدادات المنصة داخل endpoint خاص بالمستخدم مثل /api/me/plan-quota.
 *
 * ⚠️ الأمان: القراءة بـ service_role (تتجاوز RLS) لكن الاستعلام **مقيّد**
 * بقائمة مفاتيح بيضاء، وأي مفتاح خارجها لا يخرج. لا أسرار ولا بيانات مستخدمين.
 */
export const dynamic = "force-dynamic";

const PLANS_SELECT = "plan_key, display_name_ar, price, currency";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const [settings, plans] = await Promise.all([
      supabase.from("site_settings").select("key, value").in("key", [...PUBLIC_CONFIG_KEYS]),
      supabase
        .from("subscription_plans")
        .select(PLANS_SELECT)
        .eq("is_active", true)
        .order("plan_key", { ascending: true }),
    ]);

    if (settings.error) {
      return NextResponse.json({ error: "config_unavailable" }, { status: 500 });
    }

    const config = buildPublicConfig(
      (settings.data ?? []) as Array<{ key: string; value: unknown }>
    );
    // فشل قراءة الباقات لا يُسقط الـ endpoint — الأسعار اختيارية للعرض.
    const publicPlans = plans.error
      ? []
      : buildPublicPlans((plans.data ?? []) as Array<Record<string, unknown>>);

    return NextResponse.json(
      { ...config, plans: publicPlans },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "config_unavailable" }, { status: 500 });
  }
}
