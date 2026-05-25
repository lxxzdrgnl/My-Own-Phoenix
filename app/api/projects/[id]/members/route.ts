import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

// GET — list members (any member)
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member) {
    return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ items: members, currentRole: member.role, nextCursor: null });
});

// PUT — update member role (owner only)
export const PUT = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const { userId, role } = await req.json();
  if (!userId || !["editor", "viewer"].includes(role)) {
    return apiError(req, ErrorCode.BAD_REQUEST, "userId and role (editor|viewer) required");
  }

  await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role },
  });
  return NextResponse.json({ ok: true });
});

// DELETE — remove member (owner only, cannot remove self)
export const DELETE = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const { userId } = await req.json();
  if (userId === uid) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Cannot remove yourself");
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
  return NextResponse.json({ ok: true });
});

// PATCH — transfer ownership (owner only)
export const PATCH = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const { targetUserId, confirmProjectName } = await req.json();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.name !== confirmProjectName) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Project name confirmation does not match");
  }

  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!target) {
    return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Target user is not a member");
  }

  await prisma.$transaction([
    prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: uid } },
      data: { role: "editor" },
    }),
    prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role: "owner" },
    }),
  ]);

  return NextResponse.json({ ok: true });
});
