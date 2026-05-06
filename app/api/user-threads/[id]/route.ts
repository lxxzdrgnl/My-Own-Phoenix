import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler } from "@/lib/api-error";

export const DELETE = authedHandler(async (
  req: NextRequest,
  uid: string,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  await prisma.thread.delete({ where: { id } });

  return NextResponse.json({ ok: true });
});

export const PATCH = authedHandler(async (
  req: NextRequest,
  uid: string,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const { title } = await req.json();

  const thread = await prisma.thread.update({
    where: { id },
    data: { title, updatedAt: new Date() },
  });

  return NextResponse.json({ thread });
});
