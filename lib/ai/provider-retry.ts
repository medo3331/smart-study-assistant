/**
 * lib/ai/provider-retry.ts — retry with exponential backoff for transient provider errors.
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function withProviderRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const maxDelayMs = opts.maxDelayMs ?? 4000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number; statusCode?: number })?.status
        ?? (e as { statusCode?: number })?.statusCode;
      const retryable = status === 429 || status === 502 || status === 503 || status === 504 || !status;
      if (!retryable || attempt === maxAttempts) throw e;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}