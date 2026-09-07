"use server";
/**
 * Phase 1.5 — YouTube Data API v3 Search Integration (Server Actions).
 * Server-only. NEVER exposes API key to the browser.
 * Uses googleapis (already installed as peer dependency of @google/genai).
 *
 * Pure utilities (buildYouTubeQuery, filterAndRankCandidates, toEmbedUrl, toWatchUrl)
 * are in youtube-types.ts — imported here for convenience.
 */

import { google } from "googleapis";
import {
  buildYouTubeQuery,
  filterAndRankCandidates,
  toEmbedUrl,
  toWatchUrl,
  type YouTubeVideo,
  type VideoSearchResult,
} from "./youtube-types";

export type { YouTubeVideo, VideoSearchResult } from "./youtube-types";

/** Fetch video candidates from YouTube Data API v3. */
export async function searchYouTubeVideos(
  query: string,
  maxResults: number = 10
): Promise<VideoSearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("[YouTube Search] YOUTUBE_API_KEY missing — returning empty (add AIza... key to .env.local and Vercel)");
    return { candidates: [], totalResults: 0, queryUsed: query };
  }
  if (apiKey.startsWith("apify_api_")) {
    console.warn("[YouTube Search] YOUTUBE_API_KEY looks like an Apify key, not a YouTube Data API key (should start with AIza...) — see .env.example");
    return { candidates: [], totalResults: 0, queryUsed: query };
  }

  try {
    const youtube = google.youtube({ version: "v3", auth: apiKey });

    const response = await youtube.search.list({
      part: ["snippet"],
      q: query,
      type: ["video"],
      maxResults: Math.min(maxResults, 25),
      regionCode: "EG",
      relevanceLanguage: "ar",
      videoCategoryId: "27",
    });

    const items: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        description?: string;
        thumbnails?: { high?: { url?: string } };
      };
      contentDetails?: { duration?: string };
    }> = (response as { data?: { items?: typeof items } }).data?.items || [];

    const videos: YouTubeVideo[] = items.map((item) => ({
      id: item.id?.videoId || "",
      title: item.snippet?.title || "",
      channelTitle: item.snippet?.channelTitle || "",
      description: item.snippet?.description || "",
      duration: (item as { contentDetails?: { duration?: string } }).contentDetails?.duration || "",
      thumbnailUrl: (item as { snippet?: { thumbnails?: { high?: { url?: string } } } }).snippet?.thumbnails?.high?.url || "",
    }));

    return { candidates: videos, totalResults: videos.length, queryUsed: query };
  } catch (error) {
    console.error("[YouTube Search] API error:", error);
    return { candidates: [], totalResults: 0, queryUsed: query };
  }
}

/** Convert YouTubeVideo to embed URL (async wrapper for Server Action compatibility). */
export async function getEmbedUrl(videoId: string): Promise<string> {
  return toEmbedUrl(videoId);
}

/** Convert YouTubeVideo to watch URL (async wrapper for Server Action compatibility). */
export async function getWatchUrl(videoId: string): Promise<string> {
  return toWatchUrl(videoId);
}

/** Build a YouTube search query from education context (async wrapper). */
export async function getYouTubeQuery(ctx: {
  country?: string;
  stage?: string;
  grade?: string;
  track?: string;
  faculty?: string;
  subject?: string;
  lesson?: string;
  topic?: string;
  language?: string;
}): Promise<string> {
  return buildYouTubeQuery(ctx);
}

/** Filter and rank YouTube candidates (async wrapper for Server Action compatibility). */
export async function getFilteredCandidates(
  videos: YouTubeVideo[],
  ctx: { subject?: string; lesson?: string; topic?: string; track?: string; faculty?: string; language?: string }
): Promise<YouTubeVideo[]> {
  return filterAndRankCandidates(videos, ctx);
}
