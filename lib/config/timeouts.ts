/** Centralized timeout / interval constants (milliseconds). */

/** Phoenix backend fetch (spans, trees, proxy). */
export const PHOENIX_FETCH_TIMEOUT_MS = 15_000;

/** Default outbound API call (annotations, provider test, backfill). */
export const DEFAULT_API_TIMEOUT_MS = 10_000;

/** Short fetch where a fast failure is preferable (openapi spec proxy). */
export const SHORT_API_TIMEOUT_MS = 5_000;

/** LLM provider calls — generous, model latency varies. */
export const LLM_TIMEOUT_MS = 60_000;

/** SSE keep-alive ping interval. */
export const SSE_PING_INTERVAL_MS = 30_000;

/** SSE reconnect backoff delay. */
export const SSE_RETRY_DELAY_MS = 5_000;

/** Transient UI confirmation reset (e.g. "Copied!" / "Saved!"). */
export const UI_FEEDBACK_RESET_MS = 2_000;
