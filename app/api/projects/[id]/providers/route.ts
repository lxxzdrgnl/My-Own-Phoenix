import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ErrorCode, authedHandler } from "@/lib/api-error";
import { encrypt } from "@/lib/crypto";

// GET — list project's API keys (no decryption)
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member) return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");

  const providers = await prisma.llmProvider.findMany({
    where: { projectId },
    select: { id: true, provider: true, isActive: true },
  });

  return NextResponse.json({ providers });
});

// POST — add API key to project
export const POST = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || !["owner", "editor"].includes(member.role)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  }

  const { provider, apiKey } = await req.json();
  if (!provider || !apiKey) {
    return apiError(req, ErrorCode.BAD_REQUEST, "provider and apiKey required");
  }

  const encrypted = encrypt(apiKey);

  // Check duplicate
  const existing = await prisma.llmProvider.findFirst({
    where: { projectId: projectId, provider: provider },
  });
  if (existing) {
    await prisma.llmProvider.update({
      where: { id: existing.id },
      data: { apiKey: encrypted, isActive: true },
    });
    return NextResponse.json({ ok: true, updated: true });
  }

  await prisma.llmProvider.create({
    data: { provider: provider, apiKey: encrypted, isActive: true, userId: uid, projectId: projectId },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
});
