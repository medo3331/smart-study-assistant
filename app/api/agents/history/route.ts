import { NextResponse } from "next/server";
import { isAiAgentId } from "@/lib/ai/agents";
import { requireUser } from "@/lib/api-guard";

export async function GET(req: Request) {
  const { user, supabase, response: authError } = await requireUser("message");
  if (authError) return authError;

  const agent = new URL(req.url).searchParams.get("agent");
  if (!isAiAgentId(agent)) {
    return NextResponse.json({ error: { message: "نوع الـAgent غير صالح." } }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_agent_generations")
    .select("id, agent, task_type, provider, model, input, output, created_at")
    .eq("user_id", user.id)
    .eq("agent", agent)
    .order("created_at", { ascending: false })
    .limit(20);

  // The feature remains usable before the migration; only persistent history
  // is unavailable, and no database error leaks to the browser.
  if (error) return NextResponse.json({ items: [], persistent: false });
  return NextResponse.json({ items: data ?? [], persistent: true });
}
