/**
 * lib/ai/concurrency.ts — global in-process concurrency limiter for AI provider calls.
 * Prevents bursting beyond a safe number of simultaneous upstream requests.
 * Replace with Redis-backed semaphore for multi-instance deployments.
 */
const MAX_CONCURRENT = Number(process.env.AI_MAX_CONCURRENT ?? "8");
let active = 0;
const queue: Array<() => void> = [];

export async function acquireAiSlot(): Promise<() => void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return release;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  active++;
  return release;
}

function release() {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next();
}