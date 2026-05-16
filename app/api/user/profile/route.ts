import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { name: true, email: true },
  });
  return NextResponse.json({ name: user?.name || "", email: user?.email || "" });
});

export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const { name } = await req.json();
  if (name !== undefined && typeof name !== "string") {
    return apiError(req, ErrorCode.BAD_REQUEST, "name must be a string");
  }

  await prisma.user.update({
    where: { id: uid },
    data: { name: name?.trim() || null },
  });

  return NextResponse.json({ ok: true });
});
