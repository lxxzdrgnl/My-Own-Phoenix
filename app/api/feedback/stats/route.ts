import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

/**
 * GET /api/feedback/stats?project=X
 *
 * Returns:
 * - totalResponses: assistant messages in project
 * - totalFeedback: messages with any feedback
 * - downCount: messages with "down" feedback
 */
export const GET = authedHandler(async (request: NextRequest) => {
  const project = request.nextUrl.searchParams.get("project");
  if (!project) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { project: "project is required" });
  }

  const totalResponses = await prisma.message.count({
    where: { role: "assistant", thread: { project } },
  });

  const allFeedback = await prisma.messageFeedback.findMany({
    where: { message: { role: "assistant", thread: { project } } },
    select: { value: true },
  });

  return NextResponse.json({
    totalResponses,
    totalFeedback: allFeedback.length,
    downCount: allFeedback.filter((f) => f.value === "down").length,
  });
});
