import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler } from "@/lib/api-error";
import { randomBytes, createHash } from "crypto";

function generateKey(): string {
  return `pc_${randomBytes(24).toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// GET — get connector key status (masked)
export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { relayKeyHash: true },
  });

  return NextResponse.json({
    hasKey: !!user?.relayKeyHash,
  });
});

// POST — generate connector key (returns full key once)
export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const key = generateKey();
  const keyHash = hashKey(key);

  await prisma.user.update({
    where: { id: uid },
    data: { relayKeyHash: keyHash },
  });

  return NextResponse.json({ key }, { status: 201 });
});

// PUT — regenerate connector key (invalidates old)
export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const key = generateKey();
  const keyHash = hashKey(key);

  await prisma.user.update({
    where: { id: uid },
    data: { relayKeyHash: keyHash },
  });

  return NextResponse.json({ key });
});
