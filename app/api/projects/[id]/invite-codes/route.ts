import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { randomBytes } from "crypto";

function generateCode(): string {
  return randomBytes(16).toString("base64url").slice(0, 22);
}

// GET — list invite codes (owner only)
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || (member.role !== "owner" && member.role !== "editor")) {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner or editor access required");
  }

  try {
    const codes = await prisma.projectInviteCode.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items: codes, nextCursor: null });
  } catch (e) {
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, "Internal error");
  }
});

// POST — generate invite code (owner only)
export const POST = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || (member.role !== "owner" && member.role !== "editor")) {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner or editor access required");
  }

  const { role = "editor", maxUses = 0, expiresInDays } = await req.json();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null;

  try {
    const code = await prisma.projectInviteCode.create({
      data: {
        projectId,
        code: generateCode(),
        role,
        maxUses,
        expiresAt,
        createdBy: uid,
      },
    });

    return NextResponse.json({ code }, { status: 201 });
  } catch (e) {
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, "Internal error");
  }
});

// DELETE — delete invite code (owner only)
export const DELETE = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || (member.role !== "owner" && member.role !== "editor")) {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner or editor access required");
  }

  const { codeId } = await req.json();
  await prisma.projectInviteCode.delete({ where: { id: codeId } });
  return NextResponse.json({ ok: true });
});
