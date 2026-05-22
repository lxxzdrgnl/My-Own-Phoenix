/**
 * Backfill missing built-in eval templates for existing projects.
 *
 * Why: before app/api/projects/route.ts started calling ensureBuiltInEvals()
 * before seedProjectEvals(), a project created on a cold server (before any
 * GET /api/eval-prompts seeded the globals) ended up with zero eval prompts.
 *
 * Usage:
 *   npx tsx scripts/backfill-project-evals.ts --dry-run   # show what would change
 *   npx tsx scripts/backfill-project-evals.ts             # actually backfill
 *
 * Safe to run repeatedly: seedProjectEvals() already checks per-eval existence
 * and skips duplicates.
 */

import { prisma } from "../lib/prisma";
import { ensureBuiltInEvals, seedProjectEvals } from "../lib/eval-seed";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[backfill] mode=${dryRun ? "dry-run" : "apply"}`);

  // Ensure global templates exist in DB first (no-op if already seeded).
  if (!dryRun) {
    await ensureBuiltInEvals();
  }

  const globals = await prisma.evalPrompt.findMany({
    where: { OR: [{ projectId: null }, { projectId: "" }], isCustom: false },
    select: { name: true },
  });
  const globalNames = globals.map((g) => g.name).sort();
  console.log(`[backfill] ${globals.length} global built-in templates: ${globalNames.join(", ")}`);

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[backfill] ${projects.length} projects total\n`);

  let totalMissing = 0;
  let touchedProjects = 0;

  for (const p of projects) {
    const existing = await prisma.evalPrompt.findMany({
      where: { projectId: p.id },
      select: { name: true },
    });
    const have = new Set(existing.map((e) => e.name));
    const missing = globalNames.filter((n) => !have.has(n));

    if (missing.length === 0) {
      console.log(`  ✓ ${p.name} (${p.slug}) — ${existing.length}/${globalNames.length}, no action`);
      continue;
    }

    touchedProjects += 1;
    totalMissing += missing.length;
    console.log(`  ${dryRun ? "·" : "+"} ${p.name} (${p.slug}) — has ${existing.length}, missing ${missing.length}: ${missing.join(", ")}`);

    if (!dryRun) {
      await seedProjectEvals(p.id);
    }
  }

  console.log(
    `\n[backfill] ${dryRun ? "would touch" : "touched"} ${touchedProjects} projects, ${dryRun ? "would add" : "added"} ${totalMissing} eval rows total.`,
  );

  if (dryRun) {
    console.log("[backfill] re-run without --dry-run to apply.");
  }
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
