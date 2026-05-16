import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMemberByPhoenix } from "@/lib/api-helpers";

export const GET = authedHandler(async (req: NextRequest) => {
  const project = req.nextUrl.searchParams.get("project");

  // If no project specified, return all configs (for alias lookup)
  if (!project) {
    const configs = await prisma.agentConfig.findMany({ include: { template: true } });
    return NextResponse.json({ configs });
  }

  const config = await prisma.agentConfig.findUnique({ where: { projectName: project }, include: { template: true } });
  return NextResponse.json({ config: config ?? null });
});

export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const body = await req.json();
  const { project, alias, templateId, agentType, endpoint, assistantId } = body as {
    project: string;
    alias?: string;
    templateId?: string | null;
    agentType?: string;
    endpoint?: string;
    assistantId?: string;
  };

  if (!project) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { project: "project is required" });
  }

  if (uid !== "internal-service") {
    const roleCheck = await requireProjectMemberByPhoenix(req, project, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const config = await prisma.agentConfig.upsert({
    where: { projectName: project },
    update: {
      ...(alias !== undefined && { alias: alias || null }),
      ...(templateId !== undefined && { templateId: templateId || null }),
      ...(agentType !== undefined && { agentType }),
      ...(endpoint !== undefined && { endpoint }),
      ...(assistantId !== undefined && { assistantId }),
    },
    create: {
      projectName: project,
      alias: alias || null,
      templateId: templateId || null,
      agentType: agentType ?? "langgraph",
      endpoint: endpoint ?? "http://localhost:2024",
      assistantId: assistantId ?? "agent",
    },
  });

  return NextResponse.json({ config });
});

export const DELETE = authedHandler(async (req: NextRequest, uid: string) => {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { project: "project query param required" });
  }

  if (uid !== "internal-service") {
    const roleCheck = await requireProjectMemberByPhoenix(req, project, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  await prisma.agentConfig.deleteMany({ where: { projectName: project } });
  return NextResponse.json({ success: true });
});
