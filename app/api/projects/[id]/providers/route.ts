import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ErrorCode, authedHandler } from "@/lib/api-error";
import { encrypt, decrypt } from "@/lib/crypto";

// GET — list project's API keys (no decryption)
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  const decryptParam = req.nextUrl.searchParams.get("decrypt");

  // Internal service (eval-worker) can access any project's keys
  if (uid !== "internal-service") {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: uid } },
    });
    if (!member) return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  }

  let providers;
  try {
    providers = await prisma.llmProvider.findMany({
      where: { projectId: projectId },
      select: { id: true, provider: true, isActive: true, apiKey: decryptParam === "true" },
    });
  } catch (e) {
    console.error("[providers GET] findMany failed:", e);
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, `DB query failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Decrypt keys if requested
  if (decryptParam === "true") {
    providers = providers.map((p: any) => ({
      ...p,
      apiKey: p.apiKey ? decrypt(p.apiKey) : "",
    }));
  }

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

  let encrypted: string;
  try {
    encrypted = encrypt(apiKey);
  } catch (e) {
    console.error("[providers] encrypt failed:", e);
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, `Encryption failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  let existing;
  try {
    existing = await prisma.llmProvider.findFirst({
      where: { projectId: projectId, provider: provider },
    });
  } catch (e) {
    console.error("[providers] findFirst failed:", e);
    return apiError(req, ErrorCode.INTERNAL_SERVER_ERROR, `DB query failed: ${e instanceof Error ? e.message : String(e)}`);
  }
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
