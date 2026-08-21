import { NextResponse } from "next/server";
import { buildAgentPrompt, parseAgentGenerationInput, taskForAgent } from "@/lib/ai/agents";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, requireUser } from "@/lib/api-guard";

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
