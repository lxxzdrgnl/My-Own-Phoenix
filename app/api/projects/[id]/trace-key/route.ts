import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { encrypt, decrypt } from "@/lib/crypto";
import { randomBytes, createHash } from "crypto";

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// GET — retrieve existing trace key (decrypted, always full)
export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member) return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { traceKeyEncrypted: true },
  });

  if (!project?.traceKeyEncrypted) {
    return NextResponse.json({ key: null });
  }

  try {
    const key = decrypt(project.traceKeyEncrypted);
    return NextResponse.json({ key });
  } catch {
    return NextResponse.json({ key: null });
  }
});

// POST — generate new trace key (owner only)
export const POST = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });
  if (!member || member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }

  const traceKey = generateKey("pt");
  const traceKeyHash = hashKey(traceKey);
  const traceKeyEncrypted = encrypt(traceKey);

  await prisma.project.update({
    where: { id: projectId },
    data: { traceKeyHash, traceKeyEncrypted },
  });

  return NextResponse.json({ key: traceKey });
});
