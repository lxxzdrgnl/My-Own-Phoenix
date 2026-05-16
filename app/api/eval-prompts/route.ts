import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBuiltInEvals } from "@/lib/eval-seed";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (request: NextRequest) => {
  await ensureBuiltInEvals();
  const projectId = request.nextUrl.searchParams.get("projectId");
  const includeGlobalTemplates = request.nextUrl.searchParams.get("includeGlobalTemplates") === "true";

  if (projectId) {
    // Project mode: only this project's evals (already seeded on creation)
    const prompts = await prisma.evalPrompt.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ prompts });
  }

  // Global mode: all global evals (built-in + optionally custom templates)
  const conditions: any[] = [
    { isCustom: false, OR: [{ projectId: null }, { projectId: "" }] },
  ];
  if (includeGlobalTemplates) {
    conditions.push({ isCustom: true, OR: [{ projectId: null }, { projectId: "" }] });
  }

  const prompts = await prisma.evalPrompt.findMany({
    where: { OR: conditions },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ prompts });
});

// POST — import global template(s) into a project
export const POST = authedHandler(async (request: NextRequest) => {
  const { names, projectId } = await request.json() as { names: string[]; projectId: string };
  if (!projectId || !names?.length) {
    return apiError(request, ErrorCode.BAD_REQUEST, "projectId and names[] are required");
  }

  // Find global templates by name
  const globals = await prisma.evalPrompt.findMany({
    where: { name: { in: names }, OR: [{ projectId: null }, { projectId: "" }] },
  });

  const importedNames: string[] = [];
  for (const g of globals) {
    let finalName = g.name;
    let suffix = 2;
    while (await prisma.evalPrompt.findFirst({ where: { name: finalName, projectId } })) {
      finalName = `${g.name}_${suffix}`;
      suffix++;
    }

    await prisma.evalPrompt.create({
      data: {
        name: finalName,
        projectId,
        evalType: g.evalType,
        outputMode: g.outputMode,
        template: g.template,
        ruleConfig: g.ruleConfig,
        badgeLabel: g.badgeLabel,
        isCustom: true,
        model: g.model,
      },
    });
    importedNames.push(finalName);
  }

  return NextResponse.json({ imported: importedNames.length, names: importedNames });
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
