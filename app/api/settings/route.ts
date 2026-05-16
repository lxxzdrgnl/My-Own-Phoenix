import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const scope = req.nextUrl.searchParams.get("scope");
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (scope === "project" && projectId) {
    // Project-scoped settings: stored with userId = "project:{projectId}"
    const settingsKey = `project:${projectId}`;
    const settings = await prisma.appSettings.findMany({
      where: { userId: settingsKey },
    });
    const result: Record<string, string> = {};
    for (const s of settings) result[s.key] = s.value;
    return NextResponse.json(result);
  }

  // User-scoped settings (default)
  const settings = await prisma.appSettings.findMany({
    where: { OR: [{ userId: null }, { userId: uid }] },
  });
  const result: Record<string, string> = {};
  for (const s of settings) result[s.key] = s.value;
  return NextResponse.json(result);
});

export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const body = await req.json();
  const { scope, projectId, key, value, ...rest } = body;

  if (scope === "project" && projectId && key) {
    // Project-scoped setting
    const settingsKey = `project:${projectId}`;
    await prisma.appSettings.upsert({
      where: { key_userId: { key, userId: settingsKey } },
      update: { value },
      create: { key, value, userId: settingsKey },
    });
    return NextResponse.json({ ok: true });
  }

  // User-scoped settings (default — bulk update)
  const entries = key ? [[key, value]] : Object.entries(rest);
  for (const [k, v] of entries) {
    await prisma.appSettings.upsert({
      where: { key_userId: { key: k as string, userId: uid } },
      update: { value: v as string },
      create: { key: k as string, value: v as string, userId: uid },
    });
  }
  const settings = await prisma.appSettings.findMany({
    where: { OR: [{ userId: null }, { userId: uid }] },
  });
  const result: Record<string, string> = {};
  for (const s of settings) result[s.key] = s.value;
  return NextResponse.json(result);
});
