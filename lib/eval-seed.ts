import { prisma } from "@/lib/prisma";
import { BUILT_IN_EVALS, type EvalDefinition } from "./eval-defaults";

let seeded = false;

/**
 * Ensure global built-in evals exist in DB (run once on startup).
 * Creates missing evals, updates description/badgeLabel if empty.
 */
export async function ensureBuiltInEvals() {
  if (seeded) return;
  seeded = true;

  for (const def of BUILT_IN_EVALS) {
    const existing = await prisma.evalPrompt.findFirst({
      where: { name: def.name, OR: [{ projectId: null }, { projectId: "" }] },
    });

    if (existing) {
      if (!existing.description || !existing.badgeLabel) {
        await prisma.evalPrompt.update({
          where: { id: existing.id },
          data: {
            description: existing.description || def.description,
            badgeLabel: existing.badgeLabel || def.badgeLabel,
          },
        });
      }
    } else {
      await createEvalFromDef(def, null);
    }
  }
}

/**
 * Copy global default evals (isCustom=false) into a new project.
 * Reads from DB so user's Global Settings customizations are respected.
 */
export async function seedProjectEvals(projectId: string) {
  const globalDefaults = await prisma.evalPrompt.findMany({
    where: { OR: [{ projectId: null }, { projectId: "" }], isCustom: false },
  });

  for (const eval_ of globalDefaults) {
    const exists = await prisma.evalPrompt.findFirst({
      where: { name: eval_.name, projectId },
    });
    if (exists) continue;

    await prisma.evalPrompt.create({
      data: {
        name: eval_.name,
        projectId,
        evalType: eval_.evalType,
        outputMode: eval_.outputMode,
        template: eval_.template,
        ruleConfig: eval_.ruleConfig,
        badgeLabel: eval_.badgeLabel,
        description: eval_.description,
        isCustom: false,
        model: eval_.model,
      },
    });
  }
}

/** Create an eval prompt from a definition. */
async function createEvalFromDef(def: EvalDefinition, projectId: string | null) {
  return prisma.evalPrompt.create({
    data: {
      name: def.name,
      projectId,
      evalType: def.evalType,
      outputMode: def.outputMode,
      template: def.template,
      ruleConfig: def.ruleConfig ?? "{}",
      badgeLabel: def.badgeLabel,
      description: def.description,
      isCustom: false,
    },
  });
}
