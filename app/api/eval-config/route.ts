import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";

export const GET = authedHandler(async (request: NextRequest) => {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { projectId: "projectId is required" });
  }

  const configs = await prisma.projectEvalConfig.findMany({
    where: { projectId },
  });

  return NextResponse.json({ configs });
});

export const PUT = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { projectId, evalName, enabled, template } = body as {
    projectId: string;
    evalName: string;
    enabled?: boolean;
    template?: string | null;
  };

  if (!projectId || !evalName) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "projectId and evalName required",
    });
  }

  if (uid !== "internal-service") {
    const roleCheck = await requireProjectMember(request, projectId, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const data: Record<string, unknown> = {};
  if (enabled !== undefined) data.enabled = enabled;
  if (template !== undefined) data.template = template || null;

  const config = await prisma.projectEvalConfig.upsert({
    where: { projectId_evalName: { projectId, evalName } },
    create: { projectId, evalName, enabled: enabled ?? true, template: template || null },
    update: data,
  });

  return NextResponse.json({ config });
});
