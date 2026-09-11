import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";

/* بيستقبل اشتراك الـ Web Push من المتصفح ويحفظه (صف واحد لكل جهاز).
   السكيما في db/push-notifications.sql — شغّلها الأول من Supabase SQL Editor.

   الأمان:
   - الـ user_id بيتاخد من الجلسة، مش من body الطلب (قبل كده أي حد كان
     يقدر يبعت userId بتاع حد تاني ويستبدل اشتراكه).
   - الكتابة بـ service client عن قصد: لو نفس الجهاز اتسجّل عليه حساب تاني،
     الـ endpoint (الفريد عالمياً) لازم يتنقل للمستخدم الجديد — وده مستحيل
     بـ RLS لأن الصف القديم مملوك لحد تاني. الـ user_id من الجلسة الموثقة
     فمافيش انتحال. */

interface PushSubscriptionPayload {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export async function POST(req: NextRequest) {
  try {
    const { user, response: authError } = await requireUser("flat");
    if (authError) return authError;

    const body = (await req.json().catch(() => null)) as {
      subscription?: PushSubscriptionPayload;
      deviceInfo?: Record<string, unknown>;
    } | null;
    const subscription = body?.subscription;

    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;

    if (
      typeof endpoint !== "string" ||
      !endpoint.startsWith("https://") ||
      typeof p256dh !== "string" ||
      !p256dh ||
      typeof authKey !== "string" ||
      !authKey
    ) {
      return NextResponse.json({ error: "بيانات الاشتراك ناقصة أو غير صالحة" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth: authKey,
        device_info: (body?.deviceInfo as Record<string, string>) || {},
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return NextResponse.json({ error: "فشل حفظ الاشتراك" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "تم تفعيل الإشعارات بنجاح" });
  } catch (err) {
    console.error("push/subscribe error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
