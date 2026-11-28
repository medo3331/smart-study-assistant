// ===========================================================================
// MAGICLY — Community C16: فرض قواعد المحتوى تلقائيًا
// ---------------------------------------------------------------------------
// لما منشور أو رسالة يتعكسوا على قائمة الكلمات الممنوعة أو فحص الـAI:
//   ١) تسجيل الحادثة في سجل الإشراف (logBlockedContent)
//   ٢) رسالة تحذير فورية لصاحب المحتوى (notification نوع warning)
//   ٣) تقييد تلقائي حسب نوع الإساءة (mod_issue_action عبر service client)
// fail-open: أي فشل في التقييد مش بيمنع رفض المحتوى نفسه.
// ===========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// درجة الخطورة → أيام التقييد (null = تحذير فقط)
const SEVERITY: Record<string, { days: number | null; label: string }> = {
  threat: { days: 7, label: "تهديد أو عنف" },
  hate: { days: 5, label: "خطاب كراهية" },
  harassment: { days: 3, label: "تحرّش أو مضايقة" },
  doxxing: { days: 5, label: "نشر بيانات شخصية" },
  impersonation: { days: 3, label: "انتحال شخصية" },
  illegal: { days: 7, label: "محتوى غير قانوني" },
  bullying: { days: 2, label: "تنمّر أو إهانة" },
  spam: { days: 1, label: "سبام أو إعلانات مزعجة" },
  blocked_word: { days: 1, label: "عبارة مسيئة" },
  other: { days: 1, label: "مخالفة لقواعد المجتمع" },
};

export async function enforceContentViolation(
  userId: string,
  contentType: "post" | "comment" | "message",
  text: string,
  category?: string,
): Promise<void> {
  const severity = SEVERITY[category ?? "other"] ?? SEVERITY.other;

  try {
    // ١) تسجيل في سجل الإشراف
    const { logBlockedContent } = await import("@/lib/community/moderation");
    void logBlockedContent(userId, contentType, text, category);

    // ٢) رسالة تحذير فورية
    const { socialNotify } = await import("@/lib/community/handlers");
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const service = createServiceClient();

    await socialNotify(
      service,
      userId,
      `⚠️ تحذير من قواعد المجتمع — ${severity.label}`,
      contentType === "message"
        ? "الرسالة اللي بعتها تحتوي محتوى مخالف فماوصلتش. تكرار المخالفة هيوصل لتقييد حسابك."
        : "المحتوى اللي نشرته مخالف لقواعد المجتمع فما نشرش. تكرار المخالفة هيوصل لتقييد حسابك.",
      contentType === "message" ? "/inbox" : "/community",
    );

    // ٣) تقييد تلقائي حسب الخطورة — عبر مسار العقوبات الرسمي (بيسجّل في
    //    moderation_actions وبيظبط profiles.restriction_until)
    if (severity.days && severity.days > 0) {
      const { error } = await (service as SupabaseClient).rpc("mod_issue_action", {
        p_user_id: userId,
        p_action_type: "restrict",
        p_reason: `فرض تلقائي — ${severity.label} (${contentType})`,
        p_days: severity.days,
        p_report_id: null,
      });
      if (error) {
        console.error("[content-enforcement] auto-restrict failed:", error);
      } else {
        await socialNotify(
          service,
          userId,
          "⛔ حسابك اتقيّد مؤقتًا",
          `التقييد ${severity.days} يوم بسبب ${severity.label}. تقدر تعترض من لوحة الاعتراضات في المجتمع.`,
          "/community/moderation",
        );
      }
    }
  } catch (e) {
    // fail-open: رفض المحتوى حصل بالفعل عند المتصل — هنا بس بيسجل
    console.error("[content-enforcement]", e);
  }
}
