import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";

// GET — list pending join requests (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const requests = await prisma.projectJoinRequest.findMany({
    where: { projectId, status: "pending" },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ requests });
}

// PUT — approve or reject a join request (owner only)
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

  const { requestId, action } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return apiError(req, ErrorCode.BAD_REQUEST, "requestId and action (approve|reject) required");
  }

  const joinRequest = await prisma.projectJoinRequest.findUnique({
    where: { id: requestId },
    include: { code: true },
  });
  if (!joinRequest || joinRequest.projectId !== projectId) {
    return apiError(req, ErrorCode.NOT_FOUND, "Request not found");
  }

  if (action === "approve") {
    await prisma.$transaction([
      prisma.projectMember.create({
        data: {
          projectId,
          userId: joinRequest.userId,
          role: joinRequest.code.role,
        },
      }),
      prisma.projectJoinRequest.update({
        where: { id: requestId },
        data: { status: "approved" },
      }),
    ]);
  } else {
    await prisma.projectJoinRequest.update({
      where: { id: requestId },
      data: { status: "rejected" },
    });
  }

  return NextResponse.json({ ok: true });
}
