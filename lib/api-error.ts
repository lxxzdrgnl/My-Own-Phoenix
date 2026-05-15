import { NextRequest, NextResponse } from "next/server";

// ── Error Response Format ──

export interface ApiErrorResponse {
  timestamp: string;
  path: string;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Standard Error Codes ──

export const ErrorCode = {
  // 400
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_QUERY_PARAM: "INVALID_QUERY_PARAM",

  // 401
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",

  // 403
  FORBIDDEN: "FORBIDDEN",

  // 404
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",

  // 409
  DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE",
  STATE_CONFLICT: "STATE_CONFLICT",

  // 422
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",

  // 429
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",

  // 500
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",

  // Domain-specific
  PROVIDER_NOT_FOUND: "PROVIDER_NOT_FOUND",
  PROVIDER_DUPLICATE: "PROVIDER_DUPLICATE",
  PROVIDER_INVALID: "PROVIDER_INVALID",
  EVAL_NOT_FOUND: "EVAL_NOT_FOUND",
  DATASET_NOT_FOUND: "DATASET_NOT_FOUND",
  PHOENIX_ERROR: "PHOENIX_ERROR",
  LLM_ERROR: "LLM_ERROR",
} as const;

type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_MAP: Record<string, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  INVALID_QUERY_PARAM: 400,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  PROVIDER_NOT_FOUND: 404,
  EVAL_NOT_FOUND: 404,
  DATASET_NOT_FOUND: 404,
  DUPLICATE_RESOURCE: 409,
  PROVIDER_DUPLICATE: 409,
  STATE_CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  DATABASE_ERROR: 500,
  UNKNOWN_ERROR: 500,
  PROVIDER_INVALID: 400,
  PHOENIX_ERROR: 502,
  LLM_ERROR: 502,
};

// ── Error Response Builder ──

/**
 * Create a standardized error response.
 *
 * Usage:
 * ```
 * return apiError(req, ErrorCode.VALIDATION_FAILED, "name is required", { name: "missing" });
 * ```
 */
export function apiError(
  req: NextRequest,
  code: ErrorCodeType,
  message: string,
  details?: Record<string, unknown>,
  statusOverride?: number,
): NextResponse<ApiErrorResponse> {
  const status = statusOverride ?? STATUS_MAP[code] ?? 500;

  const body: ApiErrorResponse = {
    timestamp: new Date().toISOString(),
    path: req.nextUrl.pathname,
    status,
    code,
    message,
    ...(details && { details }),
  };

  return NextResponse.json(body, { status });
}

// ── Validation Helper ──

interface ValidationRule {
  field: string;
  value: unknown;
  required?: boolean;
  type?: "string" | "number" | "boolean";
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  oneOf?: readonly string[];
}

/**
 * Validate request body fields. Returns error details or null if valid.
 *
 * Usage:
 * ```
 * const err = validateFields([
 *   { field: "provider", value: body.provider, required: true, oneOf: ["openai", "anthropic"] },
 *   { field: "apiKey", value: body.apiKey, required: true, minLength: 1 },
 * ]);
 * if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);
 * ```
 */
export function validateFields(rules: ValidationRule[]): Record<string, string> | null {
  const errors: Record<string, string> = {};

  for (const rule of rules) {
    const { field, value, required, type, minLength, maxLength, min, max, oneOf } = rule;

    if (required && (value === undefined || value === null || value === "")) {
      errors[field] = `${field} is required`;
      continue;
    }

    if (value === undefined || value === null) continue;

    if (type && typeof value !== type) {
      errors[field] = `${field} must be a ${type}`;
      continue;
    }

    if (typeof value === "string") {
      if (minLength !== undefined && value.length < minLength) {
        errors[field] = `${field} must be at least ${minLength} characters`;
      }
      if (maxLength !== undefined && value.length > maxLength) {
        errors[field] = `${field} must be at most ${maxLength} characters`;
      }
      if (oneOf && !oneOf.includes(value)) {
        errors[field] = `${field} must be one of: ${oneOf.join(", ")}`;
      }
    }

    if (typeof value === "number") {
      if (min !== undefined && value < min) {
        errors[field] = `${field} must be >= ${min}`;
      }
      if (max !== undefined && value > max) {
        errors[field] = `${field} must be <= ${max}`;
      }
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

// ── Handler Wrappers ──

type RawHandler = (req: NextRequest, ctx?: any) => Promise<Response>;
type AuthedHandlerFn = (req: NextRequest, uid: string, ctx?: any) => Promise<Response>;

function wrapWithErrorCatching(req: NextRequest, handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((e) => {
    console.error(`[API Error] ${req.method} ${req.nextUrl.pathname}:`, e);
    const message = e instanceof Error ? e.message : "An unexpected error occurred";
    if (e instanceof Error && e.message.includes("Prisma")) {
      return apiError(req, ErrorCode.DATABASE_ERROR, "Database operation failed", { detail: message });
    }
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, message);
  });
}

/**
 * Wrap an API handler with error catching (no auth).
 * Use for public endpoints like /api/auth/sync.
 *
 * ```
 * export const POST = safeHandler(async (req) => { ... });
 * ```
 */
export function safeHandler(handler: RawHandler): RawHandler {
  return (req: NextRequest, ctx?: any) =>
    wrapWithErrorCatching(req, () => handler(req, ctx));
}

/**
 * Wrap an API handler with auth + error catching.
 * Verifies Firebase token and passes uid to handler.
 * Returns 401 if not authenticated.
 *
 * ```
 * export const GET = authedHandler(async (req, uid) => {
 *   // uid is verified user ID
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function authedHandler(handler: AuthedHandlerFn): RawHandler {
  return (req: NextRequest, ctx?: any) =>
    wrapWithErrorCatching(req, async () => {
      const { verifyAuth } = await import("@/lib/auth-server");
      const uid = await verifyAuth(req);
      if (!uid) return apiError(req, ErrorCode.UNAUTHORIZED, "Authentication required");
      return handler(req, uid, ctx);
    });
}
