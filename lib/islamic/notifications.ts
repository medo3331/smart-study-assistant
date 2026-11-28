/* ==========================================================================
   إشعارات مركز العبادات (تذكير الصلاة + الأذان + الأذكار + الورد)
   طبقة رقيقة فوق Notification API مع تخزين المفتاح المُطلق لكل يوم
   عشان التكرار متحصلش. التذكير الواحد بيوصّل قناتين:
   • إشعار المتصفح على الجهاز — لو الإذن granted (شغال طوال فتح الموقع).
   • إشعار داخل المنصة (الجرس + /notifications) — دايمًا للحساب الحقيقي.
   Web Push في الخلفية محتاج service worker + VAPID وموضوع منفصل.
   ========================================================================== */

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** إرسال إشعار — صامت لو الإذن مش متاح أو الصفحة في الخلفية النظري مش مدعومة. */
export function sendWorshipNotification(title: string, body: string): void {
  if (getNotificationPermission() !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag: `magicly-worship-${title}`,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* بعض المتصفحات بتمنع new Notification خارج SW — تجاهل بهدوء */
  }
}

/** بيانات إشعار المنصة المصاحب للتذكير — نفس العنوان والنص + لينك الصفحة. */
export interface WorshipReminderInboxPayload {
  title: string;
  body: string;
  link: string;
}

/**
 * إدراج التذكير في صندوق إشعارات المنصة (جدول notifications) — بجانب
 * إشعار المتصفح مش بداله. الإدراج بيحصل سيرفريًا عبر /api/worship/reminders
 * (جدول notifications مفيش عليه سياسة INSERT للعملاء — كل الكتابة في
 * المشروع سيرفرية عبر service client)، والنداء fire-and-forget وصامت:
 * أي فشل (جلسة منتهية/سكيما ناقصة/شبكة) مبيأثرش على إشعار المتصفح.
 */
export async function insertWorshipReminderNotification(
  payload: WorshipReminderInboxPayload,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/worship/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* صامت — إشعار المتصفح هو الخط الأساسي */
  }
}

const FIRED_KEY_PREFIX = "magicly-worship-fired-";

function firedStorageKey(day: string): string {
  return `${FIRED_KEY_PREFIX}${day}`;
}

/** مفاتيح التذكيرات اللي اشتغلت بالفعل في اليوم ده. */
export function readFiredKeys(day: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(firedStorageKey(day));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function markFiredKey(day: string, key: string): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Array.from(readFiredKeys(day));
    if (!keys.includes(key)) keys.push(key);
    window.localStorage.setItem(firedStorageKey(day), JSON.stringify(keys));
  } catch {
    /* تجاهل */
  }
}

/** تنظيف مفاتيح الأيام القديمة (أقدم من 3 أيام). */
export function pruneFiredKeys(): void {
  if (typeof window === "undefined") return;
  try {
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(FIRED_KEY_PREFIX)) {
        const day = key.slice(FIRED_KEY_PREFIX.length);
        if (isNaN(Date.parse(day)) || Date.parse(day) < cutoff) {
          window.localStorage.removeItem(key);
        }
      }
    }
  } catch {
    /* تجاهل */
  }
}
