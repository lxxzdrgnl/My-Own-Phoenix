/** Rate limit configs: { max requests, window ms }. */

/** Project join attempts per user. */
export const RATE_LIMIT_JOIN = { max: 5, windowMs: 60_000 } as const;

/** Trace collect ingestion per project. */
export const RATE_LIMIT_COLLECT = { max: 1000, windowMs: 60_000 } as const;
