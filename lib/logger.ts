/**
 * Structured logger for My-Own-Phoenix.
 *
 * - Server: JSON-lines to stdout (Docker/journald friendly)
 * - Client: falls back to console.* (dev only)
 * - prod: `debug` level suppressed
 * - error(): serializes Error instances
 * - redacts a small set of sensitive keys before emit
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogContext {
  route?: string;
  userId?: string;
  projectId?: string;
  [k: string]: unknown;
}

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isServer = typeof window === "undefined";
const isProd = process.env.NODE_ENV === "production";
const MIN_LEVEL: Level = isProd ? "info" : "debug";

const REDACT_KEYS = ["password", "token", "apiKey", "api_key", "secret", "authorization", "cookie"];

function redact(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = REDACT_KEYS.includes(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}

function emit(level: Level, msg: string, ctx?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const safeCtx = ctx ? redact(ctx) : undefined;

  if (isServer) {
    const record = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(safeCtx ?? {}),
    };
    const line = JSON.stringify(record);
    if (level === "error" || level === "warn") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
    return;
  }

  // Client: dev-only console fallback
  if (!isProd) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${level}] ${msg}`, safeCtx ?? "");
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, err?: unknown, ctx?: LogContext) =>
    emit("error", msg, { ...ctx, ...(err !== undefined ? { err: serializeError(err) } : {}) }),
};
