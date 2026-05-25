import { NextRequest, NextResponse } from "next/server";
import { runGuard } from "@/lib/pii-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { apiError, ErrorCode } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, stage2, direction, projectId } = body as {
      text: string;
      stage2?: "auto" | "force" | "skip";
      direction?: "input" | "output";
      projectId?: string;
    };

    if (typeof text !== "string" || !text.trim()) {
      return apiError(request, ErrorCode.BAD_REQUEST, "text is required");
    }

    const result = await runGuard(text, stage2 ?? "auto", { projectId });

    // Persist live run for the current project so Past runs / Dashboard pick it up.
    // No ground truth here, so outcome="LIVE" — UI filters it out of TP/FP/FN metrics.
    if (projectId) {
      try {
        await prisma.piiGuardRun.create({
          data: {
            projectId,
            externalId: "",
            category: "live",
            input: text,
            expectedMasked: "",
            actualMasked: result.maskedText,
            detections: JSON.stringify({
              stage1: result.stageDetections.stage1,
              stage2: result.stageDetections.stage2,
              combined: result.detections,
            }),
            outcome: "LIVE",
            latencyMs: result.stageStats.latencyMs,
            outputGuard: direction === "output" ? JSON.stringify({ direction }) : null,
          },
        });
      } catch (e) {
        // Swallow persistence errors — live runner result is still useful even if save fails.
        logger.error("pii-guard persist failed", e, { route: "POST /api/pii-guard" });
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    logger.error("pii-guard processing failed", e, { route: "POST /api/pii-guard" });
    return apiError(request, ErrorCode.INTERNAL_SERVER_ERROR, "PII guard processing failed");
  }
}
