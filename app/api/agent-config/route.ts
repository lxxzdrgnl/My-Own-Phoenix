import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMemberByPhoenix } from "@/lib/api-helpers";

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const project = req.nextUrl.searchParams.get("project");

  // If no project specified, return only configs the user is a member of
  if (!project) {
    if (uid === "internal-service") {
      const configs = await prisma.agentConfig.findMany({ include: { template: true } });
      return NextResponse.json({ items: configs, nextCursor: null });
    }
    // Filter to projects where the user is a member
    const memberships = await prisma.projectMember.findMany({
      where: { userId: uid },
      select: { project: { select: { phoenixProject: true } } },
    });
    const phoenixProjects = memberships
      .map((m) => m.project?.phoenixProject)
      .filter((p): p is string => !!p);
    const configs = await prisma.agentConfig.findMany({
      where: { projectName: { in: phoenixProjects } },
      include: { template: true },
    });
    return NextResponse.json({ items: configs, nextCursor: null });
  }

  const roleCheck = await requireProjectMemberByPhoenix(req, project, uid);
  if (roleCheck instanceof NextResponse) return roleCheck;

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
