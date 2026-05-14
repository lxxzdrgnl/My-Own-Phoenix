const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.resetAt <= now) store.delete(key);
  }
}, 60_000);

/**
 * Check if a request is allowed under the rate limit.
 * @param key - Unique identifier (e.g., IP, userId, API key)
 * @param limit - Max requests per window
 * @param windowMs - Window duration in milliseconds
 * @returns { allowed, remaining }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: limit - entry.count };
}
