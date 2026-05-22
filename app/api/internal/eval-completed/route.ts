// app/api/internal/eval-completed/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";
import { broadcast, type EvalCompletedMessage } from "@/lib/sse-broadcast";
import { prisma } from "@/lib/prisma";

// Body: { projectIdent, spanId, name, kind }
// projectIdent = DB id OR Phoenix project name (eval-worker passes phoenix name)

export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  if (uid !== "internal-service") {
    return apiError(req, ErrorCode.UNAUTHORIZED, "Internal endpoint");
  }
  const body = (await req.json()) as {
    projectIdent?: string;
    spanId?: string;
    name?: string;
    kind?: "LLM" | "HUMAN";
  };
  const err = validateFields([
    { field: "projectIdent", value: body.projectIdent, required: true },
    { field: "spanId", value: body.spanId, required: true },
    { field: "name", value: body.name, required: true },
    { field: "kind", value: body.kind, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  // Resolve to DB id (broadcast keys by DB id)
  const project = await prisma.project.findFirst({
    where: {
      OR: [
        { id: body.projectIdent! },
        { phoenixProject: body.projectIdent! },
        { slug: body.projectIdent! },
      ],
    },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ ok: true, delivered: 0 });

  const msg: EvalCompletedMessage = {
    type: "eval-completed",
    spanId: body.spanId!,
    name: body.name!,
    kind: body.kind!,
  };
  const delivered = broadcast(project.id, msg);
  return NextResponse.json({ ok: true, delivered });
});
