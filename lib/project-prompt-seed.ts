// Server-only: ensure a project has its default starter prompt. The prompt
// content comes from the project owner's General Settings (`promptTemplate`),
// falling back to DEFAULT_PROMPT_TEMPLATE for owners who never customized.
//
// Used in two places:
//   - POST /api/projects → eager seed on creation
//   - GET /api/projects/[id]/prompts → lazy seed for projects that pre-date
//     this feature and therefore have no mapping yet.
//
// Idempotent: if Phoenix already has the prompt name and/or the mapping row
// already exists, both are treated as success.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  PROMPT_TEMPLATE_KEY,
  parsePromptTemplate,
  renderTemplateSystemMessage,
  renderTemplateUserMessage,
} from "@/lib/constants";
import { createPromptServer } from "@/lib/phoenix-server";

export async function ensureDefaultPromptForProject(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, slug: true },
  });
  if (!project) return null;

  const owner = await prisma.projectMember.findFirst({
    where: { projectId, role: "owner" },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) return null;

  const stored = await prisma.appSettings.findUnique({
    where: { key_userId: { key: PROMPT_TEMPLATE_KEY, userId: owner.userId } },
  });
  const template = parsePromptTemplate(stored?.value);

  const phoenixName = `${project.slug}-default`;

  try {
    await createPromptServer(
      phoenixName,
      `Auto-seeded from ${project.name} owner's General Settings`,
      renderTemplateSystemMessage(template),
      renderTemplateUserMessage(template),
    );
  } catch (err) {
    // Phoenix may already have a prompt with this name (e.g., from a previous
    // attempt or from someone calling Phoenix directly). That's fine — we just
    // need the mapping row.
    logger.warn("project-prompt-seed phoenix create skipped", { phoenixName, err });
  }

  try {
    await prisma.projectPrompt.create({
      data: { projectId, phoenixName },
    });
  } catch (err: any) {
    if (err?.code !== "P2002") throw err;
    // Mapping already exists — another concurrent request beat us. Treat as success.
  }

  return phoenixName;
}
