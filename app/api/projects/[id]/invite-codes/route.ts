import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";
import { randomBytes } from "crypto";

function generateCode(): string {
  return randomBytes(16).toString("base64url").slice(0, 22);
}

// GET — list invite codes (owner only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  try {
    const codes = await prisma.projectInviteCode.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ codes });
  } catch (e) {
    console.error("Failed to list invite codes:", e);
    return NextResponse.json({ message: String(e) }, { status: 500 });
  }
}

// POST — generate invite code (owner only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const { role = "editor", maxUses = 0, expiresInDays } = await req.json();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null;

  try {
    const code = await prisma.projectInviteCode.create({
      data: {
        projectId,
        code: generateCode(),
        role,
        maxUses,
        expiresAt,
        createdBy: auth,
      },
    });

    return NextResponse.json({ code }, { status: 201 });
  } catch (e) {
    console.error("Failed to create invite code:", e);
    return NextResponse.json({ message: String(e) }, { status: 500 });
  }
}

// DELETE — delete invite code (owner only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const { codeId } = await req.json();
  await prisma.projectInviteCode.delete({ where: { id: codeId } });
  return NextResponse.json({ ok: true });
}
