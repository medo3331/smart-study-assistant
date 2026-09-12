"use server";
/**
 * Phase 1.5 — YouTube Data API v3 Primary + Apify Optional Fallback.
 * Server-only. NEVER exposes API key to browser.
 * Uses plain fetch against the REST endpoints (no googleapis SDK — the
 * meta-package's types alone OOM the build type-checker; two GET calls
 * don't justify hundreds of API clients). Keeps Apify branch isolated.
 */

import {
  buildYouTubeQuery,
  filterAndRankCandidates,
  toEmbedUrl,
  toWatchUrl,
  type YouTubeVideo,
  type VideoSearchResult,
} from "./youtube-types";

export type { YouTubeVideo, VideoSearchResult } from "./youtube-types";

const SEARCH_MAX = 25;

/** Read environment keys securely. */
function getEnvKeys() {
  const ytKey = process.env.YOUTUBE_API_KEY || "";
  const ytDataKey = process.env.YOUTUBE_DATA_API_KEY || "";
  const apifyKey = ytKey.startsWith("apify_api_") ? ytKey : (process.env.APIFY_API_KEY || "");
  // Prefer explicit Google Data API key; fall back to YOUTUBE_API_KEY if it looks like Google key
  const googleKey = (ytDataKey && ytDataKey.startsWith("AIza")) ? ytDataKey
    : (ytKey.startsWith("AIza") ? ytKey : "");
  return { googleKey, apifyKey, ytKey };
}

/* ------------------------------------------------------------------ */
/*  Primary: Google YouTube Data API v3 (plain fetch — no SDK)        */
/* ------------------------------------------------------------------ */

type YtSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    description?: string;
    thumbnails?: { high?: { url?: string }; default?: { url?: string } };
  };
};

type YtApiErrorShape = {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};

/**
 * Minimal typed GET against `youtube/v3/*`. Throws on HTTP/API errors with
 * the API's `reason` codes (quotaExceeded, dailyLimitExceeded, …) embedded
 * in the message — the caller's quota detection below depends on that.
 */
async function ytGet<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  const data = (await res.json().catch(() => ({}))) as T & YtApiErrorShape;
  if (!res.ok || data?.error) {
    const reason = data?.error?.errors?.map((e) => e.reason).filter(Boolean).join(",") || "";
    const message = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`YouTube API ${path} failed (${res.status}) [${reason}]: ${message}`);
  }
  return data;
}

export async function searchYouTubeVideos(
  query: string,
  maxResults: number = 10,
): Promise<VideoSearchResult> {
  const { googleKey, apifyKey, ytKey } = getEnvKeys();

  // 1. Try Google YouTube Data API v3 as primary (only if a Google-style key is configured)
  if (googleKey && googleKey.startsWith("AIza")) {
    try {
      const data = await ytGet<{ items?: YtSearchItem[] }>("search", {
        part: "snippet",
        q: query,
        type: "video",
        maxResults: String(Math.min(maxResults, SEARCH_MAX)),
        regionCode: "EG",
        relevanceLanguage: "ar",
        videoEmbeddable: "true",
        videoSyndicated: "true",
      }, googleKey);
      const items = data?.items || [];
      if (items.length === 0) {
        return { candidates: [], totalResults: 0, queryUsed: query, error: "no_results" };
      }
      const videoIds = items.map((i) => i.id?.videoId).filter(Boolean) as string[];
      const durations: Record<string, string> = {};
      try {
        if (videoIds.length > 0) {
          const videosData = await ytGet<{ items?: Array<{ id?: string; contentDetails?: { duration?: string } }> }>("videos", {
            part: "contentDetails",
            id: videoIds.join(","),
          }, googleKey);
          const vids = videosData?.items || [];
          for (const vi of vids) {
            if (vi.id && vi.contentDetails?.duration) durations[vi.id] = vi.contentDetails.duration;
          }
        }
      } catch {
        // Duration hydration optional; continue without it
      }
      const videos: YouTubeVideo[] = items.map((item) => {
        const id = item.id?.videoId || "";
        return {
          id,
          title: item.snippet?.title || "",
          channelTitle: item.snippet?.channelTitle || "",
          description: item.snippet?.description || "",
          duration: durations[id] || "",
          thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
        };
      });
      return { candidates: videos, totalResults: videos.length, queryUsed: query };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      console.error("[YouTube Search] Google API error:", msg);
      // On quota/daily limit error return structured error; otherwise fall through to Apify
      if (msg.includes("quota") || msg.includes("dailyLimit") || msg.includes("quotaExceeded")) {
        return { candidates: [], totalResults: 0, queryUsed: query, error: "quota_exceeded" };
      }
      // Proceed to fallback below
    }
  } else if (googleKey) {
    // Configured but doesn't start with AIza — treat as misconfigured; don't expose value
    console.warn("[YouTube Search] YOUTUBE_API_KEY configured but not a Google Data API key (does not start with AIza). Not sending to Google.");
  }

  // 2. Optional Apify fallback (isolated; never breaks because of missing actor names)
  if (apifyKey && apifyKey.startsWith("apify_api_")) {
    const apifyResult = await searchViaApify(query, apifyKey, maxResults);
    if (apifyResult.candidates.length > 0) {
      return apifyResult;
    }
    // Apify returned nothing; do NOT return empty immediately; check if Google already failed with quota
    if (apifyResult.error && (apifyResult.error === "api_error" || !googleKey || !googleKey.startsWith("AIza"))) {
      // If Apify is our only configured provider and it failed, propagate structured error
      return { candidates: [], totalResults: 0, queryUsed: query, error: apifyResult.error || "api_error" };
    }
  }

  // 3. If Google was configured and returned no results (not a quota error), return no_results
  if (googleKey && googleKey.startsWith("AIza")) {
    return { candidates: [], totalResults: 0, queryUsed: query, error: "no_results" };
  }

  // 4. Nothing configured or both failed
  if (!googleKey && !(apifyKey && apifyKey.startsWith("apify_api_"))) {
    return { candidates: [], totalResults: 0, queryUsed: query, error: "missing_api_key" };
  }
  return { candidates: [], totalResults: 0, queryUsed: query, error: "no_videos_found" };
}

/* ------------------------------------------------------------------ */
/*  Apify fallback (isolated — never breaks primary path)             */
/* ------------------------------------------------------------------ */
async function searchViaApify(query: string, token: string, maxResults: number): Promise<VideoSearchResult> {
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
            : { searchQueries: [query], maxResults: Math.min(maxResults, 10) },
        ),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(`[YouTube Apify] ${actor} status=${res.status}: ${txt.slice(0, 300)}`);
        // Do NOT propagate actor-not-found as fatal; continue to next actor
        continue;
      }
      const data = (await res.json()) as unknown;
      const items = Array.isArray(data) ? data : [];
      const videos: YouTubeVideo[] = (items as unknown[])
        .map((it: unknown) => {
          const r = it as Record<string, unknown>;
          const id = (r.id as string) || (r.videoId as string) || (r.url as string)?.split("v=")[1]?.split("&")[0] || "";
          if (!id || id.length < 5) return null;
          return {
            id,
            title: (r.title as string) || (r.text as string) || "",
            channelTitle: (r.channelName as string) || (r.channelTitle as string) || (r.author as string) || "",
            description: (r.description as string) || "",
            duration: (r.duration as string) || "",
            thumbnailUrl: (r.thumbnailUrl as string) || (r.thumbnail as string) || `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
          } as YouTubeVideo;
        })
        .filter((v): v is YouTubeVideo => !!v);
      if (videos.length > 0) {
        return { candidates: videos, totalResults: videos.length, queryUsed: query };
      }
    } catch (e) {
      console.warn(`[YouTube Apify] ${actor} error:`, e);
    }
  }
  // Apify fallback complete: return structured no-results (not fatal to caller)
  return { candidates: [], totalResults: 0, queryUsed: query, error: "apify_fallback_failed" };
}

/* ------------------------------------------------------------------ */
/*  Utility wrappers preserved for server-action compatibility       */
/* ------------------------------------------------------------------ */
export async function getEmbedUrl(videoId: string): Promise<string> {
  return toEmbedUrl(videoId);
}
export async function getWatchUrl(videoId: string): Promise<string> {
  return toWatchUrl(videoId);
}
export async function getYouTubeQuery(ctx: {
  country?: string; stage?: string; grade?: string; track?: string; faculty?: string; subject?: string; lesson?: string; topic?: string; language?: string;
}): Promise<string> {
  return buildYouTubeQuery(ctx);
}
export async function getFilteredCandidates(
  videos: YouTubeVideo[],
  ctx: { subject?: string; lesson?: string; topic?: string; track?: string; faculty?: string; language?: string },
): Promise<YouTubeVideo[]> {
  return filterAndRankCandidates(videos, ctx);
}
