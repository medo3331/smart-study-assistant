// ============================================================================
// MAGICLY — Support Event Ingestion (Phase 1)
// ============================================================================
// واجهة وصول واحدة للدعم: استقبال أحداث الطالب والإدارة ويقوم بمعالجتها
// من خلال مسار Workflow (AI Support Orchestrator).
//
// الخواص الأمنية:
//   - التحقق من الهوية (Authentication) مطلوب دائماً.
//   - لا توجد معرّفات محتملة أو بيانات دفع في استجابات التسجيل (logs).
//   - لا يتم تسجيل معرف طالب آخر في السجل أو في أي استجابة للعميل.
//   - لا يتم استجابة محادثات طالب مع طالب (خاصة توسط).
//   - لا يتم إرسال تأكيد أو رد لرسائل AI (لا تفاعل مزدوج).
//   - تسجيل الدخول بحيد مصفوفة من المستخدمين الآخرين ولا يعرض بيانات خصوصية.
// ============================================================================

import { NextResponse } from "next/server";
import { processSupportEvent, isEventEligibleForSupport } from "@/lib/ai/support-orchestrator";
import { sanitizeInput, sanitizeErrorMessage } from "@/lib/ai/support-sanitization";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/support/events — استقبال حدث دعم أصلي
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // 1. الهوية
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    // 2. التحقق من المحتوى
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    const {
      eventSource,               // "support_message" | "admin_message" | "support_reply" | "admin_reply"
      messageText,
      externalEventId,           // معرف خارجي حدد (مثلاً: ID في تذكرة)
      ticketId,
      conversationId,
      relatedUserIds,
      implicitRef,
      role,
    } = body as {
      eventSource: string;
      messageText: string;
      externalEventId?: string;
      ticketId?: string;
      conversationId?: string;
      relatedUserIds?: string[];
      implicitRef?: string;
      role?: string;
    };

    // 2.1 التحقق من البيانات الأساسية
    if (!eventSource || typeof eventSource !== "string") {
      return NextResponse.json(
        { success: false, error: "eventSource is required and must be a string." },
        { status: 400 }
      );
    }

    if (!messageText || typeof messageText !== "string" || messageText.trim().length < 1) {
      return NextResponse.json(
        { success: false, error: "messageText is required and must be non-empty." },
        { status: 400 }
      );
    }

    const sanitizedMessage = String(sanitizeInput(messageText) ?? "");

    // 2.2 تحديد هوية الاستقبال (support_message vs admin_message)
    // إذا لم يُعطِ مستلم أصلي، نستنتج من قائمة المشاركين الخاصة بنا
    let recipientId: string | null = null;
    if (relatedUserIds && Array.isArray(relatedUserIds)) {
      const others = relatedUserIds.filter((id) => id !== user.id);
      if (others.length > 0) {
        recipientId = others[0];
      }
    }

    // 2.3 فحص الأهلية لاستقبال الحدث
    const isEligible = await isEventEligibleForSupport(
      eventSource as any,
      user.id,
      relatedUserIds ?? [],
      recipientId,
      conversationId
    );

    if (!isEligible) {
      return NextResponse.json({
        success: false,
        error: "This message is not eligible for AI support processing.",
      }, { status: 403 });
    }

    // 3. معالجة الحدث عبر Orchestrator
    const result = await processSupportEvent({
      eventSource: eventSource as any,
      externalEventId: externalEventId ?? "",
      messageText: sanitizedMessage,
      userId: user.id,
      relatedUserIds: relatedUserIds ?? [user.id],
      implicitRef: implicitRef ?? undefined,
      role: (role === "admin" || role === "student") ? role : (recipientId ? "student" : "admin"),
    });

    // 4. إرجاع نتيجة التفكيك (موجز، لا بيانات حساسة)
    return NextResponse.json({
      success: true,
      outcome: result.outcome,
      acknowledgement: result.acknowledgement,
      caseId: result.caseId,
      runId: result.runId,
      note: result.note,
    }, { status: 202 });
  } catch (error) {
    const sanitizedError = sanitizeErrorMessage(error);
    console.error("[support/events] POST", sanitizedError);
    return NextResponse.json(
      { success: false, error: "Unexpected error." },
      { status: 500 }
    );
  }
}
