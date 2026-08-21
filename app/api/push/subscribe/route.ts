// ✅ ستب لـ API route بيستقبل اشتراك الـ Push من المتصفح ويحفظه.
// ده الجزء اللي كان ناقص عشان زرار "تفعيل تنبيهات حتى لو التطبيق مقفول" في page.tsx يشتغل فعليًا.
//
// خطوات التشغيل الكاملة (من ناحيتك):
// ---------------------------------------------------------------
// 1) ثبّت مكتبة web-push:
//      npm install web-push
//
// 2) ولّد مفاتيح VAPID مرة واحدة (في التيرمنال):
//      npx web-push generate-vapid-keys
//    هيديك Public Key و Private Key.
//
// 3) في .env.local:
//      NEXT_PUBLIC_VAPID_PUBLIC_KEY=البابليك كي
//      VAPID_PRIVATE_KEY=الپرايفت كي
//
// 4) اعمل جدول في Supabase اسمه push_subscriptions بالأعمدة:
//      id (uuid, primary key, default: gen_random_uuid())
//      user_id (uuid, references profiles.id)
//      subscription (jsonb)
//      created_at (timestamptz, default: now())
//
// 5) لما تحب تبعت إشعار فعلي لمستخدم معين (من أي مكان في الباك إند - مثلاً cron job يومي):
//      import webpush from "web-push";
//      webpush.setVapidDetails("mailto:you@example.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
//      await webpush.sendNotification(subscription, JSON.stringify({ title: "...", body: "..." }));
// ---------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  try {
    // 🔒 الـ user_id بيتاخد من الجلسة، مش من body الطلب.
    // قبل كدا أي حد كان يقدر يبعت userId بتاع حد تاني ويستبدل اشتراكه.
    const { user, supabase, response: authError } = await requireUser("flat");
    if (authError) return authError;

    const body = await req.json().catch(() => null);
    const subscription = body?.subscription;

    if (!subscription || typeof subscription !== "object") {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    // ✅ يحفظ أو يحدّث الاشتراك بتاع المستخدم ده (upsert على user_id)
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: user.id, subscription }, { onConflict: "user_id" });

    if (error) {
      console.error("Failed to save push subscription:", error);
      return NextResponse.json({ error: "فشل حفظ الاشتراك" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("push/subscribe error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}