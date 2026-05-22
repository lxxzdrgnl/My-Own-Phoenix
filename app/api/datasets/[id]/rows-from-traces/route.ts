// app/api/datasets/[id]/rows-from-traces/route.ts
// POST: insert one DatasetRow per (spanId, evalName) diff entry.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { batchInsertRows, updateDatasetRowCount } from "@/lib/dataset-utils";
import { requireProjectMember } from "@/lib/api-helpers";

interface DiffRow {
  spanId: string;
  traceId?: string;
  query: string;
  response: string;
  context?: string;
  evalName: string;
  aiLabel: string;
  aiScore: number;
  humanLabel: string;
  humanScore: number;
}

export const POST = authedHandler(async (
  req: NextRequest,
  uid: string,
  ctx?: { params: Promise<{ id: string }> },
) => {
  if (!ctx) return apiError(req, ErrorCode.BAD_REQUEST, "Missing route context");
  const { id } = await ctx.params;
  const body = (await req.json()) as { rows?: DiffRow[] };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      rows: "rows[] required",
    });
  }

  const ds = await prisma.dataset.findUnique({
    where: { id },
    select: { id: true, projectId: true, rowCount: true },
  });
  if (!ds) return apiError(req, ErrorCode.DATASET_NOT_FOUND, "Dataset not found");

  if (uid !== "internal-service" && ds.projectId) {
    const roleCheck = await requireProjectMember(req, ds.projectId, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const records: Record<string, string>[] = body.rows.map((r) => ({
    query: r.query ?? "",
    context: r.context ?? "",
    response: r.response ?? "",
    expected: r.humanLabel ?? "",
    ai_predicted: r.aiLabel ?? "",
    ai_score: String(r.aiScore ?? ""),
    human_score: String(r.humanScore ?? ""),
    eval_name: r.evalName ?? "",
    source_trace_id: r.traceId ?? "",
    source_span_id: r.spanId ?? "",
  }));

  await batchInsertRows(id, records, ds.rowCount ?? 0);
  await updateDatasetRowCount(id);

  return NextResponse.json({ ok: true, added: records.length });
});
