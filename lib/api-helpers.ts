import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { apiError, ErrorCode } from "@/lib/api-error";

export async function requireProjectMember(
  req: NextRequest,
  projectId: string,
  userId: string,
  minRole?: "editor" | "owner"
): Promise<{ role: string } | NextResponse> {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  if (minRole === "owner" && member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }
  if (minRole === "editor" && !["owner", "editor"].includes(member.role)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  }
  return { role: member.role };
}

/**
 * Resolve phoenixProject name → DB project ID + check membership.
 */
export async function requireProjectMemberByPhoenix(
  req: NextRequest,
  phoenixProject: string,
  userId: string,
  minRole?: "editor" | "owner"
): Promise<{ role: string; projectId: string } | NextResponse> {
  const project = await prisma.project.findFirst({
    where: { phoenixProject },
    select: { id: true },
  });
  if (!project) return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Project not found");
  const result = await requireProjectMember(req, project.id, userId, minRole);
  if (result instanceof NextResponse) return result;
  return { ...result, projectId: project.id };
}

export async function requireThreadOwner(
  req: NextRequest,
  threadId: string,
  userId: string
) {
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.userId !== userId) {
    return apiError(req, ErrorCode.FORBIDDEN, "Not your thread");
  }
  return thread;
}

export async function requireDatasetAccess(
  req: NextRequest,
  datasetId: string,
  userId: string
) {
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!dataset) return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Dataset not found");
  if (dataset.projectId) {
    const memberCheck = await requireProjectMember(req, dataset.projectId, userId);
    if (memberCheck instanceof NextResponse) return memberCheck;
  }
  return dataset;
}
