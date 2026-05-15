import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";
import { encrypt } from "@/lib/crypto";

// GET — list project's API keys (no decryption)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member) return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");

  const providers = await prisma.llmProvider.findMany({
    where: { projectId },
    select: { id: true, provider: true, isActive: true },
  });

  return NextResponse.json({ providers });
}

// POST — add API key to project
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member || !["owner", "editor"].includes(member.role)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  }

  const { provider, apiKey } = await req.json();
  if (!provider || !apiKey) {
    return apiError(req, ErrorCode.BAD_REQUEST, "provider and apiKey required");
  }

  // Check duplicate
  const existing = await prisma.llmProvider.findFirst({
    where: { projectId, provider },
  });
  if (existing) {
    // Update existing
    await prisma.llmProvider.update({
      where: { id: existing.id },
      data: { apiKey: encrypt(apiKey), isActive: true },
    });
    return NextResponse.json({ ok: true, updated: true });
  }

  await prisma.llmProvider.create({
    data: { provider, apiKey: encrypt(apiKey), isActive: true, userId: auth, projectId },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
