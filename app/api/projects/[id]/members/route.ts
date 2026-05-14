import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";

// GET — list members (any member)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member) {
    return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ members, currentRole: member.role });
}

// PUT — update member role (owner only)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
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
}

// DELETE — remove member (owner only, cannot remove self)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const { userId } = await req.json();
  if (userId === auth) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Cannot remove yourself");
  }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
  return NextResponse.json({ ok: true });
}

// PATCH — transfer ownership (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
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
      where: { projectId_userId: { projectId, userId: auth } },
      data: { role: "editor" },
    }),
    prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role: "owner" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
