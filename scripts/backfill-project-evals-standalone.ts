/**
 * Standalone backfill for missing built-in eval templates on existing projects.
 *
 * Self-contained — only depends on @prisma/client. Designed to be docker cp'd into
 * the phoenix-dashboard container and run via tsx, since the deployed image does
 * not include lib/eval-seed.ts (Next.js build output strips unused source).
 *
 * Usage (inside container):
 *   node_modules/.bin/tsx /tmp/backfill-project-evals-standalone.ts --dry-run
 *   node_modules/.bin/tsx /tmp/backfill-project-evals-standalone.ts
 *
 * Safe to re-run: each project + name pair is checked before insert.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://phoenix:phoenix_dev@localhost:5432/phoenix";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[backfill] mode=${dryRun ? "dry-run" : "apply"}`);

  const globals = await prisma.evalPrompt.findMany({
    where: { OR: [{ projectId: null }, { projectId: "" }], isCustom: false },
  });
  const globalNames = globals.map((g) => g.name).sort();
  console.log(`[backfill] ${globals.length} global built-in templates: ${globalNames.join(", ") || "(none)"}`);
  if (globals.length === 0) {
    console.error("[backfill] no global templates found in DB. Hit GET /api/eval-prompts at least once on the server to seed them, then re-run.");
    return;
  }

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
    const missingGlobals = globals.filter((g) => !have.has(g.name));

    if (missingGlobals.length === 0) {
      console.log(`  ok  ${p.name} (${p.slug}) — ${existing.length}/${globalNames.length}`);
      continue;
    }

    touchedProjects += 1;
    totalMissing += missingGlobals.length;
    const sigil = dryRun ? "dry" : "add";
    console.log(
      `  ${sigil} ${p.name} (${p.slug}) — has ${existing.length}, missing ${missingGlobals.length}: ${missingGlobals.map((g) => g.name).join(", ")}`,
    );

    if (!dryRun) {
      for (const g of missingGlobals) {
        await prisma.evalPrompt.create({
          data: {
            name: g.name,
            projectId: p.id,
            evalType: g.evalType,
            outputMode: g.outputMode,
            template: g.template,
            ruleConfig: g.ruleConfig,
            badgeLabel: g.badgeLabel,
            description: g.description,
            isCustom: false,
            model: g.model,
          },
        });
      }
    }
  }

  console.log(
    `\n[backfill] ${dryRun ? "would touch" : "touched"} ${touchedProjects} projects, ${dryRun ? "would add" : "added"} ${totalMissing} eval rows.`,
  );
  if (dryRun) console.log("[backfill] re-run without --dry-run to apply.");
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
