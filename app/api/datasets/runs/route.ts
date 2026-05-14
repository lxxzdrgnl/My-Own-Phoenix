import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (request: NextRequest) => {
  const datasetId = request.nextUrl.searchParams.get("datasetId");
  if (!datasetId) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { datasetId: "datasetId is required" });

  const runs = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, agentSource, evalNames, status, createdAt
    FROM DatasetRun WHERE datasetId = ${datasetId}
    ORDER BY createdAt DESC
  `;
  return NextResponse.json({ runs });
});

export const POST = authedHandler(async (request: NextRequest) => {
  const { datasetId, agentSource, evalNames } = await request.json();
  if (!datasetId || !agentSource) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "datasetId and agentSource required",
    });
  }

  const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const evalNamesJson = JSON.stringify(evalNames ?? []);
  await prisma.$executeRaw`
    INSERT INTO "DatasetRun" (id, "datasetId", "agentSource", "evalNames", status, "createdAt")
    VALUES (${id}, ${datasetId}, ${agentSource}, ${evalNamesJson}, 'running', CURRENT_TIMESTAMP)
  `;
  return NextResponse.json({ run: { id, datasetId, agentSource, evalNames: evalNames ?? [], status: "running" } }, { status: 201 });
});
