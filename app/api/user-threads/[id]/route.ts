import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler } from "@/lib/api-error";
import { requireThreadOwner } from "@/lib/api-helpers";

export const DELETE = authedHandler(async (
  req: NextRequest,
  uid: string,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const thread = await requireThreadOwner(req, id, uid);
  if (thread instanceof NextResponse) return thread;

  await prisma.thread.delete({ where: { id } });

  return NextResponse.json({ ok: true });
});

export const PATCH = authedHandler(async (
  req: NextRequest,
  uid: string,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const thread = await requireThreadOwner(req, id, uid);
  if (thread instanceof NextResponse) return thread;

  const { title } = await req.json();

  const updated = await prisma.thread.update({
    where: { id },
    data: { title, updatedAt: new Date() },
  });

  return NextResponse.json({ thread: updated });
});
