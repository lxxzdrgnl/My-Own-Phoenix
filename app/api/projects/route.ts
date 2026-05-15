import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";
import { randomBytes, createHash } from "crypto";

function generateSlug(): string {
  return randomBytes(8).toString("base64url").toLowerCase().slice(0, 12);
}

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// GET /api/projects — list my projects
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const memberships = await prisma.projectMember.findMany({
    where: { userId: auth },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      slug: m.project.slug,
      role: m.role,
      createdAt: m.project.createdAt,
    })),
  );
}

// POST /api/projects — create a project
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { name } = await req.json();
  if (!name?.trim()) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Project name is required");
  }

  const slug = generateSlug();
  const traceKey = generateKey("pt");
  const traceKeyHash = hashKey(traceKey);

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      slug,
      traceKeyHash,
      members: {
        create: { userId: auth, role: "owner" },
      },
    },
  });

  return NextResponse.json({
    id: project.id,
    name: project.name,
    slug: project.slug,
    traceKey, // shown once only
  }, { status: 201 });
}

// PUT /api/projects — rename project
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { projectId, name } = await req.json();
  if (!projectId || !name?.trim()) {
    return apiError(req, ErrorCode.BAD_REQUEST, "projectId and name are required");
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Only the project owner can rename");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { name: name.trim() },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/projects — delete a project (owner only)
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { projectId } = await req.json();
  if (!projectId) {
    return apiError(req, ErrorCode.BAD_REQUEST, "projectId is required");
  }

  // Check ownership
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });

  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Only the project owner can delete a project");
  }

  // Delete project — cascades to all related data (members, datasets, configs, etc.)
  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ ok: true });
}
