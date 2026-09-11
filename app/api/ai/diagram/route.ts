/**
 * /api/ai/diagram — توليد المخططات والخرائط الذهنية (Mermaid)
 *
 * بيولّد كود Mermaid عبر نموذج اللغة (نفس راوتر الشات) ويرجّعه للكلاينت،
 * والعرض بيتم في المتصفح بمكتبة mermaid — من غير أي API خارجي للرسم.
 */
import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";
import {
  generateDiagram,
  diagramTypesForSubject,
  type DiagramType,
} from "@/lib/ai/diagram-generator";
import {
  peekServiceQuota,
  consumeServiceQuota,
  refundServiceQuota,
} from "@/lib/ai/service-registry";

const VALID_TYPES: DiagramType[] = [
  "mindmap",
  "flowchart",
  "timeline",
  "classDiagram",
  "sequence",
  "pie",
  "gantt",
  "graph",
];
const VALID_DETAILS = ["simple", "medium", "detailed"] as const;

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = checkRateLimit(`diagram:${user.id}`, 5, 60_000, "message");
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const topic = String(body?.topic ?? "").trim().slice(0, 300);
    const type = VALID_TYPES.includes(body?.type as DiagramType)
      ? (body?.type as DiagramType)
      : "mindmap";
    const subject = typeof body?.subject === "string" ? body.subject.slice(0, 120) : undefined;
    const stage = typeof body?.stage === "string" ? body.stage.slice(0, 40) : undefined;
    const detail = VALID_DETAILS.includes(body?.detail as (typeof VALID_DETAILS)[number])
      ? (body?.detail as (typeof VALID_DETAILS)[number])
      : "medium";

    if (topic.length < 3) {
      return NextResponse.json(
        { error: { message: "اكتب موضوع المخطط (٣ أحرف على الأقل)." } },
        { status: 400 }
      );
    }

    // فحص حد الخدمة اليومي حسب الباقة (بدون خصم — الخصم بعد قبول الحجز)
    const peek = await peekServiceQuota(supabase, user.id, "diagram");
    if (peek.limit <= 0 || peek.used >= peek.limit) {
      const reasonAr =
        peek.limit <= 0
          ? "توليد المخططات غير متاح في باقتك الحالية."
          : `وصلت للحد اليومي من توليد المخططات (${peek.limit}). بيتجدد الحد يوميًا بتوقيت UTC.`;
      return NextResponse.json(
        { error: { message: reasonAr, code: "QUOTA_EXCEEDED", tier: peek.tier } },
        { status: 402 }
      );
    }

    // حجز رصيد نصي (1 طلب = 1 كريدت) — نفس نمط راوتات التوليد التانية
    const candidates = routeCandidates("chat");
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", {
        p_user_id: user.id,
        p_kind: k,
        p_value: v,
      });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json(
        { error: { message: "هذه المهمة تتطلب صلاحية. اشترِها من المتجر.", code: "MODEL_ACCESS_REQUIRED" } },
        { status: 403 }
      );
    }
    const guard = await guardAiAccessAndReserve(
      supabase,
      user.id,
      accessible[0]?.model ?? "openai/gpt-oss-120b"
    );
    if (!guard.ok) return guard.response;

    // الخصم الفعلي لحد المخططات — بعد ما الحجز اتقبل
    const quota = await consumeServiceQuota(supabase, user.id, "diagram");
    if (!quota.allowed) {
      // حالة حدّية نادرة (اتخصم بين الفحص والخصم) — نرجّع الكريدت ونرفض
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      return NextResponse.json(
        { error: { message: quota.reasonAr, code: "QUOTA_EXCEEDED", tier: quota.tier } },
        { status: 402 }
      );
    }

    try {
      const result = await generateDiagram(
        { topic, type, subject, stage, detail, language: "ar" },
        async (messages) => {
          const completion = await aiRouter.completeChat("chat", {
            messages: messages.map((m) => ({ role: m.role as "system" | "user", content: m.content })),
            temperature: 0.3,
          });
          void recordAiOperation(supabase, {
            userId: user.id,
            provider: completion.provider,
            model: completion.model,
            taskType: "chat",
            status: "completed",
            usage: completion.usage,
            contentLength: completion.content.length,
          });
          return completion?.content || "";
        }
      );

      return NextResponse.json({
        ...result,
        suggestedTypes: diagramTypesForSubject(subject),
        quota: { remaining: quota.remaining, limit: quota.limit },
      });
    } catch (e) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      refundServiceQuota(user.id, "diagram");
      throw e;
    }
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json(
        {
          error: {
            message:
              error.status === 429
                ? "مولّد المخططات مشغول حاليًا. حاول تاني بعد شوية."
                : "تعذّر توليد المخطط حاليًا.",
          },
        },
        { status: error.status === 429 ? 429 : 502 }
      );
    }
    console.error("diagram error:", error);
    return NextResponse.json(
      { error: { message: (error as Error).message || "حصل خطأ غير متوقع أثناء توليد المخطط." } },
      { status: 500 }
    );
  }
}
