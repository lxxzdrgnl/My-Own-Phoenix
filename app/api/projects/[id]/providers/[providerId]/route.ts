import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; providerId: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId, providerId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || !["owner", "editor"].includes(member.role)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  }

  await prisma.llmProvider.delete({ where: { id: providerId } });
  return NextResponse.json({ ok: true });
}
