import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { getTrialStatus, hasPaidTranscriptionAccess } from "@/lib/ai/lecture-transcription-access";

export async function GET() {
  const { user, supabase, response: authError } = await requireUser("flat");
  if (authError || !user) return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.is_anonymous) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const paid = await hasPaidTranscriptionAccess(supabase, user.id);
  const trial = await getTrialStatus(supabase, user.id);
  return NextResponse.json({
    paid: paid.allowed,
    trial: { used: trial.used, limit: trial.limit, remaining: trial.remaining },
  });
}
