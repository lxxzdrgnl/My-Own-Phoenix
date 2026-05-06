import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Batch-insert rows into DatasetRow table using parameterized queries.
 * Safe from SQL injection — uses Prisma tagged templates.
 */
export async function batchInsertRows(
  datasetId: string,
  rows: Record<string, string>[],
  startIndex: number,
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    for (let j = 0; j < chunk.length; j++) {
      const rowId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${startIndex + i + j}`;
      const data = JSON.stringify(chunk[j]);
      await prisma.$executeRaw`
        INSERT INTO DatasetRow (id, datasetId, rowIndex, data)
        VALUES (${rowId}, ${datasetId}, ${startIndex + i + j}, ${data})
      `;
    }
  }
}

/**
 * Batch-insert run results into DatasetRunResult using parameterized queries.
 */
export async function batchInsertRunResults(
  runId: string,
  results: Array<{ rowIdx: number; response: string; query?: string; evals: Record<string, unknown> }>,
): Promise<void> {
  for (const r of results) {
    const id = `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${r.rowIdx}`;
    const response = r.response ?? "";
    const query = r.query ?? "";
    const evals = JSON.stringify(r.evals ?? {});
    await prisma.$executeRaw`
      INSERT INTO DatasetRunResult (id, runId, rowIdx, response, query, evals)
      VALUES (${id}, ${runId}, ${r.rowIdx}, ${response}, ${query}, ${evals})
    `;
  }
}

/**
 * Update dataset rowCount from DatasetRow table.
 */
export async function updateDatasetRowCount(datasetId: string): Promise<void> {
  const result = await prisma.$queryRaw<[{ c: number }]>`
    SELECT COUNT(*) as c FROM DatasetRow WHERE datasetId = ${datasetId}
  `;
  const count = Number(result[0]?.c ?? 0);
  await prisma.$executeRaw`
    UPDATE Dataset SET rowCount = ${count}, updatedAt = CURRENT_TIMESTAMP WHERE id = ${datasetId}
  `;
}
