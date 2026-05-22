import { NextRequest, NextResponse } from "next/server";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";
import { deleteSpanAnnotation } from "@/lib/phoenix-db";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const { spanId, name, label, score, explanation, projectId, annotatorKind, identifier } =
    (await req.json()) as {
      spanId: string;
      name: string;
      label?: string;
      score?: number;
      explanation?: string;
      projectId?: string;
      /** "HUMAN" (default) creates user annotation; "LLM" overwrites AI annotation. */
      annotatorKind?: "HUMAN" | "LLM";
      /** Phoenix unique key segment; defaults derived from annotatorKind. */
      identifier?: string;
    };

  const kind = annotatorKind === "LLM" ? "LLM" : "HUMAN";
  const ident = identifier ?? (kind === "LLM" ? "" : "human");

  if (projectId && uid !== "internal-service") {
    const roleCheck = await requireProjectMember(req, projectId, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const err = validateFields([
    { field: "spanId", value: spanId, required: true },
    { field: "name", value: name, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const res = await fetch(`${PHOENIX}/v1/span_annotations?sync=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [{
        span_id: spanId,
        name,
        annotator_kind: kind,
        // CRITICAL: Phoenix's unique constraint is (name, span_rowid, identifier)
        // NOT (name, span_rowid, annotator_kind). Distinct identifiers per
        // annotator role keep HUMAN ratings from overwriting LLM eval rows.
        identifier: ident,
        result: { label: label ?? "", score: score ?? 0, explanation: explanation ?? "" },
      }],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return apiError(req, ErrorCode.PHOENIX_ERROR, data.detail ?? `Phoenix error ${res.status}`);
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = authedHandler(async (req: NextRequest) => {
  const spanId = req.nextUrl.searchParams.get("spanId");
  const name = req.nextUrl.searchParams.get("name");
  const kindRaw = req.nextUrl.searchParams.get("kind") ?? "HUMAN";

  if (!spanId || !name) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      spanId: spanId ? undefined : "required",
      name: name ? undefined : "required",
    });
  }

  const kind = kindRaw === "LLM" || kindRaw === "CODE" ? kindRaw : "HUMAN";

  // Direct DB DELETE — Phoenix's REST DELETE is project + time-windowed and
  // can't narrow to one span. We target (span_id, name, kind) precisely.
  try {
    const deleted = await deleteSpanAnnotation(spanId, name, kind);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError(req, ErrorCode.DATABASE_ERROR, `DB delete failed: ${msg}`);
  }
});
