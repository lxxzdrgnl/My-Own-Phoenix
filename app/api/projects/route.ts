import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";
import { randomBytes, createHash } from "crypto";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) + "-" + randomBytes(4).toString("hex");
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

  const slug = generateSlug(name.trim());
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
