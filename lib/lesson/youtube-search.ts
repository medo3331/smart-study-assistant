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
    console.warn("[YouTube Search] YOUTUBE_API_KEY missing — returning empty (add AIza... or apify_api_... to .env.local and Vercel)");
    return { candidates: [], totalResults: 0, queryUsed: query };
  }
  // Apify path — uses the apify_api_... token you already have, no Google billing needed
  if (apiKey.startsWith("apify_api_")) {
    return searchViaApify(query, apiKey, maxResults);
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

async function searchViaApify(query: string, token: string, maxResults: number): Promise<VideoSearchResult> {
  // Uses the Apify YouTube scraper actor (no Google key/billing needed).
  // Actor: apify/youtube-scraper or streamers/youtube-scraper — we try streamers first (lighter search).
  const actors = ["streamers~youtube-scraper", "apify~youtube-scraper"];
  for (const actor of actors) {
    try {
      const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          actor === "streamers~youtube-scraper"
            ? { searchQueries: [query], maxResultsPerQuery: Math.min(maxResults, 10) }
            : { searchQueries: [query], maxResults: Math.min(maxResults, 10) }
        ),
      } as RequestInit & { next?: { revalidate: number } });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(`[YouTube Apify] ${actor} ${res.status}: ${txt.slice(0, 300)}`);
        continue;
      }
      const data = (await res.json()) as unknown;
      const items = Array.isArray(data) ? data : [];
      const videos: YouTubeVideo[] = items
        .map((it: unknown) => {
          const r = it as Record<string, unknown>;
          const id = (r.id as string) || (r.videoId as string) || (r.url as string)?.split("v=")[1]?.split("&")[0] || "";
          if (!id || id.length < 5) return null;
          const title = (r.title as string) || (r.text as string) || "";
          const channel = (r.channelName as string) || (r.channelTitle as string) || (r.author as string) || "";
          const desc = (r.description as string) || "";
          const thumb = (r.thumbnailUrl as string) || (r.thumbnail as string) || `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
          const dur = (r.duration as string) || "";
          return { id, title, channelTitle: channel, description: desc, duration: dur, thumbnailUrl: thumb } as YouTubeVideo;
        })
        .filter((v): v is YouTubeVideo => !!v);
      if (videos.length > 0) return { candidates: videos, totalResults: videos.length, queryUsed: query };
    } catch (e) {
      console.warn(`[YouTube Apify] ${actor} error:`, e);
    }
  }
  console.warn("[YouTube Apify] all actors failed — returning empty; fallback will show verified videos");
  return { candidates: [], totalResults: 0, queryUsed: query };
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
