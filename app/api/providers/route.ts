import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";
import { apiError, ErrorCode, validateFields, authedHandler } from "@/lib/api-error";

const VALID_PROVIDERS = ["openai", "anthropic", "google", "xai"] as const;

export const GET = authedHandler(async (req, uid) => {
  const decryptParam = req.nextUrl.searchParams.get("decrypt");
  const providers = await prisma.llmProvider.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "asc" },
  });

  const result = providers.map((p) => ({
    id: p.id,
    provider: p.provider,
    apiKey: decryptParam === "true" ? decrypt(p.apiKey) : maskApiKey(decrypt(p.apiKey)),
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json({ providers: result });
});

export const POST = authedHandler(async (req, uid) => {
  const body = (await req.json()) as { provider: string; apiKey: string };

  const err = validateFields([
    { field: "provider", value: body.provider, required: true, oneOf: VALID_PROVIDERS },
    { field: "apiKey", value: body.apiKey, required: true, minLength: 1 },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const existing = await prisma.llmProvider.findFirst({
    where: { userId: uid, provider: body.provider, projectId: null },
  });
  if (existing) {
    return apiError(req, ErrorCode.PROVIDER_DUPLICATE, `Provider "${body.provider}" already registered. Use PUT to update.`);
  }

  const encrypted = encrypt(body.apiKey);
  const created = await prisma.llmProvider.create({
    data: { provider: body.provider, apiKey: encrypted, isActive: true, userId: uid },
  });

  return NextResponse.json({
    id: created.id,
    provider: created.provider,
    apiKey: maskApiKey(body.apiKey),
    isActive: created.isActive,
  });
});
