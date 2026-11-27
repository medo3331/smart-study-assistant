/**
 * /api/ai/notebook-write — Magic Write: شرح منظم جاهز للكتابة على صفحة النوتبوك.
 *
 * نفس مسار الصلاحيات والحصص والكريديت بتاع باقي مساحات الـ AI: الموديل بيرجّع
 * JSON منظّم (عناوين، نقاط، أمثلة، جداول، مخططات) والمحرّر هو اللي بيعرضه كعناصر
 * حقيقية قابلة للتعديل.
 */
import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels, CURRENT_AI_MODEL } from "@/lib/ai/model-access";
import {
  generateNotebookWrite,
  NOTEBOOK_WRITE_STYLES,
  type NotebookWriteStyle,
} from "@/lib/ai/notebook-writer";

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit(`notebook-write:${user.id}`, 8, 60_000, "message");
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const topic = String(body?.topic ?? "").trim().slice(0, 4000);
    const style: NotebookWriteStyle = NOTEBOOK_WRITE_STYLES.includes(
      body?.style as NotebookWriteStyle,
    )
      ? (body?.style as NotebookWriteStyle)
      : "smart";
    const pageContext = String(body?.pageContext ?? "").slice(0, 2000);
    const level = typeof body?.level === "string" ? body.level.slice(0, 120) : undefined;

    if (topic.length < 3) {
      return NextResponse.json(
        { error: { message: "اكتب الموضوع أو حدّد نصًا على الصفحة الأول (٣ أحرف على الأقل)." } },
        { status: 400 }
      );
    }

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
      accessible[0]?.model ?? CURRENT_AI_MODEL
    );
    if (!guard.ok) return guard.response;

    try {
      const result = await generateNotebookWrite(
        { topic, style, pageContext, level, language: "ar" },
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

      return NextResponse.json(result);
    } catch (e) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      throw e;
    }
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json(
        {
          error: {
            message:
              error.status === 429
                ? "المولّد مشغول حاليًا. حاول تاني بعد شوية."
                : "تعذّر توليد الشرح حاليًا.",
          },
        },
        { status: error.status === 429 ? 429 : 502 }
      );
    }
    console.error("notebook-write error:", error);
    return NextResponse.json(
      { error: { message: (error as Error).message || "حصل خطأ غير متوقع أثناء توليد الشرح." } },
      { status: 500 }
    );
  }
}
