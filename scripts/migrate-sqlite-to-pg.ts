/**
 * Migrate data from SQLite (dev.db) to PostgreSQL
 *
 * Usage: DATABASE_URL="postgresql://rheon:localdev@localhost:5432/phoenix" npx tsx scripts/migrate-sqlite-to-pg.ts
 */

import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import path from "path";

const OWNER_EMAIL = "dldydwo9@gmail.com";

const dbPath = path.join(process.cwd(), "prisma", "dev.db");
const sqlite = new Database(dbPath, { readonly: true });

const connectionString = process.env.DATABASE_URL || "postgresql://rheon:localdev@localhost:5432/phoenix";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function main() {
  console.log("Starting SQLite → PostgreSQL migration...");
  console.log(`SQLite: ${dbPath}`);
  console.log(`PostgreSQL: ${connectionString}`);
  console.log(`Owner: ${OWNER_EMAIL}\n`);

  // 1. Users
  const users = sqlite.prepare("SELECT * FROM User").all() as any[];
  console.log(`Migrating ${users.length} users...`);
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { id: u.id, email: u.email, name: u.name, createdAt: new Date(u.createdAt) },
    });
  }

  // Find owner user ID
  const ownerUser = users.find(u => u.email === OWNER_EMAIL);
  if (!ownerUser) {
    console.error(`Owner user ${OWNER_EMAIL} not found in SQLite!`);
    process.exit(1);
  }
  const ownerId = ownerUser.id;
  console.log(`Owner: ${ownerUser.name} (${ownerId})\n`);

  // 2. Create Projects from unique project names in AgentConfig + DashboardLayout + Thread
  const projectNames = new Set<string>();
  const agentConfigs = sqlite.prepare("SELECT * FROM AgentConfig").all() as any[];
  agentConfigs.forEach(ac => projectNames.add(ac.project));
  const dashLayouts = sqlite.prepare("SELECT * FROM DashboardLayout").all() as any[];
  dashLayouts.forEach(dl => projectNames.add(dl.project));
  const threads = sqlite.prepare("SELECT * FROM Thread").all() as any[];
  threads.forEach(t => projectNames.add(t.project));

  // Also add from ProjectEvalConfig
  const evalConfigs = sqlite.prepare("SELECT DISTINCT projectId FROM ProjectEvalConfig").all() as any[];
  evalConfigs.forEach(ec => { if (ec.projectId) projectNames.add(ec.projectId); });

  console.log(`Creating ${projectNames.size} projects: ${[...projectNames].join(", ")}`);
  const projectMap: Record<string, string> = {}; // phoenixName → projectId

  for (const name of projectNames) {
    const slug = generateSlug(name);
    const project = await prisma.project.upsert({
      where: { slug },
      update: {},
      create: {
        name,
        slug,
        phoenixProject: name,
        traceKeyHash: "",
        members: {
          create: { userId: ownerId, role: "owner" },
        },
      },
    });
    projectMap[name] = project.id;
    console.log(`  Project: ${name} → ${slug} (${project.id})`);
  }

  // 3. AgentTemplates
  const templates = sqlite.prepare("SELECT * FROM AgentTemplate").all() as any[];
  console.log(`\nMigrating ${templates.length} agent templates...`);
  for (const t of templates) {
    await prisma.agentTemplate.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        name: t.name,
        userId: ownerId,
        description: t.description || "",
        agentType: t.agentType || "langgraph",
        endpoint: t.endpoint || "http://localhost:2024",
        assistantId: t.assistantId || "agent",
        evalPrompts: t.evalPrompts || "{}",
        createdAt: new Date(t.createdAt),
      },
    });
  }

  // 4. AgentConfig
  console.log(`Migrating ${agentConfigs.length} agent configs...`);
  for (const ac of agentConfigs) {
    const projectId = projectMap[ac.project];
    await prisma.agentConfig.upsert({
      where: { id: ac.id },
      update: {},
      create: {
        id: ac.id,
        project: ac.project,
        alias: ac.alias || null,
        templateId: ac.templateId || null,
        agentType: ac.agentType || "langgraph",
        endpoint: ac.endpoint || "http://localhost:2024",
        assistantId: ac.assistantId || "agent",
        projectId,
      },
    });
  }

  // 5. LlmProvider
  const providers = sqlite.prepare("SELECT * FROM LlmProvider").all() as any[];
  console.log(`Migrating ${providers.length} LLM providers...`);
  for (const p of providers) {
    await prisma.llmProvider.create({
      data: {
        id: p.id,
        provider: p.provider,
        userId: ownerId,
        apiKey: p.apiKey,
        isActive: p.isActive === 1,
        createdAt: new Date(p.createdAt),
      },
    });
  }

  // 6. EvalPrompts
  const evalPrompts = sqlite.prepare("SELECT * FROM EvalPrompt").all() as any[];
  console.log(`Migrating ${evalPrompts.length} eval prompts...`);
  for (const ep of evalPrompts) {
    const projectId = ep.projectId ? (projectMap[ep.projectId] || null) : null;
    await prisma.evalPrompt.create({
      data: {
        id: ep.id,
        name: ep.name,
        projectId,
        evalType: ep.evalType || "llm_prompt",
        outputMode: ep.outputMode || "score",
        template: ep.template || "",
        ruleConfig: ep.ruleConfig || "{}",
        badgeLabel: ep.badgeLabel || "",
        description: ep.description || "",
        isCustom: ep.isCustom === 1,
        model: ep.model || "gpt-4o-mini",
      },
    });
  }

  // 7. ProjectEvalConfig
  const pecs = sqlite.prepare("SELECT * FROM ProjectEvalConfig").all() as any[];
  console.log(`Migrating ${pecs.length} project eval configs...`);
  for (const pec of pecs) {
    const projectId = pec.projectId ? (projectMap[pec.projectId] || null) : null;
    await prisma.projectEvalConfig.create({
      data: {
        id: pec.id,
        projectId,
        evalName: pec.evalName,
        enabled: pec.enabled === 1,
        template: pec.template || null,
      },
    });
  }

  // 8. AppSettings
  const settings = sqlite.prepare("SELECT * FROM AppSettings").all() as any[];
  console.log(`Migrating ${settings.length} app settings...`);
  for (const s of settings) {
    await prisma.appSettings.create({
      data: {
        key: s.key,
        value: s.value,
        userId: ownerId,
      },
    });
  }

  // 9. DashboardLayout
  console.log(`Migrating ${dashLayouts.length} dashboard layouts...`);
  for (const dl of dashLayouts) {
    const projectId = projectMap[dl.project] || null;
    await prisma.dashboardLayout.create({
      data: {
        id: dl.id,
        userId: dl.userId,
        project: dl.project,
        projectId,
        layout: dl.layout,
      },
    });
  }

  // 10. Threads + Messages + MessageFeedback
  console.log(`Migrating ${threads.length} threads...`);
  for (const t of threads) {
    const projectId = projectMap[t.project] || null;
    await prisma.thread.create({
      data: {
        id: t.id,
        userId: t.userId,
        langGraphThreadId: t.langGraphThreadId,
        title: t.title,
        project: t.project,
        projectId,
        createdAt: new Date(t.createdAt),
      },
    });

    const messages = sqlite.prepare("SELECT * FROM Message WHERE threadId = ?").all(t.id) as any[];
    for (const m of messages) {
      await prisma.message.create({
        data: {
          id: m.id,
          threadId: m.threadId,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.createdAt),
        },
      });
    }
  }

  const feedbacks = sqlite.prepare("SELECT * FROM MessageFeedback").all() as any[];
  console.log(`Migrating ${feedbacks.length} message feedbacks...`);
  for (const f of feedbacks) {
    await prisma.messageFeedback.create({
      data: {
        id: f.id,
        messageId: f.messageId,
        userId: f.userId,
        value: f.value,
        createdAt: new Date(f.createdAt),
      },
    });
  }

  // 11. Datasets + DatasetRows + DatasetRuns + DatasetRunResults
  const datasets = sqlite.prepare("SELECT * FROM Dataset").all() as any[];
  console.log(`\nMigrating ${datasets.length} datasets...`);
  for (const ds of datasets) {
    // Assign datasets to the "default" project
    const projectId = projectMap["default"] || null;
    await prisma.dataset.create({
      data: {
        id: ds.id,
        name: ds.name,
        fileName: ds.fileName || "",
        headers: ds.headers || "[]",
        queryCol: ds.queryCol || "",
        contextCol: ds.contextCol || "",
        evalNames: ds.evalNames || "[]",
        evalOverrides: ds.evalOverrides || "{}",
        rowCount: ds.rowCount || 0,
        projectId,
        createdAt: new Date(ds.createdAt),
      },
    });

    // DatasetRows
    const rows = sqlite.prepare("SELECT * FROM DatasetRow WHERE datasetId = ?").all(ds.id) as any[];
    console.log(`  Dataset ${ds.name}: ${rows.length} rows`);
    // Batch insert for performance
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await prisma.datasetRow.createMany({
        data: batch.map(r => ({
          id: r.id,
          datasetId: r.datasetId,
          rowIndex: r.rowIndex,
          data: r.data || "{}",
        })),
      });
    }
  }

  // DatasetRuns
  const runs = sqlite.prepare("SELECT * FROM DatasetRun").all() as any[];
  console.log(`Migrating ${runs.length} dataset runs...`);
  for (const run of runs) {
    await prisma.datasetRun.create({
      data: {
        id: run.id,
        datasetId: run.datasetId,
        agentSource: run.agentSource || "",
        evalNames: run.evalNames || "[]",
        status: run.status || "completed",
        createdAt: new Date(run.createdAt),
      },
    });

    const results = sqlite.prepare("SELECT * FROM DatasetRunResult WHERE runId = ?").all(run.id) as any[];
    if (results.length > 0) {
      for (let i = 0; i < results.length; i += 100) {
        const batch = results.slice(i, i + 100);
        await prisma.datasetRunResult.createMany({
          data: batch.map(r => ({
            id: r.id,
            runId: r.runId,
            rowIdx: r.rowIdx,
            response: r.response || "",
            query: r.query || "",
            evals: r.evals || "{}",
            capture: r.capture || "{}",
          })),
        });
      }
      console.log(`  Run ${run.id}: ${results.length} results`);
    }
  }

  console.log("\n✓ Migration complete!");

  // Summary
  const summary = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.projectMember.count(),
    prisma.agentTemplate.count(),
    prisma.agentConfig.count(),
    prisma.evalPrompt.count(),
    prisma.dataset.count(),
    prisma.datasetRow.count(),
    prisma.thread.count(),
    prisma.message.count(),
  ]);
  console.log(`\nPostgreSQL counts:`);
  console.log(`  Users: ${summary[0]}, Projects: ${summary[1]}, Members: ${summary[2]}`);
  console.log(`  Templates: ${summary[3]}, AgentConfigs: ${summary[4]}, EvalPrompts: ${summary[5]}`);
  console.log(`  Datasets: ${summary[6]}, Rows: ${summary[7]}`);
  console.log(`  Threads: ${summary[8]}, Messages: ${summary[9]}`);

  await prisma.$disconnect();
  sqlite.close();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
