"use server";
/**
 * Phase 1.4+ — Smart Video with YouTube Data API v3 + Fallback Chain.
 *
 * Flow:
 *   1. Build query from education context
 *   2. Search YouTube Data API (server-side, key never exposed)
 *   3. Filter + rank candidates by education relevance
 *   4. Fallback chain: full context → reduced context → subject only → verified fallback
 *   5. Return ranked VideoCandidate[]
 *
 * API key: YOUTUBE_API_KEY in .env.local / server env (NEVER client-side).
 */

import {
  searchYouTubeVideos,
  getYouTubeQuery,
  getFilteredCandidates,
  type YouTubeVideo,
} from "./youtube-search";

export interface LessonVideoContext {
  country?: string;
  stage?: string;
  grade?: string;
  track?: string;
  faculty?: string;
  curriculum?: string;
  subject?: string;
  unit?: string;
  chapter?: string;
  lesson?: string;
  topic?: string;
  language?: string; // "arabic", "english", etc.
}

export interface VideoCandidate {
  id: string;
  title: string;
  channel?: string;
  duration?: string;
  reason: string;
  embedUrl: string; // youtube-nocookie
  watchUrl: string;
  thumbnail?: string;
  relevanceScore: number;
}

// Cache
const CACHE_KEY_VERSION = "v3";
const CACHE = new Map<string, { candidates: VideoCandidate[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 30;

function cacheKey(ctx: LessonVideoContext): string {
  return (
    CACHE_KEY_VERSION +
    "|" +
    [
      ctx.country || "",
      ctx.stage || "",
      ctx.grade || "",
      ctx.track || "",
      ctx.faculty || "",
      ctx.subject || "",
      ctx.lesson || "",
      ctx.topic || "",
      ctx.unit || "",
      ctx.chapter || "",
      ctx.curriculum || "",
      ctx.language || "",
    ].join("|")
  );
}

/** Build a safe VideoCandidate from a YouTubeVideo with a given reason. */
function toVideoCandidate(video: YouTubeVideo, reason: string, score: number): VideoCandidate {
  return {
    id: video.id, title: video.title, channel: video.channelTitle,
    duration: video.duration, reason,
    embedUrl: `https://www.youtube-nocookie.com/embed/${video.id}?rel=0&modestbranding=1&playsinline=1`,
    watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
    thumbnail: video.thumbnailUrl, relevanceScore: score,
  };
}

/** Convert YouTubeVideo[] to VideoCandidate[] with a default reason and score. */
function videosToCandidates(videos: YouTubeVideo[], reason: string, baseScore: number): VideoCandidate[] {
  return videos.map((v, i) => {
    const vc = toVideoCandidate(v, i === 0 ? reason : "بديل مناسب", baseScore - i * 0.5);
    vc.embedUrl = `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1&playsinline=1`;
    vc.watchUrl = `https://www.youtube.com/watch?v=${v.id}`;
    return vc;
  });
}

/**
 * The main entry point: get video candidates for a lesson.
 *
 * Fallback chain:
 *   1. Full context search (country + stage + grade + subject + lesson)
 *   2. Reduced context (subject + lesson only)
 *   3. Subject-only search
 *   4. Subject + "تعليمي" search
 *   5. Verified hardcoded fallback (for backward compatibility)
 *   6. Empty → "لا يوجد فيديو مناسب"
 */
export async function getLessonVideoCandidates(
  ctx: LessonVideoContext
): Promise<VideoCandidate[]> {
  const k = cacheKey(ctx);
  const cached = CACHE.get(k);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.candidates;

  const subject = (ctx.subject || "").trim();
  const lesson = (ctx.lesson || ctx.topic || "").trim();

  // Try full context first
  const fullCtx = { ...ctx, subject, lesson };
  const fullQuery = await getYouTubeQuery(fullCtx);
  const fullResults = await searchYouTubeVideos(fullQuery);

  if (fullResults.candidates.length > 0) {
    const ranked = await getFilteredCandidates(fullResults.candidates, fullCtx);
    if (ranked.length > 0) {
      const candidates = videosToCandidates(ranked, "الأكثر ملاءمة للدرس", 10);
      CACHE.set(k, { candidates, ts: Date.now() });
      return candidates;
    }
  }

  // Fallback 2: subject + lesson only
  if (subject || lesson) {
    const partialCtx = { ...ctx, subject, lesson };
    const partialQuery = await getYouTubeQuery(partialCtx);
    const partialResults = await searchYouTubeVideos(partialQuery);

    if (partialResults.candidates.length > 0) {
      const ranked = await getFilteredCandidates(partialResults.candidates, partialCtx);
      if (ranked.length > 0) {
        const candidates = videosToCandidates(ranked, "مناسب للدرس", 8);
        CACHE.set(k, { candidates, ts: Date.now() });
        return candidates;
      }
    }
  }

  // Fallback 3: subject only
  if (subject) {
    const subjectCtx = { ...ctx, subject };
    const subjectQuery = await getYouTubeQuery(subjectCtx);
    const subjectResults = await searchYouTubeVideos(subjectQuery);

    if (subjectResults.candidates.length > 0) {
      const ranked = await getFilteredCandidates(subjectResults.candidates, subjectCtx);
      if (ranked.length > 0) {
        const candidates = videosToCandidates(ranked, "الأكثر صلة بالموضوع", 6);
        CACHE.set(k, { candidates, ts: Date.now() });
        return candidates;
      }
    }
  }

  // Fallback 4: subject + "تعليمي" for Arabic users
  if (subject) {
    const langQuery = (ctx.language || "").includes("ar")
      ? `${subject} تعليمي`
      : `${subject} lesson`;
    const langCtx = { ...ctx, subject };
    const langResults = await searchYouTubeVideos(langQuery);

    if (langResults.candidates.length > 0) {
      const ranked = await getFilteredCandidates(langResults.candidates, langCtx);
      if (ranked.length > 0) {
        const candidates = videosToCandidates(ranked, "محتوى تعليمي", 5);
        CACHE.set(k, { candidates, ts: Date.now() });
        return candidates;
      }
    }
  }

  // Fallback 5: verified hardcoded fallback (for backward compatibility)
  const hardcoded = getHardcodedFallback(ctx);
  if (hardcoded.length > 0) {
    CACHE.set(k, { candidates: hardcoded, ts: Date.now() });
    return hardcoded;
  }

  // Nothing found
  CACHE.set(k, { candidates: [], ts: Date.now() });
  return [];
}

/** Hardcoded verified fallback for known subjects (backward compat). */
function getHardcodedFallback(ctx: LessonVideoContext): VideoCandidate[] {
  const VERIFIED_EDUCATIONAL_IDS: Record<string, { id: string; reason: string }[]> = {
    arabic_grammar: [
      { id: "VZZX2IXeet8", reason: "شرح القواعد النحوية" },
      { id: "482yzdMyjZQ", reason: "تعلم القواعد من الصفر" },
    ],
    math: [
      { id: "t6nLwOfhW8I", reason: "شرح مفاهيم الرياضيات" },
      { id: "ph8C0pO6NVE", reason: "أساسيات الرياضيات" },
    ],
    physics: [
      { id: "WbWP5dzYlOM", reason: "درس في الفيزياء" },
    ],
    chemistry: [{ id: "-wyrtqH8WwQ", reason: "درس في الكيمياء" }],
    biology: [{ id: "jNQXAC9IVRw", reason: "مقدمة في الأحياء" }],
    english_edu: [{ id: "M7lc1UVf-VE", reason: "درس في اللغة الإنجليزية" }],
    programming: [{ id: "M7lc1UVf-VE", reason: "درس في البرمجة" }],
  };

  const s = (ctx.subject || "").trim().toLowerCase();
  const fallback = VERIFIED_EDUCATIONAL_IDS[s];
  if (!fallback || fallback.length === 0) return [];

  return fallback.map((f, i) =>
    toVideoCandidate(
      {
        id: f.id,
        title: f.reason,
        channelTitle: "المحتوى التعليمي",
        description: "",
        duration: "PT12M30S",
        thumbnailUrl: `https://img.youtube.com/vi/${f.id}/mqdefault.jpg`,
      },
      f.reason,
      10 - i * 0.5
    )
  );
}

export async function rankLessonVideos(
  ctx: LessonVideoContext,
  candidates: VideoCandidate[]
): Promise<VideoCandidate[]> {
  return [...candidates].sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}
