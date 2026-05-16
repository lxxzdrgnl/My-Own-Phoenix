import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";

export const GET = authedHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = projectId;

  const risks = await prisma.riskItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ risks });
});

export const POST = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { projectId, name, system, riskLevel, mitigation, status, assignee, dueDate } = body;

  if (!projectId || !name || !system || !riskLevel || !mitigation) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "projectId, name, system, riskLevel, and mitigation are required",
    });
  }

  if (uid !== "internal-service") {
    const roleCheck = await requireProjectMember(request, projectId, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const risk = await prisma.riskItem.create({
    data: {
      projectId,
      name,
      system,
      riskLevel,
      mitigation,
      status: status ?? "OPEN",
      assignee: assignee ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  return NextResponse.json({ risk }, { status: 201 });
});

export const PUT = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });
  }

  if (uid !== "internal-service") {
    const risk = await prisma.riskItem.findUnique({ where: { id }, select: { projectId: true } });
    if (risk?.projectId) {
      const roleCheck = await requireProjectMember(request, risk.projectId, uid, "editor");
      if (roleCheck instanceof NextResponse) return roleCheck;
    }
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
  if (data.resolvedAt) updateData.resolvedAt = new Date(data.resolvedAt);

  const risk = await prisma.riskItem.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ risk });
});

export const DELETE = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });
  }

  if (uid !== "internal-service") {
    const risk = await prisma.riskItem.findUnique({ where: { id }, select: { projectId: true } });
    if (risk?.projectId) {
      const roleCheck = await requireProjectMember(request, risk.projectId, uid, "editor");
      if (roleCheck instanceof NextResponse) return roleCheck;
    }
  }

  await prisma.riskItem.delete({ where: { id } });

  return NextResponse.json({ ok: true });
});
