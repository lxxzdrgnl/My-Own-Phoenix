import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBuiltInEvals } from "@/lib/eval-seed";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (request: NextRequest) => {
  await ensureBuiltInEvals();
  const projectId = request.nextUrl.searchParams.get("projectId");

  // Return global (built-in) prompts + project-specific custom prompts
  const prompts = await prisma.evalPrompt.findMany({
    where: {
      OR: [
        { projectId: null },
        { projectId: "" },
        ...(projectId ? [{ projectId }] : []),
      ],
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ prompts });
});

export const PUT = authedHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { name, projectId, evalType, outputMode, template, ruleConfig, badgeLabel, isCustom } = body as {
    name: string;
    projectId?: string | null;
    evalType?: string;
    outputMode?: string;
    template?: string;
    ruleConfig?: unknown;
    badgeLabel?: string;
    isCustom?: boolean;
  };

  if (!name) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { name: "name is required" });
  }

  const pid = projectId || null;

  // Prisma can't use nullable fields in composite unique where, so manual find + upsert
  // Also match legacy empty-string projectId
  const existing = await prisma.evalPrompt.findFirst({
    where: pid
      ? { name, projectId: pid }
      : { name, OR: [{ projectId: null }, { projectId: "" }] },
  });

  let prompt;
  if (existing) {
    prompt = await prisma.evalPrompt.update({
      where: { id: existing.id },
      data: {
        ...(evalType !== undefined && { evalType }),
        ...(outputMode !== undefined && { outputMode }),
        ...(template !== undefined && { template }),
        ...(ruleConfig !== undefined && { ruleConfig: JSON.stringify(ruleConfig) }),
        ...(badgeLabel !== undefined && { badgeLabel }),
        ...(isCustom !== undefined && { isCustom }),
      },
    });
  } else {
    prompt = await prisma.evalPrompt.create({
      data: {
        name,
        projectId: pid,
        evalType: evalType ?? "llm_prompt",
        outputMode: outputMode ?? "score",
        template: template ?? "",
        ruleConfig: ruleConfig ? JSON.stringify(ruleConfig) : "{}",
        badgeLabel: badgeLabel ?? "",
        isCustom: isCustom ?? false,
      },
    });
  }

  return NextResponse.json({ prompt });
});

export const DELETE = authedHandler(async (request: NextRequest) => {
  const name = request.nextUrl.searchParams.get("name");
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!name) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { name: "name is required" });
  }
  // Try exact projectId match first, then fallback to null/empty (legacy data)
  const deleted = await prisma.evalPrompt.deleteMany({
    where: { name, projectId: projectId || undefined },
  });
  if (deleted.count === 0) {
    await prisma.evalPrompt.deleteMany({
      where: { name, OR: [{ projectId: null }, { projectId: "" }] },
    });
  }
  return NextResponse.json({ ok: true });
});
