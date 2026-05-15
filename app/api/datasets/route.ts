import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { batchInsertRows } from "@/lib/dataset-utils";

export const GET = authedHandler(async (request: NextRequest) => {
  const projectId = request.nextUrl.searchParams.get("projectId");

  let datasets: Array<Record<string, unknown>>;
  if (projectId) {
    datasets = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, name, "fileName", headers, "queryCol", "contextCol", "rowCount", "createdAt", "updatedAt"
      FROM "Dataset" WHERE "projectId" = ${projectId} ORDER BY "updatedAt" DESC
    `;
  } else {
    datasets = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, name, "fileName", headers, "queryCol", "contextCol", "rowCount", "createdAt", "updatedAt"
      FROM "Dataset" ORDER BY "updatedAt" DESC
    `;
  }
  return NextResponse.json({ datasets });
});

export const POST = authedHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { name, fileName, headers, queryCol, contextCol, rows, projectId } = body;

  if (!name) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { name: "name is required" });
  }

  const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const rowsArr: Record<string, string>[] = rows ?? [];

  await prisma.$executeRaw`
    INSERT INTO "Dataset" (id, name, "fileName", headers, "queryCol", "contextCol", "evalNames", "evalOverrides", "rowCount", "projectId", "createdAt", "updatedAt")
    VALUES (${id}, ${name}, ${fileName ?? ""}, ${JSON.stringify(headers ?? [])}, ${queryCol ?? ""}, ${contextCol ?? ""}, '[]', '{}', ${rowsArr.length}, ${projectId ?? null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;

  await batchInsertRows(id, rowsArr, 0);

  return NextResponse.json({ dataset: { id, name } }, { status: 201 });
});

export const PUT = authedHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });
  }

  const ALLOWED_FIELDS: Record<string, string> = {
    name: "name",
    projectId: '"projectId"',
    queryCol: '"queryCol"',
    contextCol: '"contextCol"',
    evalNames: '"evalNames"',
    evalOverrides: '"evalOverrides"',
    headers: "headers",
  };

  const JSON_FIELDS = new Set(["evalNames", "evalOverrides", "headers"]);

  const setParts: string[] = [`"updatedAt" = CURRENT_TIMESTAMP`];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (key === "rows") continue;
    const col = ALLOWED_FIELDS[key];
    if (!col) continue;
    setParts.push(`${col} = $${values.length + 1}`);
    if (JSON_FIELDS.has(key)) {
      values.push(JSON.stringify(val));
    } else if (key === "projectId") {
      values.push(val || null);
    } else {
      values.push(val);
    }
  }

  if (data.rows !== undefined && Array.isArray(data.rows)) {
    const rowsArr: Record<string, string>[] = data.rows;
    const maxResult = await prisma.$queryRaw<[{ m: number | null }]>`
      SELECT MAX("rowIndex") as m FROM "DatasetRow" WHERE "datasetId" = ${id}
    `;
    const nextIndex = (maxResult[0]?.m ?? -1) + 1;

    await batchInsertRows(id, rowsArr, nextIndex);

    const countResult = await prisma.$queryRaw<[{ c: number }]>`
      SELECT COUNT(*) as c FROM "DatasetRow" WHERE "datasetId" = ${id}
    `;
    setParts.push(`"rowCount" = $${values.length + 1}`);
    values.push(Number(countResult[0]?.c ?? 0));
  }

  if (setParts.length > 1) {
    values.push(id);
    await prisma.$queryRawUnsafe(
      `UPDATE "Dataset" SET ${setParts.join(", ")} WHERE id = $${values.length}`,
      ...values
    );
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = authedHandler(async (request: NextRequest) => {
  const { id } = await request.json();
  if (!id) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });
  }
  await prisma.$executeRaw`DELETE FROM "DatasetRunResult" WHERE "runId" IN (SELECT id FROM "DatasetRun" WHERE "datasetId" = ${id})`;
  await prisma.$executeRaw`DELETE FROM "DatasetRun" WHERE "datasetId" = ${id}`;
  await prisma.$executeRaw`DELETE FROM "DatasetRow" WHERE "datasetId" = ${id}`;
  await prisma.$executeRaw`DELETE FROM "Dataset" WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
});
