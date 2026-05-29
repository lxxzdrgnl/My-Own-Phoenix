import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ErrorCode, authedHandler } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";

const EMPTY = { highImpact: false, governance: {}, controls: {}, riskItems: {}, notes: {}, assessor: null };

// GET — 프로젝트별 현재 수동 평가(영속). 없으면 기본값.
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  const check = await requireProjectMember(req, projectId, uid);
  if (check instanceof NextResponse) return check;
  const a = await prisma.rmfAssessment.findUnique({ where: { projectId } });
  return NextResponse.json(a ?? { projectId, ...EMPTY });
});

// PUT — 현재 수동 평가 upsert (프로젝트당 1개).
export const PUT = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  const check = await requireProjectMember(req, projectId, uid, "editor");
  if (check instanceof NextResponse) return check;

  const body = await req.json().catch(() => ({}));
  // 부분 업데이트: 전달된 키만 갱신 (입력탭 저장과 AI 피드백 저장이 서로 덮어쓰지 않도록)
  const data: Record<string, unknown> = {};
  if ("highImpact" in body) data.highImpact = !!body.highImpact;
  if ("governance" in body) data.governance = body.governance ?? {};
  if ("controls" in body) data.controls = body.controls ?? {};
  if ("riskItems" in body) data.riskItems = body.riskItems ?? {};
  if ("notes" in body) data.notes = body.notes ?? {};
  if ("feedback" in body) data.feedback = body.feedback ?? null;
  if ("assessor" in body) data.assessor = body.assessor ?? null;
  try {
    const saved = await prisma.rmfAssessment.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
    });
    return NextResponse.json(saved);
  } catch (e) {
    logger.error("rmf-assessment PUT failed", e, { route: "PUT /api/projects/[id]/rmf-assessment" });
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, e instanceof Error ? e.message : "save failed");
  }
});
