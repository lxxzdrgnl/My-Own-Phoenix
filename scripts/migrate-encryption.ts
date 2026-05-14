/**
 * Re-encrypt LlmProvider API keys from old format (3-part, hardcoded salt)
 * to new format (4-part, random salt per encryption).
 *
 * Usage: DATABASE_URL="postgresql://rheon:localdev@localhost:5432/phoenix" npx tsx scripts/migrate-encryption.ts
 *
 * Idempotent — skips keys already in 4-part format.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt, decrypt } from "../lib/crypto";

const connectionString = process.env.DATABASE_URL || "postgresql://rheon:localdev@localhost:5432/phoenix";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const providers = await prisma.llmProvider.findMany();
  console.log(`Found ${providers.length} LLM providers`);

  let migrated = 0;
  let skipped = 0;

  for (const p of providers) {
    const parts = p.apiKey.split(":");
    if (parts.length === 4) {
      console.log(`  ${p.provider} (${p.id}): already in new format — skipped`);
      skipped++;
      continue;
    }

    try {
      // Decrypt with old format (3-part)
      const plaintext = decrypt(p.apiKey);
      // Re-encrypt with new format (4-part, random salt)
      const newEncrypted = encrypt(plaintext);

      await prisma.llmProvider.update({
        where: { id: p.id },
        data: { apiKey: newEncrypted },
      });

      console.log(`  ${p.provider} (${p.id}): migrated ✓`);
      migrated++;
    } catch (e) {
      console.error(`  ${p.provider} (${p.id}): FAILED — ${e}`);
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
