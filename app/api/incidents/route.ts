import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";

export const GET = authedHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = projectId;

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ incidents });
});

export const POST = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { projectId, title, severity, status } = body;

  if (!projectId || !title || !severity) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "projectId, title, and severity are required",
    });
  }

  if (uid !== "internal-service") {
    const roleCheck = await requireProjectMember(request, projectId, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const incident = await prisma.incident.create({
    data: {
      projectId,
      title,
      severity,
      status: status ?? "OPEN",
    },
  });

  return NextResponse.json({ incident }, { status: 201 });
});

export const PUT = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });
  }

  if (uid !== "internal-service") {
    const incident = await prisma.incident.findUnique({ where: { id }, select: { projectId: true } });
    if (incident?.projectId) {
      const roleCheck = await requireProjectMember(request, incident.projectId, uid, "editor");
      if (roleCheck instanceof NextResponse) return roleCheck;
    }
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.resolvedAt) updateData.resolvedAt = new Date(data.resolvedAt);

  const incident = await prisma.incident.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ incident });
});
