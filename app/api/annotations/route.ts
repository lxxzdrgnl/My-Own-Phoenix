import { NextRequest, NextResponse } from "next/server";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export const POST = authedHandler(async (req: NextRequest) => {
  const { spanId, name, label, score, explanation } = (await req.json()) as {
    spanId: string;
    name: string;
    label: string;
    score: number;
    explanation?: string;
  };

  const err = validateFields([
    { field: "spanId", value: spanId, required: true },
    { field: "name", value: name, required: true },
    { field: "label", value: label, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const res = await fetch(`${PHOENIX}/v1/span_annotations?sync=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [{
        span_id: spanId,
        name,
        annotator_kind: "HUMAN",
        result: { label, score: score ?? 0, explanation: explanation ?? "" },
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
