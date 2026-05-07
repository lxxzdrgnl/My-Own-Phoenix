import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { batchInsertRunResults } from "@/lib/dataset-utils";

// GET — returns run metadata + results from DatasetRunResult table
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ runId: string }> }) => {
  const { runId } = await params;

  const runRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, datasetId, agentSource, evalNames, status, createdAt
    FROM DatasetRun WHERE id = ${runId}
  `;
  if (!runRows.length) return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Run not found");
  const run = runRows[0];

  // Read results from DatasetRunResult table
  const results = await prisma.$queryRaw<Array<{ rowIdx: number; response: string; query: string; evals: string }>>`
    SELECT rowIdx, response, query, evals FROM DatasetRunResult
    WHERE runId = ${runId} ORDER BY rowIdx ASC
  `;

  const rowResults = results.map(r => ({
    rowIdx: r.rowIdx,
    response: r.response,
    query: r.query,
    evals: JSON.parse(r.evals ?? "{}"),
  }));

  return NextResponse.json({
    ...run,
    evalNames: JSON.parse((run.evalNames as string) ?? "[]"),
    rowResults,
  });
});

// PUT — update run status, evalNames, and/or upsert results
export const PUT = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ runId: string }> }) => {
  const { runId } = await params;
  const body = await req.json();

  // Update run metadata
  if (body.agentSource !== undefined) {
    await prisma.$executeRaw`UPDATE DatasetRun SET agentSource = ${body.agentSource} WHERE id = ${runId}`;
  }
  if (body.status !== undefined) {
    await prisma.$executeRaw`UPDATE DatasetRun SET status = ${body.status} WHERE id = ${runId}`;
  }
  if (body.evalNames !== undefined) {
    await prisma.$executeRaw`UPDATE DatasetRun SET evalNames = ${JSON.stringify(body.evalNames)} WHERE id = ${runId}`;
  }

  // Upsert row results into DatasetRunResult
  if (body.rowResults !== undefined && Array.isArray(body.rowResults)) {
    await prisma.$executeRaw`DELETE FROM DatasetRunResult WHERE runId = ${runId}`;
    await batchInsertRunResults(runId, body.rowResults);
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ runId: string }> }) => {
  const { runId } = await params;

  await prisma.$executeRaw`DELETE FROM DatasetRunResult WHERE runId = ${runId}`;
  await prisma.$executeRaw`DELETE FROM DatasetRun WHERE id = ${runId}`;
  return NextResponse.json({ ok: true });
});
