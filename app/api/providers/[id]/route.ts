import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const PUT = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = (await req.json()) as { apiKey?: string; isActive?: boolean };

  const existing = await prisma.llmProvider.findFirst({
    where: { id, userId: uid },
  });
  if (!existing) {
    return apiError(req, ErrorCode.PROVIDER_NOT_FOUND, "Provider not found");
  }

  const data: Record<string, unknown> = {};
  if (body.apiKey !== undefined) data.apiKey = encrypt(body.apiKey);
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.llmProvider.update({ where: { id }, data });

  return NextResponse.json({
    id: updated.id,
    provider: updated.provider,
    apiKey: maskApiKey(decrypt(updated.apiKey)),
    isActive: updated.isActive,
  });
});

export const DELETE = authedHandler(async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;

  const existing = await prisma.llmProvider.findFirst({
    where: { id, userId: uid },
  });
  if (!existing) {
    return apiError(req, ErrorCode.PROVIDER_NOT_FOUND, "Provider not found");
  }

  await prisma.llmProvider.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
