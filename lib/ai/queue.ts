/** In-process concurrency limiter to absorb burst load instead of rejecting immediately. */
const MAX_CONCURRENT = 50;
let activeRequests = 0;
const queue: Array<() => void> = [];

export async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
    });
  }

  activeRequests++;
  try {
    return await fn();
  } finally {
    activeRequests--;
    const next = queue.shift();
    if (next) next();
  }
}
