import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { batchInsertRows, updateDatasetRowCount } from "@/lib/dataset-utils";

// GET — paginated rows from DatasetRow table
export const GET = authedHandler(async (request: NextRequest) => {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });

  const page = Math.max(0, parseInt(request.nextUrl.searchParams.get("page") ?? "0"));
  const pageSize = Math.min(500, Math.max(1, parseInt(request.nextUrl.searchParams.get("pageSize") ?? "50")));
  const all = request.nextUrl.searchParams.get("all") === "1";

  const dsMeta = await prisma.$queryRaw<Array<Record<string, string>>>`
    SELECT headers, queryCol, contextCol, evalNames, evalOverrides, rowCount
    FROM Dataset WHERE id = ${id}
  `;
  if (!dsMeta.length) return apiError(request, ErrorCode.DATASET_NOT_FOUND, "Dataset not found");
  const d = dsMeta[0];

  let datasetRows: Array<{ rowIndex: number; data: string }>;
  if (all) {
    datasetRows = await prisma.$queryRaw<Array<{ rowIndex: number; data: string }>>`
      SELECT rowIndex, data FROM DatasetRow WHERE datasetId = ${id} ORDER BY rowIndex ASC
    `;
  } else {
    const offset = page * pageSize;
    datasetRows = await prisma.$queryRaw<Array<{ rowIndex: number; data: string }>>`
      SELECT rowIndex, data FROM DatasetRow WHERE datasetId = ${id}
      ORDER BY rowIndex ASC LIMIT ${pageSize} OFFSET ${offset}
    `;
  }

  const totalResult = await prisma.$queryRaw<[{ c: number }]>`
    SELECT COUNT(*) as c FROM DatasetRow WHERE datasetId = ${id}
  `;
  const total = Number(totalResult[0]?.c ?? 0);

  const rows = datasetRows.map((r) => ({
    ...JSON.parse(r.data),
    _rowIndex: r.rowIndex,
  }));

  return NextResponse.json({
    rows,
    total,
    page,
    pageSize: all ? total : pageSize,
    headers: JSON.parse((d.headers as string) ?? "[]"),
    queryCol: (d.queryCol as string) ?? "",
    contextCol: (d.contextCol as string) ?? "",
    evalNames: JSON.parse((d.evalNames as string) ?? "[]"),
    evalOverrides: JSON.parse((d.evalOverrides as string) ?? "{}"),
  });
});

// PUT — edit a single row by rowIndex
export const PUT = authedHandler(async (request: NextRequest) => {
  const { id, rowIndex, data } = await request.json();
  if (!id || rowIndex === undefined || !data) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "id, rowIndex, and data required",
    });
  }

  const dataStr = JSON.stringify(data);
  await prisma.$executeRaw`
    UPDATE DatasetRow SET data = ${dataStr} WHERE datasetId = ${id} AND rowIndex = ${rowIndex}
  `;
  return NextResponse.json({ ok: true });
});

// DELETE — delete row(s) by rowIndex or rowIndices (batch)
export const DELETE = authedHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { id, rowIndex, rowIndices } = body;
  if (!id) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });

  const indices: number[] = rowIndices ?? (rowIndex !== undefined ? [rowIndex] : []);
  if (indices.length === 0) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { rowIndex: "rowIndex or rowIndices required" });

  // Delete specified rows using parameterized queries
  for (const idx of indices) {
    await prisma.$executeRaw`DELETE FROM DatasetRow WHERE datasetId = ${id} AND rowIndex = ${idx}`;
  }

  // Reindex
  await prisma.$executeRaw`
    UPDATE DatasetRow SET rowIndex = (
      SELECT COUNT(*) FROM DatasetRow AS dr2
      WHERE dr2.datasetId = DatasetRow.datasetId AND dr2.rowIndex < DatasetRow.rowIndex
    ) WHERE datasetId = ${id}
  `;

  await updateDatasetRowCount(id);

  return NextResponse.json({ ok: true, deleted: indices.length });
});

// POST — append rows
export const POST = authedHandler(async (request: NextRequest) => {
  const { id, rows: newRows } = await request.json();
  if (!id || !newRows) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", {
    fields: "id and rows required",
  });

  const maxResult = await prisma.$queryRaw<[{ m: number | null }]>`
    SELECT MAX(rowIndex) as m FROM DatasetRow WHERE datasetId = ${id}
  `;
  const nextIndex = (maxResult[0]?.m ?? -1) + 1;

  await batchInsertRows(id, newRows, nextIndex);
  await updateDatasetRowCount(id);

  return NextResponse.json({ ok: true });
});
