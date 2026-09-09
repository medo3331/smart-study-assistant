import { NextRequest, NextResponse } from "next/server";
import { getLessonVideoCandidates, LessonVideoContext } from "@/lib/lesson/video-server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<LessonVideoContext>;
    const ctx: LessonVideoContext = {
      country: body.country,
      stage: body.stage,
      grade: body.grade,
      track: body.track,
      faculty: body.faculty,
      curriculum: body.curriculum,
      subject: body.subject,
      unit: body.unit,
      chapter: body.chapter,
      lesson: body.lesson,
      topic: body.topic,
      language: body.language || "arabic",
    };
    const result = await getLessonVideoCandidates(ctx);
    return NextResponse.json({
      ok: true,
      candidates: result.candidates,
      count: result.candidates.length,
      error: result.error,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, candidates: [], count: 0, error: msg }, { status: 500 });
  }
}
