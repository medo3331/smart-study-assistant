// ============================================================================
// MAGICLY — Immediate Acknowledgement (Phase 1)
// ============================================================================
// واجهة لاستقبال طلب للدعم وتسليم الرد الفوري الثابت.
// الخواص المقصودة:
//   - التحقق من الهوية (Authentication) مطلوب دائماً.
//   - الرد الفوري لا ينتظر أي مرحلة ذكاء اصطناعي (deterministic).
//   - لا يُسجّل أي بيانات حساسة (لا كلمات سر، لا تفاصيل الدفع).
//   - لا تعرض أي هوية أو بيانات خاصة لمستخدم آخر.
// ============================================================================

import { NextResponse } from "next/server";
import { getAcknowledgeMessage } from "@/lib/ai/support-acknowledgement";
import { sanitizeErrorMessage } from "@/lib/ai/support-sanitization";

// نسخة من قالب الرد المحدد في المواصفات
const ACKNOWLEDGEMENT_TEMPLATE =
  "أهلًا بك في Magicly 👋 تم استلام رسالتك بنجاح. مساعد Magicly الذكي بدأ مراجعة المشكلة وتحديد سببها، وسنحاول مساعدتك في حلها فورًا. وإذا احتاجت تدخلًا من فريق الدعم، سيتم تحويلها للموظف المختص.";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/support/acknowledge — تسليم الرد التأكيد الفوري
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

    // 2. استقبال طلب التأكيد
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    const { ticketId, conversationId, messageId, source } = body as {
      ticketId?: string;
      conversationId?: string;
      messageId?: string;
      source?: string;
    };

    // التحقق أن العنصر مُلَخَّص وتحت سيطرة المستخدم (من حيث المعرف الفني)
    const sanitizedTicket = ticketId?.replace(/[^\w\-]/g, "") ?? null;
    const sanitizedConversation = conversationId?.replace(/[^\w\-]/g, "") ?? null;
    const sanitizedMessage = messageId?.replace(/[^\w\-]/g, "") ?? null;

    // 3. الحصول على نص الرد الثابت
    const acknowledgement = getAcknowledgeMessage(ACKNOWLEDGEMENT_TEMPLATE);
    if (!acknowledgement) {
      return NextResponse.json(
        { success: false, error: "Failed to generate acknowledgement." },
        { status: 500 }
      );
    }

    // 4. إرجاع الرد الفوري (مصمم لكي يتم عرضه فوراً بواسطة واجهة العميل)
    return NextResponse.json({
      success: true,
      acknowledgement,
      source: "ai_support",
      meta: {
        source: source ?? "unknown",
        ticketId: sanitizedTicket ?? null,
        conversationId: sanitizedConversation ?? null,
        messageId: sanitizedMessage ?? null,
      },
    }, { status: 200 });
  } catch (error) {
    const sanitizedError = sanitizeErrorMessage(error);
    console.error("[support/acknowledge] POST", sanitizedError);
    return NextResponse.json(
      { success: false, error: "Unexpected error." },
      { status: 500 }
    );
  }
}
