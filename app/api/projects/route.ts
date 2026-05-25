import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { ensureBuiltInEvals, seedProjectEvals } from "@/lib/eval-seed";
import { encrypt } from "@/lib/crypto";
import { randomBytes, createHash } from "crypto";
import { ensureDefaultPromptForProject } from "@/lib/project-prompt-seed";
import { logger } from "@/lib/logger";

function generateSlug(): string {
  return randomBytes(8).toString("base64url").toLowerCase().slice(0, 12);
}

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// GET /api/projects — list my projects (internal-service sees all)
export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  if (uid === "internal-service") {
    const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({
      items: projects.map((p) => ({
        id: p.id, name: p.name, slug: p.slug,
        phoenixProject: p.phoenixProject, role: "owner", createdAt: p.createdAt,
      })),
      nextCursor: null,
    });
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: uid },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    items: memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      slug: m.project.slug,
      phoenixProject: m.project.phoenixProject,
      role: m.role,
      createdAt: m.project.createdAt,
    })),
    nextCursor: null,
  });
});

// POST /api/projects — create a project
export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const { name } = await req.json();
  if (!name?.trim()) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Project name is required");
  }

  const slug = generateSlug();
  const traceKey = generateKey("pt");
  const traceKeyHash = hashKey(traceKey);
  const traceKeyEncrypted = encrypt(traceKey);

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      slug,
      phoenixProject: slug,
      traceKeyHash,
      traceKeyEncrypted,
      members: {
        create: { userId: uid, role: "owner" },
      },
    },
  });

  // Copy owner's API keys to the new project
  const ownerKeys = await prisma.llmProvider.findMany({
    where: { userId: uid, isActive: true, projectId: null },
  });
  if (ownerKeys.length > 0) {
    await prisma.llmProvider.createMany({
      data: ownerKeys.map((k) => ({
        provider: k.provider,
        apiKey: k.apiKey,
        isActive: true,
        userId: uid,
        projectId: project.id,
      })),
    });
  }

  // Ensure global built-in eval templates exist, then seed them into the new project.
  // ensureBuiltInEvals is no-op after the first call per process.
  await ensureBuiltInEvals();
  await seedProjectEvals(project.id);

  // Seed a starter Phoenix prompt + ProjectPrompt mapping using the owner's
  // General Settings template. Idempotent; safe to re-run. Phoenix outages
  // shouldn't block project creation, so we swallow errors here.
  try {
    await ensureDefaultPromptForProject(project.id);
  } catch (err) {
    logger.error("starter prompt seeding failed", err, { route: "POST /api/projects" });
  }

  return NextResponse.json({
    id: project.id,
    name: project.name,
    slug: project.slug,
    traceKey, // shown once only
  }, { status: 201 });
});

// PUT /api/projects — rename project
export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const { projectId, name } = await req.json();
  if (!projectId || !name?.trim()) {
    return apiError(req, ErrorCode.BAD_REQUEST, "projectId and name are required");
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Only the project owner can rename");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { name: name.trim() },
  });

  return NextResponse.json({ ok: true });
});

// DELETE /api/projects — delete a project (owner only)
export const DELETE = authedHandler(async (req: NextRequest, uid: string) => {
  const { projectId } = await req.json();
  if (!projectId) {
    return apiError(req, ErrorCode.BAD_REQUEST, "projectId is required");
  }

  // Check ownership
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });

  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Only the project owner can delete a project");
  }

  // Delete project — cascades to all related data (members, datasets, configs, etc.)
  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ ok: true });
});
