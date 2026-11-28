import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  isNotificationsSchemaMissing,
  NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,
} from "@/lib/notifications/schema";

/**
 * إشعارات المنصة لتذكيرات مركز العبادات — POST /api/worship/reminders
 *
 * WorshipReminders (كل ٢٠ ثانية) بيطلق تذكيرًا فعليًا (صلاة/أذان/أذكار/ورد)
 * وبيبعت لنا العنوان والنص ولينك الصفحة — بندرجه في جدول notifications
 * ليظهر في الجرس وصفحة /notifications.
 *
 * قواعد الأمان (نفس قواعد app/api/notifications):
 *   1. هوية المستلم من الجلسة (createClient) — مش من جسم الطلب أبدًا.
 *   2. ممنوع الإدراج للحساب الزائر (is_anonymous) — زي شرط مكافآت العبادة.
 *   3. الإدراج عبر service client لأن جدول notifications مفيش عليه
 *      سياسة INSERT للعملاء (كل كتابات الإشعارات في المشروع سيرفرية).
 *   4. منع التكرار: التذكير الواحد مرة واحدة في اليوم — فحص (recipient + title + اليوم) قبل الإدراج
 *      بجانب حارس localStorage في الكلاينت (بعد markFiredKey).
 *   5. لو سكيما الإشعارات مش موجودة — 503 schemaMissing والكلاينت يتعامل معاها بهدوء.
 */

/** نوع الإشعار — من الأنواع المسموحة في قيد notifications_type_check (db/101). */
const WORSHIP_REMINDER_TYPE = "feature";

const MAX_TEXT_LENGTH = 200;
const MAX_LINK_LENGTH = 300;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 },
      );
    }

    // المستخدم الزائر — إشعارات المنصة مش ليه (نفس شرط مكافآت العبادة).
    if (user.is_anonymous) {
      return NextResponse.json({ success: true, skipped: "anonymous" });
    }

    const body = (await req.json().catch(() => null)) as {
      title?: unknown;
      body?: unknown;
      link?: unknown;
    } | null;
    const title = cleanText(body?.title, MAX_TEXT_LENGTH);
    const message = cleanText(body?.body, MAX_TEXT_LENGTH);
    const link = cleanText(body?.link, MAX_LINK_LENGTH);
    if (!title || !message || !link) {
      return NextResponse.json(
        { success: false, error: "Invalid payload." },
        { status: 400 },
      );
    }

    const service = createServiceClient();

    // منع التكرار: نفس التذكير (العنوان) مرة واحدة في يوم UTC واحد لهذا المستخدم —
    // حارس تاني بجانب مفاتيح localStorage (لو الجهازين فتحوا نفس الحساب مثلًا).
    const dayStart = new Date().toISOString().slice(0, 10);
    const { data: existing, error: existingError } = await service
      .from("notifications")
      .select("id")
      .eq("recipient_id", user.id)
      .eq("title", title)
      .gte("created_at", `${dayStart}T00:00:00.000Z`)
      .limit(1);
    if (existingError) {
      if (isNotificationsSchemaMissing(existingError)) {
        return NextResponse.json(
          {
            success: false,
            error: NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,
            schemaMissing: true,
          },
          { status: 503 },
        );
      }
      console.error("[worship/reminders] dedupe check", existingError.message);
      // فحص التكرار فشل لسبب غير السكيما — نكمل للإدراج احتياطيًا بدل إسقاط التذكير.
    } else if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    // صف إشعار المنصة — نفس شكل صفوف النظام (community/admin): recipient_id + title + body + link_url
    const { error: insertError } = await service.from("notifications").insert({
      recipient_id: user.id,
      type: WORSHIP_REMINDER_TYPE,
      title,
      body: message,
      link_url: link,
    });
    if (insertError) {
      if (isNotificationsSchemaMissing(insertError)) {
        return NextResponse.json(
          {
            success: false,
            error: NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,
            schemaMissing: true,
          },
          { status: 503 },
        );
      }
      console.error("[worship/reminders] insert", insertError.message);
      return NextResponse.json(
        { success: false, error: "Failed to insert." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[worship/reminders] POST", e);
    return NextResponse.json(
      { success: false, error: "Unexpected error." },
      { status: 500 },
    );
  }
}
