/**
 * Phase 1.5 — YouTube Types & Pure Utilities.
 * No "use server". Safe to import anywhere.
 */

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  description: string;
  duration: string;
  thumbnailUrl: string;
}

export interface VideoSearchResult {
  candidates: YouTubeVideo[];
  totalResults: number;
  queryUsed: string;
}

/** Build a YouTube search query from education context. */
export function buildYouTubeQuery(ctx: {
  country?: string;
  stage?: string;
  grade?: string;
  track?: string;
  faculty?: string;
  subject?: string;
  lesson?: string;
  topic?: string;
  language?: string;
}): string {
  const parts: string[] = [];
  if (ctx.subject) parts.push(ctx.subject);
  if (ctx.lesson && ctx.lesson !== ctx.subject) parts.push(ctx.lesson);
  else if (ctx.topic && ctx.topic !== ctx.subject) parts.push(ctx.topic);
  // Track / شعبة / مسار — the discriminator that turns a generic lesson into a stage-specific one
  if (ctx.track) parts.push(ctx.track);
  if (ctx.faculty) parts.push(ctx.faculty);
  if (ctx.stage && ctx.stage !== "university") {
    const stageMap: Record<string, string> = {
      PRIMARY: "ابتدائي", PREPARATORY: "إعدادي",
      SECONDARY: "ثانوي", BACCALAUREATE: "بكالوريا",
    };
    parts.push(stageMap[ctx.stage] || ctx.stage);
  }
  if (ctx.grade && !["academic", "practical", "visual"].includes(ctx.grade)) {
    parts.push(ctx.grade);
  }
  const lang = (ctx.language || "").toLowerCase();
  if (lang.includes("arabic") || lang.includes("عربية")) {
    parts.push("عربي", "تعليمي");
  }
  parts.push("شرح", "تعليمي", "lesson");
  return [...new Set(parts)].join(" ");
}

/** Entertainment/music rejection keywords. */
const ENTERTAINMENT_KEYWORDS = [
  "music", "song", "official music", "lyrics", "mv", "video clip",
  "despacito", "rickroll", "rick astley", "never gonna", "give you up",
  "official video", "music video", "official audio", "viral", "meme",
  "comedy", "prank", "dance", "challenge", "react", "review",
];

/** Educational signal keywords. */
const EDUCATION_SIGNALS = [
  "شرح", "تعليمي", "lesson", "class", "lecture", "tutorial",
  "تعلم", "درس", "شاهد", "watch", "learn", "explained",
  "course", "مقرر", "curriculum", "revision", "مراجعة",
];

/** Duration filter: reject videos longer than 45 minutes or shorter than 2 minutes. */
export function isValidDuration(duration: string): boolean {
  if (!duration) return true;
  const match = duration.match(/PT(\d+)M(\d+)S/);
  if (!match) return true;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const totalMinutes = minutes + seconds / 60;
  return totalMinutes >= 1 && totalMinutes <= 45;
}

/** Filter and rank YouTube candidates. */
export function filterAndRankCandidates(
  videos: YouTubeVideo[],
  ctx: { subject?: string; lesson?: string; topic?: string; track?: string; faculty?: string; language?: string }
): YouTubeVideo[] {
  const subjectLower = (ctx.subject || "").toLowerCase().trim();
  const lessonLower = ((ctx.lesson || ctx.topic || "").toLowerCase().trim()).split(/\s+/).filter((w) => w.length > 2);
  const trackLower = (ctx.track || "").toLowerCase().trim();
  const facultyLower = (ctx.faculty || "").toLowerCase().trim();

  return videos
    .filter((v) => v.id && v.id.length >= 5)
    .filter((v) => {
      const titleLower = v.title.toLowerCase();
      for (const kw of ENTERTAINMENT_KEYWORDS) {
        if (titleLower.includes(kw)) return false;
      }
      return true;
    })
    .filter((v) => isValidDuration(v.duration))
    .sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      const titleALower = a.title.toLowerCase();
      const titleBLower = b.title.toLowerCase();

      if (subjectLower) {
        if (titleALower.includes(subjectLower)) scoreA += 10;
        if (titleBLower.includes(subjectLower)) scoreB += 10;
        const subWords = subjectLower.split(/\s+/).filter((w) => w.length > 2);
        for (const w of subWords) {
          if (titleALower.includes(w)) scoreA += 3;
          if (titleBLower.includes(w)) scoreB += 3;
        }
      }

      for (const w of lessonLower) {
        if (titleALower.includes(w)) scoreA += 5;
        if (titleBLower.includes(w)) scoreB += 5;
      }

      for (const kw of EDUCATION_SIGNALS) {
        if (titleALower.includes(kw)) scoreA += 2;
        if (titleBLower.includes(kw)) scoreB += 2;
      }

      if (trackLower) {
        if (titleALower.includes(trackLower)) scoreA += 7;
        if (titleBLower.includes(trackLower)) scoreB += 7;
        const trackWords = trackLower.split(/\s+/).filter((w) => w.length > 2);
        for (const w of trackWords) {
          if (titleALower.includes(w)) scoreA += 2;
          if (titleBLower.includes(w)) scoreB += 2;
        }
      }
      if (facultyLower) {
        if (titleALower.includes(facultyLower)) scoreA += 6;
        if (titleBLower.includes(facultyLower)) scoreB += 6;
      }

      const lang = (ctx.language || "").toLowerCase();
      if (lang.includes("arabic") || lang.includes("عربية")) {
        if (titleALower.includes("عربي") || titleALower.includes("تعليمي") || titleALower.includes("شرح")) scoreA += 3;
        if (titleBLower.includes("عربي") || titleBLower.includes("تعليمي") || titleBLower.includes("شرح")) scoreB += 3;
      }

      if (a.channelTitle && a.channelTitle.toLowerCase().includes("educational")) scoreA += 1;
      if (b.channelTitle && b.channelTitle.toLowerCase().includes("educational")) scoreB += 1;

      return scoreB - scoreA;
    });
}

/** Convert YouTubeVideo to embed URL. */
export function toEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;
}

/** Convert YouTubeVideo to watch URL. */
export function toWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
