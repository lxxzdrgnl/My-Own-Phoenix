import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";
import { generateId } from "@/lib/utils";

export const GET = authedHandler(async (request: NextRequest) => {
  const datasetId = request.nextUrl.searchParams.get("datasetId");
  if (!datasetId) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { datasetId: "datasetId is required" });

  const runs = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, "agentSource", "evalNames", status, "createdAt"
    FROM "DatasetRun" WHERE "datasetId" = ${datasetId}
    ORDER BY "createdAt" DESC
  `;
  return NextResponse.json({ items: runs, nextCursor: null });
});

export const POST = authedHandler(async (request: NextRequest, uid: string) => {
  const { datasetId, agentSource, evalNames } = await request.json();
  if (!datasetId || !agentSource) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "datasetId and agentSource required",
    });
  }

  if (uid !== "internal-service") {
    const dataset = await prisma.dataset.findUnique({ where: { id: datasetId }, select: { projectId: true } });
    if (dataset?.projectId) {
      const roleCheck = await requireProjectMember(request, dataset.projectId, uid, "editor");
      if (roleCheck instanceof NextResponse) return roleCheck;
    }
  }

  const id = generateId("run", "_");
  const evalNamesJson = JSON.stringify(evalNames ?? []);
  await prisma.$executeRaw`
    INSERT INTO "DatasetRun" (id, "datasetId", "agentSource", "evalNames", status, "createdAt")
    VALUES (${id}, ${datasetId}, ${agentSource}, ${evalNamesJson}, 'running', CURRENT_TIMESTAMP)
  `;
  return NextResponse.json({ run: { id, datasetId, agentSource, evalNames: evalNames ?? [], status: "running" } }, { status: 201 });
});
