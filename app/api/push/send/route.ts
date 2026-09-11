import { NextRequest, NextResponse } from "next/server";
import { requireUser, checkRateLimit } from "@/lib/api-guard";
import { sendNotificationToUser } from "@/lib/notifications/web-push";

/* إرسال إشعار تجريبي لنفس المستخدم (لأجهزته المشتركة كلها).
   يستخدمه زرار "جرّب الإشعارات" في الداشبورد، وأي إشعار مجدول مستقبلاً
   (ستريك/مواعيد) هينادي نفس المحرك sendNotificationToUser من cron.

   الـ rate limit هنا ضد الضغط المتكرر على الزرار، مش حماية فواتير —
   الإرسال نفسه مجاني (Web Push عبر VAPID). */

const MAX_TITLE = 80;
const MAX_BODY = 240;

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export async function POST(req: NextRequest) {
  try {
    const { user, response: authError } = await requireUser("flat");
    if (authError) return authError;

    const limited = checkRateLimit(`push-send:${user.id}`, 5, 60_000, "flat");
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as {
      title?: unknown;
      body?: unknown;
      url?: unknown;
    } | null;

    let url = "/dashboard";
    if (typeof body?.url === "string" && body.url.startsWith("/") && !body.url.startsWith("//")) {
      url = body.url.slice(0, 200);
    }

    const result = await sendNotificationToUser(user.id, {
      title: clampText(body?.title, MAX_TITLE) || "تنبيه من ماجيكلي 🧙‍♂️",
      body:
        clampText(body?.body, MAX_BODY) ||
        "وقت مراجعة مادتك المفضلة! يلا نكمل رحلة التفوق 🚀",
      url,
    });

    // 200 حتى لو sentCount=0 — الـ reason بيوضح السبب للواجهة
    // (مافيش أجهزة / مفاتيح ناقصة) من غير ما يبان كـ server error.
    return NextResponse.json(result);
  } catch (err) {
    console.error("push/send error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
