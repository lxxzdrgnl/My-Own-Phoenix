import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ErrorCode, authedHandler } from "@/lib/api-error";

export const DELETE = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string; providerId: string }> }) => {
  const { id: projectId, providerId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || !["owner", "editor"].includes(member.role)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  }

  await prisma.llmProvider.delete({ where: { id: providerId } });
  return NextResponse.json({ ok: true });
});
