import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lectureId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 });
  }
  const { data: lecture, error } = await supabase
    .from("lectures")
    .select("id, suspected_terms, review_decisions, transcript_reviewed_text, review_status, reviewed_at")
    .eq("id", lectureId)
    .eq("user_id", user.id)
    .single();
  if (error || !lecture) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  return NextResponse.json({
    lectureId,
    suspectedTerms: Array.isArray(lecture.suspected_terms) ? lecture.suspected_terms : [],
    reviewDecisions: Array.isArray(lecture.review_decisions) ? lecture.review_decisions : [],
    reviewedText: typeof lecture.transcript_reviewed_text === "string" ? lecture.transcript_reviewed_text : null,
    reviewStatus: lecture.review_status ?? null,
    reviewedAt: lecture.reviewed_at ?? null,
  });
}