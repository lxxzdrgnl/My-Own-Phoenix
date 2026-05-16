import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBuiltInEvals } from "@/lib/eval-seed";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (request: NextRequest, uid: string) => {
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

  // Global mode: built-in defaults + user overrides + user's custom evals
  // 1. Get built-in defaults (userId=null, isCustom=false)
  const builtInDefaults = await prisma.evalPrompt.findMany({
    where: { isCustom: false, userId: null, OR: [{ projectId: null }, { projectId: "" }] },
    orderBy: { name: "asc" },
  });

  // 2. Get user's overrides of built-in evals (userId=uid, isCustom=false)
  const userOverrides = await prisma.evalPrompt.findMany({
    where: { isCustom: false, userId: uid, OR: [{ projectId: null }, { projectId: "" }] },
    orderBy: { name: "asc" },
  });

  // 3. Merge: user override wins over built-in default
  const overrideNames = new Set(userOverrides.map(o => o.name));
  const mergedBuiltIns = [
    ...builtInDefaults.filter(d => !overrideNames.has(d.name)),
    ...userOverrides,
  ].sort((a, b) => a.name.localeCompare(b.name));

  // 4. Optionally include user's custom evals
  let customEvals: typeof builtInDefaults = [];
  if (includeGlobalTemplates) {
    customEvals = await prisma.evalPrompt.findMany({
      where: { isCustom: true, userId: uid, OR: [{ projectId: null }, { projectId: "" }] },
      orderBy: { name: "asc" },
    });
  }

  const prompts = [...mergedBuiltIns, ...customEvals];
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

export const PUT = authedHandler(async (request: NextRequest, uid: string) => {
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
  const custom = isCustom ?? false;

  // For global evals (no projectId), find user's own record first
  const userExisting = await prisma.evalPrompt.findFirst({
    where: pid
      ? { name, projectId: pid }
      : { name, userId: uid, OR: [{ projectId: null }, { projectId: "" }] },
  });

  let prompt;
  if (userExisting) {
    // Update user's own record (override or custom)
    prompt = await prisma.evalPrompt.update({
      where: { id: userExisting.id },
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
    // No user record exists — create a user-scoped copy (override for built-in, or new custom)
    prompt = await prisma.evalPrompt.create({
      data: {
        name,
        projectId: pid,
        userId: uid,
        evalType: evalType ?? "llm_prompt",
        outputMode: outputMode ?? "score",
        template: template ?? "",
        ruleConfig: ruleConfig ? JSON.stringify(ruleConfig) : "{}",
        badgeLabel: badgeLabel ?? "",
        isCustom: custom,
        model: body.model ?? "gpt-4o-mini",
      },
    });
  }

  return NextResponse.json({ prompt });
});

export const DELETE = authedHandler(async (request: NextRequest, uid: string) => {
  const name = request.nextUrl.searchParams.get("name");
  const projectId = request.nextUrl.searchParams.get("projectId");
  const reset = request.nextUrl.searchParams.get("reset") === "true";
  if (!name) {
    return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", { name: "name is required" });
  }

  if (reset) {
    // Reset: delete user's override so built-in default shows again
    await prisma.evalPrompt.deleteMany({
      where: { name, userId: uid, isCustom: false, OR: [{ projectId: null }, { projectId: "" }] },
    });
    return NextResponse.json({ ok: true, reset: true });
  }

  // Delete user's own eval (custom or project-scoped)
  const pid = projectId || undefined;
  await prisma.evalPrompt.deleteMany({
    where: { name, userId: uid, ...(pid ? { projectId: pid } : { OR: [{ projectId: null }, { projectId: "" }] }) },
  });
  return NextResponse.json({ ok: true });
});
