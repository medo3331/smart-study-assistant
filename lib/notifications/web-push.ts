import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/admin";

/* محرك إرسال إشعارات الـ Web Push من السيرفر.
   Server-only — ممنوع الاستيراد في Client Components (بيستخدم service key).

   ملاحظتين عن التصميم:
   ١) تهيئة VAPID كسولة (lazy): الاستيراد نفسه مابيضربش لو المفاتيح ناقصة،
      والإرسال بس هو اللي بيرجع خطأ واضح. ده عشان صفحة نسيت تضيف المفاتيح
      في Vercel ماتكسرش البيلد كله — Push بس هو اللي بيقف برسالة مفهومة.
   ٢) الكتابة على الجدول بـ service client (بيتجاوز RLS) لأن الإرسال المجدول
      (cron) بيحصل من غير جلسة مستخدم أصلاً. */

export interface PushPayload {
  title: string;
  body: string;
  /** المسار اللي بيتفتح لما المستخدم يدوس على الإشعار. */
  url?: string;
  icon?: string;
}

export interface PushSendResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  /** سبب الفشل العام (مفاتيح ناقصة، مافيش اشتراكات...) — للعرض والتشخيص. */
  reason?: string;
}

let vapidReady = false;

function ensureVapid(): string | null {
  if (vapidReady) return null;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@magiclly.com";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return "مفاتيح الـ VAPID مش متظبطة على السيرفر (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).";
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return null;
}

/** إرسال إشعار لكل أجهزة مستخدم واحد النشطة. */
export async function sendNotificationToUser(
  userId: string,
  payload: PushPayload
): Promise<PushSendResult> {
  const configError = ensureVapid();
  if (configError) {
    return { success: false, sentCount: 0, failedCount: 0, reason: configError };
  }

  const supabase = createServiceClient();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    console.error("[web-push] failed to load subscriptions:", error);
    return { success: false, sentCount: 0, failedCount: 0, reason: "فشل تحميل الاشتراكات." };
  }
  if (!subscriptions || subscriptions.length === 0) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      reason: "مافيش أجهزة مشتركة — فعّل الإشعارات من المتصفح الأول.",
    };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/dashboard",
    icon: payload.icon || "/icon-192.png",
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          // الإشعار الدراسي وقتي (ميعاد مذاكرة/ستريك) — لو الجهاز أوفلاين
          // أكتر من يوم، وصوله متأخراً أسوأ من عدم وصوله.
          { TTL: 24 * 60 * 60 }
        );
      } catch (err: unknown) {
        // 410 Gone / 404 = الاشتراك مات (المستخدم مسح التطبيق أو سحب الإذن).
        // نعطّله عشان مانحاولش نبعتله كل مرة على الفاضي.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", sub.id);
        }
        throw err;
      }
    })
  );

  const sentCount = results.filter((r) => r.status === "fulfilled").length;
  return {
    success: sentCount > 0,
    sentCount,
    failedCount: results.length - sentCount,
  };
}
