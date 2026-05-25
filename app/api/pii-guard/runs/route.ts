import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";

export const GET = authedHandler(async (request: NextRequest, uid: string) => {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { projectId: "projectId is required" });
  }

  if (uid !== "internal-service") {
    const roleCheck = await requireProjectMember(request, projectId, uid);
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const rows = await prisma.piiGuardRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  // Shape rows back into the structure the UI already understands.
  const runs = rows.map((r) => ({
    id: r.externalId || r.id,
    category: r.category,
    input: r.input,
    expected_masked: r.expectedMasked,
    actual_masked: r.actualMasked,
    detections: safeJson(r.detections, { stage1: [], stage2: [], combined: [] }),
    outcome: r.outcome,
    latency_ms: r.latencyMs,
    ...(r.outputGuard ? { output_guard: safeJson(r.outputGuard, null) } : {}),
  }));

  return NextResponse.json({ items: runs, nextCursor: null });
});

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
