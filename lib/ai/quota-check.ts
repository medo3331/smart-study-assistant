/**
 * 📊 كوتة الاشتراك — checkSubscriptionQuota (Phase 1.5)
 *
 * الفجوة الأصلية: مفيش أي فحص لكوتة الرسايل في مسارات الـAI — العمود
 * subscription_quotas.messages_24h كان موجود في الداتابيز من غير أي قارئ/كاتب،
 * والحد subscription_plans.messages_per_2h مكانش بيتقرأ في رن تايم خالص.
 *
 * التصميم:
 *   - نافذة التتبع الحالية 24 ساعة (messages_24h + last_reset_at، نفس دلالات
 *     app/api/upload/route.ts). الحد اليومي المكافئ = messages_per_2h × 12.
 *     التقييد الدقيق بنافذة ساعتين محتاج عمود window_start جديد — مؤجل للمرحلة 4
 *     مع توحيد الحدود (موثق في app/admin/settings/page.tsx).
 *   - fail-open لو الجداول مش متنفذة بعد (الشات ميقعش بسبب migration ناقصة) —
 *     قرار availability موثق هنا وفي EPIC_AUDIT_REPORT.md.
 *   - مسارات الأدمن معفية منطقيًا (الأدمن بيقرأ الكوتا مش بيستهلكها).
 *
 * Server-only — بيستخدم service_role (بيتجاوز RLS)، متتصدرش للمتصفح أبدًا.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type QuotaKind = "message" | "upload";

export interface QuotaCheckResult {
  allowed: boolean;
  kind: QuotaKind;
  planKey: string;
  used: number;
  /** -1 = غير معروف (fail-open) */
  limit: number;
  resetAt: string | null;
  reasonAr?: string;
}

const DAY_MS = 24 * 3600 * 1000;
/** كم نافذة ساعتين في اليوم — لاشتقاق الحد اليومي من messages_per_2h. */
const WINDOWS_PER_DAY = 12;

/** Fallbacks لو subscription_plans مش متاحة — نفس seeds db/epic2-admin-rbac-audit-schema.sql:157-161. */
const FALLBACK_MESSAGES_PER_2H: Record<string, number> = { free: 20, pro: 100, ultra: 500 };
const FALLBACK_UPLOADS_DAILY: Record<string, number> = { free: 5, pro: 30, ultra: 60 };

/**
 * فحص + استهلاك كوتة في خطوة واحدة (ذرّي بما تسمح به العمليات المتتالية على
 * نفس السطر — نفس نمط upload route). لو مسموح بيستهلك 1 من الكوتا فورًا.
 */
export async function checkSubscriptionQuota(userId: string, kind: QuotaKind): Promise<QuotaCheckResult> {
  const now = new Date();
  try {
    const privileged = createServiceClient();

    // 1) قراءة الكوتا + lazy reset لنافذة الـ24 ساعة
    const { data: quotaRow, error: quotaErr } = await privileged
      .from("subscription_quotas")
      .select("messages_24h, uploads_today, last_reset_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (quotaErr) throw quotaErr;

    let used = kind === "message" ? (quotaRow?.messages_24h ?? 0) : (quotaRow?.uploads_today ?? 0);
    let resetAt: string | null = quotaRow?.last_reset_at ?? null;
    if (resetAt && now.getTime() - new Date(resetAt).getTime() > DAY_MS) {
      used = 0;
      resetAt = now.toISOString();
      await privileged.from("subscription_quotas").update({
        messages_24h: 0,
        uploads_today: 0,
        last_reset_at: resetAt,
        updated_at: resetAt,
      }).eq("user_id", userId);
    }

    // 2) باقة المستخدم من entitlements (نفس منطق upload route — القيمة الخام أو free)
    const { data: ent } = await privileged
      .from("entitlements")
      .select("value")
      .eq("user_id", userId)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planKey = typeof ent?.value === "string" && ent.value ? ent.value : "free";

    // 3) الحدود من subscription_plans، مع fallback مطابق للـseeds لو الجدول مش متاح
    const { data: planRow } = await privileged
      .from("subscription_plans")
      .select("messages_per_2h, uploads_daily")
      .eq("plan_key", planKey)
      .maybeSingle();

    let limit: number;
    if (kind === "message") {
      const per2h = typeof planRow?.messages_per_2h === "number"
        ? planRow.messages_per_2h
        : (FALLBACK_MESSAGES_PER_2H[planKey] ?? FALLBACK_MESSAGES_PER_2H.free);
      limit = per2h * WINDOWS_PER_DAY; // حد يومي مكافئ — قرار موثق أعلى الملف
    } else {
      limit = typeof planRow?.uploads_daily === "number"
        ? planRow.uploads_daily
        : (FALLBACK_UPLOADS_DAILY[planKey] ?? FALLBACK_UPLOADS_DAILY.free);
    }

    // 4) فرض الحد
    if (used >= limit) {
      return {
        allowed: false,
        kind,
        planKey,
        used,
        limit,
        resetAt,
        reasonAr: kind === "message"
          ? `وصلت لحد رسايل باقتك (${limit} رسالة/يوم). الكوتا بتتجدد كل 24 ساعة، أو رقّي باقتك لحد أعلى.`
          : `وصلت لحد الرفع اليومي لباقتك (${limit} ملفات).`,
      };
    }

    // 5) استهلاك 1 من الكوتا (upsert على user_id)
    const nextMessages = kind === "message" ? used + 1 : (quotaRow?.messages_24h ?? 0);
    const nextUploads = kind === "upload" ? used + 1 : (quotaRow?.uploads_today ?? 0);
    await privileged.from("subscription_quotas").upsert({
      user_id: userId,
      plan_key: planKey,
      messages_24h: nextMessages,
      uploads_today: nextUploads,
      last_reset_at: resetAt ?? now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });

    return { allowed: true, kind, planKey, used: used + 1, limit, resetAt };
  } catch (e) {
    // fail-open موثق: لو جداول الكوتا مش متنفذة بعد، الشات/الرفع ميقعوش.
    console.warn("[quota-check] subscription quota unavailable — allowing (fail-open, documented):", e);
    return { allowed: true, kind, planKey: "unknown", used: 0, limit: -1, resetAt: null };
  }
}
