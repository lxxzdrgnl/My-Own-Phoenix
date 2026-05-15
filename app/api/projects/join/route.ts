import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";

// POST — submit join request with invite code
export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const { allowed } = rateLimit(`join:${uid}`, 5, 60_000);
  if (!allowed) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Too many join attempts. Please try again later.");
  }

  const { code } = await req.json();
  if (!code?.trim()) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Invite code is required");
  }

  // Find the invite code
  const inviteCode = await prisma.projectInviteCode.findUnique({
    where: { code: code.trim() },
    include: { project: { select: { id: true, name: true, slug: true } } },
  });

  if (!inviteCode) {
    return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Invalid invite code");
  }

  // Check expiry
  if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Invite code has expired");
  }

  // Check usage limit
  if (inviteCode.maxUses > 0 && inviteCode.useCount >= inviteCode.maxUses) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Invite code has reached maximum uses");
  }

  // Check if already a member
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: inviteCode.projectId, userId: uid } },
  });
  if (existing) {
    return apiError(req, ErrorCode.BAD_REQUEST, "You are already a member of this project");
  }

  // Check if already has pending request
  const existingRequest = await prisma.projectJoinRequest.findUnique({
    where: { projectId_userId: { projectId: inviteCode.projectId, userId: uid } },
  });
  if (existingRequest) {
    return NextResponse.json({
      project: inviteCode.project,
      status: existingRequest.status,
    });
  }

  // Create join request + increment use count
  const [joinRequest] = await prisma.$transaction([
    prisma.projectJoinRequest.create({
      data: {
        projectId: inviteCode.projectId,
        userId: uid,
        codeId: inviteCode.id,
        status: "pending",
      },
    }),
    prisma.projectInviteCode.update({
      where: { id: inviteCode.id },
      data: { useCount: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({
    project: inviteCode.project,
    status: "pending",
  }, { status: 201 });
});
