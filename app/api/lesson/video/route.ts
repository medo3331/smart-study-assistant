import { NextRequest, NextResponse } from "next/server";
import { getLessonVideoCandidates, LessonVideoContext } from "@/lib/lesson/video-server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<LessonVideoContext>;
    const ctx: LessonVideoContext = {
      country: body.country,
      stage: body.stage,
      grade: body.grade,
      curriculum: body.curriculum,
      subject: body.subject,
      unit: body.unit,
      chapter: body.chapter,
      lesson: body.lesson,
      topic: body.topic,
    };
    const candidates = await getLessonVideoCandidates(ctx);
    return NextResponse.json({ candidates, ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
