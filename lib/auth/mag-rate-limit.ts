// In-memory rate limiter for MAG login flows.
//
// ⚠️ Limitation: this is process-local and not shared across instances/regions.
// It is NOT sufficient as a production-grade distributed rate limiter. For
// production, replace with a shared store (Redis/Upstash) keyed by IP + MAG ID.
// We keep it here as a best-effort guard and document the shortfall honestly.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

export function checkMagRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= MAX_REQUESTS) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function magRateLimitKey(ip: string, magId: string, action: "request" | "verify"): string {
  return `${action}:${ip}:${magId.toUpperCase()}`;
}