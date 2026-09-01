import { NextResponse } from "next/server";
import { buildAgentPrompt, parseAgentGenerationInput, taskForAgent } from "@/lib/ai/agents";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = checkRateLimit(`agent:${user.id}`, 8, 60_000, "message");
    if (limited) return limited;

    const input = parseAgentGenerationInput(await req.json().catch(() => null));
    if (!input) {
      return NextResponse.json({ error: { message: "بيانات الطلب ناقصة أو غير صالحة." } }, { status: 400 });
    }

    const prompt = buildAgentPrompt(input);
    const taskType = taskForAgent(input);
    // Phase H: entitlement filter + credit reserve (1 credit per request, 403 before reserve)
    const candidates = routeCandidates(taskType);
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: k, p_value: v });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json({ error: { message: "هذه المهمة تتطلب صلاحية. اشترِها من المتجر.", code: "MODEL_ACCESS_REQUIRED" } }, { status: 403 });
    }
    const guard = await guardAiAccessAndReserve(supabase, user.id, accessible[0]?.model ?? "openai/gpt-oss-120b");
    if (!guard.ok) return guard.response;

    let completion;
    try {
      completion = await aiRouter.completeChat(taskType, {
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: input.agent === "research" ? 0.25 : 0.65,
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      if (!(error instanceof AiProviderError)) throw error;
      const status = error.status === 429 ? 429 : error.status === 503 ? 503 : 502;
      return NextResponse.json(
        { error: { message: status === 429 ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية." : "حصل خطأ أثناء تنفيذ المهمة. حاول تاني." } },
        { status }
      );
    }

    // History is best-effort while the project transitions to the migration.
    let generationId: string | undefined;
    const { data: saved, error: saveError } = await supabase
      .from("ai_agent_generations")
      .insert({
        user_id: user.id,
        agent: input.agent,
        task_type: taskType,
        provider: completion.provider,
        model: completion.model,
        input: input,
        output: completion.content.slice(0, 20_000),
        status: "completed",
      })
      .select("id")
      .maybeSingle();
    if (saveError) console.warn("agents: history could not be saved", saveError.message);
    else generationId = saved?.id;
    void recordAiOperation(supabase, { userId: user.id, provider: completion.provider, model: completion.model, taskType, status: "completed", usage: completion.usage, contentLength: completion.content.length });

    return NextResponse.json({
      result: completion.content,
      provider: completion.provider,
      taskType,
      generationId,
    });
  } catch (error) {
    console.error("agents/generate error:", error);
    return NextResponse.json({ error: { message: "حصل خطأ غير متوقع أثناء تنفيذ المهمة." } }, { status: 500 });
  }
}
