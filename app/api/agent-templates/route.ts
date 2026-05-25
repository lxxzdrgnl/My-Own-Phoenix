import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const templates = await prisma.agentTemplate.findMany({
    where: { userId: uid },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items: templates, nextCursor: null });
});

export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const body = await req.json();
  const { name, description, agentType, endpoint, assistantId, evalPrompts } = body;

  if (!name) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { name: "name is required" });
  }

  const template = await prisma.agentTemplate.create({
    data: {
      name,
      description: description ?? "",
      agentType: agentType ?? "langgraph",
      endpoint: endpoint ?? "http://localhost:2024",
      assistantId: assistantId ?? "agent",
      evalPrompts: evalPrompts ? JSON.stringify(evalPrompts) : "{}",
      userId: uid,
    },
  });

  return NextResponse.json({ template });
});

export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const body = await req.json();
  const { id, name, description, agentType, endpoint, assistantId, evalPrompts } = body;

  if (!id) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });
  }

  const existing = await prisma.agentTemplate.findFirst({
    where: { id, userId: uid },
  });
  if (!existing) {
    return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Template not found");
  }

  const template = await prisma.agentTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(agentType !== undefined && { agentType }),
      ...(endpoint !== undefined && { endpoint }),
      ...(assistantId !== undefined && { assistantId }),
      ...(evalPrompts !== undefined && { evalPrompts: JSON.stringify(evalPrompts) }),
    },
  });

  return NextResponse.json({ template });
});

export const DELETE = authedHandler(async (req: NextRequest, uid: string) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { id: "id is required" });
  }

  const existing = await prisma.agentTemplate.findFirst({
    where: { id, userId: uid },
  });
  if (!existing) {
    return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Template not found");
  }

  await prisma.agentTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
