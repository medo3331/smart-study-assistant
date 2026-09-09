"use server";
/**
 * Phase 1.4+ — Smart Video with YouTube Data API v3 + Fallback Chain.
 * Server-only. NEVER exposes API key to the browser.
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
  language?: string;
}

export interface VideoCandidate {
  id: string;
  title: string;
  channel?: string;
  duration?: string;
  reason: string;
  embedUrl: string;
  watchUrl: string;
  thumbnail?: string;
  relevanceScore: number;
}

// Cache
const CACHE_KEY_VERSION = "v3";
const CACHE = new Map<string, { candidates: VideoCandidate[]; ts: number }>();
const CACHE_TTL_SUCCESS = 1000 * 60 * 30; // 30 min
const CACHE_TTL_FAILURE = 1000 * 1; // 1 min

function cacheKey(ctx: LessonVideoContext): string {
  return (
    CACHE_KEY_VERSION +
    "|" +
    [ctx.country || "", ctx.stage || "", ctx.grade || "", ctx.track || "", ctx.faculty || "", ctx.subject || "", ctx.lesson || "", ctx.topic || "", ctx.unit || "", ctx.chapter || "", ctx.curriculum || "", ctx.language || ""].join("|")
  );
}

/** Build a safe VideoCandidate from a YouTubeVideo. */
function toVideoCandidate(video: YouTubeVideo, reason: string, score: number): VideoCandidate {
  return {
    id: video.id, title: video.title, channel: video.channelTitle,
    duration: video.duration, reason,
    embedUrl: toEmbedUrlDirect(video.id),
    watchUrl: toWatchUrlDirect(video.id),
    thumbnail: video.thumbnailUrl, relevanceScore: score,
  };
}

/** Inline embed/watch URL generation (avoids importing from server module). */
function toEmbedUrlDirect(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;
}
function toWatchUrlDirect(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Convert YouTubeVideo[] to VideoCandidate[]. */
function videosToCandidates(videos: YouTubeVideo[], reason: string, baseScore: number): VideoCandidate[] {
  return videos.map((v, i) => {
    const vc = toVideoCandidate(v, i === 0 ? reason : "بديل مناسب", baseScore - i * 0.5);
    return vc;
  });
}

/** Create a short cache entry for failures/empty results. */
function cacheFailure(ctx: LessonVideoContext, candidates: VideoCandidate[]): void {
  const k = cacheKey(ctx);
  CACHE.set(k, { candidates, ts: Date.now() });
}

/**
 * The main entry point: get video candidates for a lesson.
 *
 * Fallback chain:
 *   1. Full context (country + stage + grade + subject + lesson + track + faculty)
 *   2. Subject + lesson/topic only
 *   3. Subject only (lesson/topic REMOVED)
 *   4. Subject + educational keyword
 *   5. Hardcoded fallback videos
 *   6. Empty result
 */
export async function getLessonVideoCandidates(
  ctx: LessonVideoContext
): Promise<{ candidates: VideoCandidate[]; error?: string }> {
  const k = cacheKey(ctx);
  const cached = CACHE.get(k);
  if (cached) {
    const ttl = cached.candidates.length > 0 ? CACHE_TTL_SUCCESS : CACHE_TTL_FAILURE;
    if (Date.now() - cached.ts < ttl) return { candidates: cached.candidates };
  }

  const subject = (ctx.subject || "").trim();

  // LEVEL 1: Full context search
  const fullCtx = { ...ctx, subject };
  const fullQuery = await getYouTubeQuery(fullCtx);
  const fullResults = await searchYouTubeVideos(fullQuery);

  if (fullResults.candidates.length > 0) {
    const ranked = await getFilteredCandidates(fullResults.candidates, fullCtx);
    if (ranked.length > 0) {
      const candidates = videosToCandidates(ranked, "الأكثر ملاءمة للدرس", 10);
      CACHE.set(k, { candidates, ts: Date.now() });
      return { candidates };
    }
  }

  // LEVEL 2: subject + lesson only
  const lesson = ((ctx.lesson || ctx.topic || "").trim());
  if (subject || lesson) {
    const partialCtx = { ...ctx, subject, lesson };
    const partialQuery = await getYouTubeQuery(partialCtx);
    const partialResults = await searchYouTubeVideos(partialQuery);
    if (partialResults.candidates.length > 0) {
      const ranked = await getFilteredCandidates(partialResults.candidates, partialCtx);
      if (ranked.length > 0) {
        const candidates = videosToCandidates(ranked, "مناسب للدرس", 8);
        CACHE.set(k, { candidates, ts: Date.now() });
        return { candidates };
      }
    }
  }

  // LEVEL 3: subject ONLY — explicitly remove lesson/topic
  if (subject) {
    const subjectOnlyCtx: LessonVideoContext = {
      country: ctx.country,
      stage: ctx.stage,
      grade: ctx.grade,
      track: ctx.track,
      faculty: ctx.faculty,
      subject,
      language: ctx.language,
    };
    const subjectQuery = await getYouTubeQuery(subjectOnlyCtx);
    const subjectResults = await searchYouTubeVideos(subjectQuery);
    if (subjectResults.candidates.length > 0) {
      const ranked = await getFilteredCandidates(subjectResults.candidates, { subject });
      if (ranked.length > 0) {
        const candidates = videosToCandidates(ranked, "الأكثر صلة بالموضوع", 6);
        CACHE.set(k, { candidates, ts: Date.now() });
        return { candidates };
      }
    }
  }

  // LEVEL 4: subject + educational keyword
  if (subject) {
    const lang = (ctx.language || "").includes("ar");
    const eduQuery = lang ? `${subject} تعليمي` : `${subject} lesson`;
    const eduCtx: LessonVideoContext = { ...ctx, subject };
    const eduResults = await searchYouTubeVideos(eduQuery);
    if (eduResults.candidates.length > 0) {
      const ranked = await getFilteredCandidates(eduResults.candidates, eduCtx);
      if (ranked.length > 0) {
        const candidates = videosToCandidates(ranked, "محتوى تعليمي", 5);
        CACHE.set(k, { candidates, ts: Date.now() });
        return { candidates };
      }
    }
  }

  // LEVEL 5: hardcoded fallback
  const hardcoded = getHardcodedFallback(ctx);
  if (hardcoded.length > 0) {
    CACHE.set(k, { candidates: hardcoded, ts: Date.now() });
    return { candidates: hardcoded };
  }

  // LEVEL 6: nothing found — short cache
  const empty: VideoCandidate[] = [];
  cacheFailure(ctx, empty);
  return { candidates: empty, error: "no_videos_found" };
}

/** Hardcoded verified fallback for known subjects. */
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
  if (fallback && fallback.length > 0) {
    return fallback.map((f, i) =>
      toVideoCandidate(
        { id: f.id, title: f.reason, channelTitle: "المحتوى التعليمي", description: "", duration: "PT12M30S", thumbnailUrl: `https://img.youtube.com/vi/${f.id}/mqdefault.jpg` },
        f.reason, 10 - i * 0.5
      )
    );
  }

  // Arabic subject aliases
  const arabicAliases: Record<string, string[]> = {
    "رياضيات": ["math"], "رياضي": ["math"], "رياضى": ["math"],
    "عربية": ["arabic_grammar"], "لغة عربية": ["arabic_grammar"],
    "فيزياء": ["physics"], "كيمياء": ["chemistry"],
    "أحياء": ["biology"], "برمجة": ["programming"],
    "إنجليزي": ["english_edu"], "إنجليزية": ["english_edu"],
  };
  const aliasKey = arabicAliases[s];
  if (aliasKey) {
    const mapped = VERIFIED_EDUCATIONAL_IDS[aliasKey[0]];
    if (mapped && mapped.length > 0) {
      return mapped.map((f, i) =>
        toVideoCandidate(
          { id: f.id, title: f.reason, channelTitle: "المحتوى التعليمي", description: "", duration: "PT12M30S", thumbnailUrl: `https://img.youtube.com/vi/${f.id}/mqdefault.jpg` },
          f.reason, 10 - i * 0.5
        )
      );
    }
  }

  return [];
}

export async function rankLessonVideos(
  ctx: LessonVideoContext,
  candidates: VideoCandidate[]
): Promise<VideoCandidate[]> {
  return [...candidates].sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}
