import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest) => {
  const project = req.nextUrl.searchParams.get("project");

  // If no project specified, return all configs (for alias lookup)
  if (!project) {
    const configs = await prisma.agentConfig.findMany({ include: { template: true } });
    return NextResponse.json({ configs });
  }

  const config = await prisma.agentConfig.findUnique({ where: { project }, include: { template: true } });
  return NextResponse.json({ config: config ?? null });
});

export const PUT = authedHandler(async (req: NextRequest) => {
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

  const config = await prisma.agentConfig.upsert({
    where: { project },
    update: {
      ...(alias !== undefined && { alias: alias || null }),
      ...(templateId !== undefined && { templateId: templateId || null }),
      ...(agentType !== undefined && { agentType }),
      ...(endpoint !== undefined && { endpoint }),
      ...(assistantId !== undefined && { assistantId }),
    },
    create: {
      project,
      alias: alias || null,
      templateId: templateId || null,
      agentType: agentType ?? "langgraph",
      endpoint: endpoint ?? "http://localhost:2024",
      assistantId: assistantId ?? "agent",
    },
  });

  return NextResponse.json({ config });
});

export const DELETE = authedHandler(async (req: NextRequest) => {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { project: "project query param required" });
  }

  await prisma.agentConfig.deleteMany({ where: { project } });
  return NextResponse.json({ success: true });
});
