import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ErrorCode, authedHandler } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";

// GET — 저장된 보고서 버전 목록 (최신 순)
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  const check = await requireProjectMember(req, projectId, uid);
  if (check instanceof NextResponse) return check;
  const items = await prisma.rmfReportVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  return NextResponse.json({ items, nextCursor: null });
});

// POST — 현재 보고서를 버전으로 저장 (스냅샷)
export const POST = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  const check = await requireProjectMember(req, projectId, uid, "editor");
  if (check instanceof NextResponse) return check;

  const body = await req.json().catch(() => ({}));
  if (body.grade === undefined || body.snapshot === undefined) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "grade and snapshot are required");
  }

  try {
    const last = await prisma.rmfReportVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const created = await prisma.rmfReportVersion.create({
      data: {
        projectId,
        version: (last?.version ?? 0) + 1,
        label: body.label ?? null,
        periodFrom: body.periodFrom ? new Date(body.periodFrom) : null,
        periodTo: body.periodTo ? new Date(body.periodTo) : null,
        highImpact: false,
        grade: String(body.grade),
        total: Number(body.total ?? 0),
        snapshot: body.snapshot,
        assessor: body.assessor ?? null,
      },
    });
    return NextResponse.json(created);
  } catch (e) {
    logger.error("rmf-version POST failed", e, { route: "POST /api/projects/[id]/rmf-versions" });
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, e instanceof Error ? e.message : "save failed");
  }
});
