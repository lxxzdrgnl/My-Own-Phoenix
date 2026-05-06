import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ErrorCode, safeHandler } from "@/lib/api-error";

export const POST = safeHandler(async (req: NextRequest) => {
  const { uid, email, name } = await req.json();

  if (!uid || !email) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "uid and email are required",
    });
  }

  const user = await prisma.user.upsert({
    where: { id: uid },
    update: { email, name },
    create: { id: uid, email, name },
  });

  return NextResponse.json({ user });
});
