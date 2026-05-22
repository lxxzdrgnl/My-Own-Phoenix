/**
 * One-time seed: import /public/datasets/pii-eval-results.json into the
 * dexter project's PiiGuardRun rows.
 *
 * Designed to run inside the phoenix-dashboard container:
 *   docker cp scripts/seed-pii-runs-dexter.ts phoenix-dashboard:/app/seed-pii-runs-dexter.ts
 *   docker exec -w /app phoenix-dashboard node_modules/.bin/tsx ./seed-pii-runs-dexter.ts --dry-run
 *   docker exec -w /app phoenix-dashboard node_modules/.bin/tsx ./seed-pii-runs-dexter.ts
 *
 * Idempotent: skips rows whose (projectId, externalId) already exist.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";
import path from "path";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://phoenix:phoenix_dev@localhost:5432/phoenix";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

interface RawRow {
  id: string;
  category: string;
  input: string;
  expected_masked: string;
  actual_masked: string;
  detections: unknown;
  outcome: string;
  latency_ms: number;
  output_guard?: unknown;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[seed-pii] mode=${dryRun ? "dry-run" : "apply"}`);

  const dexter = await prisma.project.findFirst({ where: { name: "dexter" }, select: { id: true } });
  if (!dexter) {
    console.error("[seed-pii] dexter project not found");
    process.exit(1);
  }
  console.log(`[seed-pii] dexter projectId=${dexter.id}`);

  const jsonPath = path.resolve("public/datasets/pii-eval-results.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`[seed-pii] static benchmark not found at ${jsonPath}`);
    process.exit(1);
  }
  const raw: RawRow[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`[seed-pii] loaded ${raw.length} rows from ${jsonPath}`);

  const existing = await prisma.piiGuardRun.findMany({
    where: { projectId: dexter.id },
    select: { externalId: true },
  });
  const have = new Set(existing.map((e) => e.externalId).filter(Boolean));
  console.log(`[seed-pii] existing in DB: ${existing.length} (matching by externalId: ${have.size})`);

  let inserted = 0;
  let skipped = 0;

  for (const r of raw) {
    if (have.has(r.id)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      inserted += 1;
      continue;
    }
    await prisma.piiGuardRun.create({
      data: {
        projectId: dexter.id,
        externalId: r.id,
        category: r.category ?? "",
        input: r.input,
        expectedMasked: r.expected_masked ?? "",
        actualMasked: r.actual_masked ?? "",
        detections: JSON.stringify(r.detections ?? { stage1: [], stage2: [], combined: [] }),
        outcome: r.outcome,
        latencyMs: r.latency_ms ?? 0,
        outputGuard: r.output_guard ? JSON.stringify(r.output_guard) : null,
      },
    });
    inserted += 1;
  }

  console.log(
    `[seed-pii] ${dryRun ? "would insert" : "inserted"} ${inserted}, skipped ${skipped} (already present)`,
  );
  if (dryRun) console.log("[seed-pii] re-run without --dry-run to apply.");
}

main()
  .catch((err) => {
    console.error("[seed-pii] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
