import { NextRequest, NextResponse } from "next/server";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const EVAL_WORKER_URL = process.env.EVAL_WORKER_URL ?? "http://localhost:4000";

export const POST = authedHandler(async (req: NextRequest) => {
  const { project, traceId, evalNames } = (await req.json()) as {
    project: string;
    traceId: string;
    evalNames?: string[];
  };

  if (!project || !traceId) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      project: project ? undefined : "required",
      traceId: traceId ? undefined : "required",
    });
  }

  try {
    const res = await fetch(`${EVAL_WORKER_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, traceId, evalNames: evalNames ?? [] }),
      signal: AbortSignal.timeout(60_000),
    });
    const txt = await res.text();
    if (!res.ok) {
      logger.error("eval-run worker error response", undefined, { route: "POST /api/eval-run", status: res.status, body: txt });
      return apiError(req, ErrorCode.UNKNOWN_ERROR, `eval-worker ${res.status}: ${txt}`);
    }
    return NextResponse.json(JSON.parse(txt));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("eval-run fetch error", e, { route: "POST /api/eval-run" });
    return apiError(req, ErrorCode.UNKNOWN_ERROR, `eval-worker error: ${msg}`);
  }
});
