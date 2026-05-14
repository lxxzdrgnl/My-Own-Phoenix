import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";
import { randomBytes, createHash } from "crypto";

function generateKey(): string {
  return `pc_${randomBytes(24).toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// GET — get connector key status (masked)
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth },
    select: { relayKeyHash: true },
  });

  return NextResponse.json({
    hasKey: !!user?.relayKeyHash,
  });
}

// POST — generate connector key (returns full key once)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const key = generateKey();
  const keyHash = hashKey(key);

  await prisma.user.update({
    where: { id: auth },
    data: { relayKeyHash: keyHash },
  });

  return NextResponse.json({ key }, { status: 201 });
}

// PUT — regenerate connector key (invalidates old)
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const key = generateKey();
  const keyHash = hashKey(key);

  await prisma.user.update({
    where: { id: auth },
    data: { relayKeyHash: keyHash },
  });

  return NextResponse.json({ key });
}
