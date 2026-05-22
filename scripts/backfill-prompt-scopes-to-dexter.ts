#!/usr/bin/env tsx
/**
 * One-shot backfill: every Phoenix prompt that currently exists with no
 * ProjectPrompt row gets mapped to the dexter project. After this runs the
 * legacy global prompts become visible (only) in dexter's playground.
 *
 * Usage:
 *   DATABASE_URL=… PHOENIX_URL=… npx tsx scripts/backfill-prompt-scopes-to-dexter.ts
 *   # or with bun: bun scripts/backfill-prompt-scopes-to-dexter.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://phoenix:phoenix_dev@localhost:5434/phoenix";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

async function main() {
  const dexter = await prisma.project.findFirst({
    where: { OR: [{ slug: "dexter" }, { name: "dexter" }] },
    select: { id: true, name: true, slug: true },
  });
  if (!dexter) {
    console.error("No project named or slugged 'dexter' found. Create it first.");
    process.exit(1);
  }
  console.log(`Target project: ${dexter.name} (slug=${dexter.slug}, id=${dexter.id})`);

  const res = await fetch(`${PHOENIX}/v1/prompts`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.error(`Phoenix GET /v1/prompts failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { data?: Array<{ name: string }> };
  const names = (data.data ?? []).map((p) => p.name);
  console.log(`Phoenix prompts found: ${names.length}`);

  let inserted = 0;
  let skipped = 0;
  for (const phoenixName of names) {
    const existing = await prisma.projectPrompt.findUnique({
      where: { phoenixName },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.projectPrompt.create({
      data: { projectId: dexter.id, phoenixName },
    });
    inserted++;
    console.log(`  ↳ mapped ${phoenixName} → ${dexter.slug}`);
  }
  console.log(`Done. inserted=${inserted} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
