import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";

// DELETE — 저장된 보고서 버전 삭제
export const DELETE = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string; versionId: string }> }) => {
  const { id: projectId, versionId } = await params;
  const check = await requireProjectMember(req, projectId, uid, "editor");
  if (check instanceof NextResponse) return check;
  await prisma.rmfReportVersion.deleteMany({ where: { id: versionId, projectId } });
  return NextResponse.json({ ok: true });
});
