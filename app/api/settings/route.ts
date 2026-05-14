import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const settings = await prisma.appSettings.findMany({
    where: { OR: [{ userId: null }, { userId: uid }] },
  });
  const result: Record<string, string> = {};
  for (const s of settings) result[s.key] = s.value;
  return NextResponse.json(result);
});

export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const body = (await req.json()) as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    await prisma.appSettings.upsert({
      where: { key_userId: { key, userId: uid } },
      update: { value },
      create: { key, value, userId: uid },
    });
  }
  const settings = await prisma.appSettings.findMany({
    where: { OR: [{ userId: null }, { userId: uid }] },
  });
  const result: Record<string, string> = {};
  for (const s of settings) result[s.key] = s.value;
  return NextResponse.json(result);
});
