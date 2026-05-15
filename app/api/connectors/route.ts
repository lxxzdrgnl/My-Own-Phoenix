import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

// GET /api/connectors?projectId=xxx — list connectors for a project
export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return apiError(req, ErrorCode.BAD_REQUEST, "projectId is required");
  }

  // Verify membership
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member) {
    return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  }

  // Get connector sessions — consider sessions with lastPingAt > 60s ago as offline
  const cutoff = new Date(Date.now() - 60_000);

  const sessions = await prisma.connectorSession.findMany({
    where: { projectId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { connectedAt: "desc" },
  });

  const connectors = sessions.map((s) => ({
    userId: s.userId,
    userName: s.user.name || s.user.email,
    agentType: s.agentType,
    assistantId: s.assistantId,
    status: s.lastPingAt > cutoff ? "online" : "offline",
    connectedAt: s.connectedAt,
    lastPingAt: s.lastPingAt,
  }));

  return NextResponse.json({ connectors });
});
