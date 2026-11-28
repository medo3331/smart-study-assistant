import { NextRequest, NextResponse } from "next/server";
import { getLessonVideoCandidates, searchLessonVideosByQuery, LessonVideoContext } from "@/lib/lesson/video-server";

/**
 * فيديو الدرس — مسارين (P2 مطلب 3):
 *  • بدون `query`: اقتراحات الـ AI الواعية بالسياق (موضوع الدرس + المادة +
 *    stage/grade/track/faculty) — بتعدي على بوابة الصلة قبل العرض.
 *  • بـ `query`: كلمات البحث اللي كتبها الطالب بنفسه — بتتبعت كما هي
 *    (فلترة الفوضى بس، من غير بوابة الصلة — الطالب هو المرجع).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<LessonVideoContext> & { query?: string };
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

    const manualQuery = typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";
    const result = manualQuery
      ? await searchLessonVideosByQuery(manualQuery, ctx)
      : await getLessonVideoCandidates(ctx);

    return NextResponse.json({
      ok: true,
      manual: Boolean(manualQuery),
      candidates: result.candidates,
      count: result.candidates.length,
      error: result.error,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, candidates: [], count: 0, error: msg }, { status: 500 });
  }
}
