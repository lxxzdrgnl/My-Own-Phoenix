import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest) => {
  const userId = req.nextUrl.searchParams.get("userId");
  const project = req.nextUrl.searchParams.get("project") || "default";

  const err = validateFields([
    { field: "userId", value: userId, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const threads = await prisma.thread.findMany({
    where: { userId: userId!, project },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ threads });
});

export const POST = authedHandler(async (req: NextRequest) => {
  const { userId, langGraphThreadId, title, project } = await req.json();

  const err = validateFields([
    { field: "userId", value: userId, required: true },
    { field: "langGraphThreadId", value: langGraphThreadId, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const thread = await prisma.thread.create({
    data: { userId, langGraphThreadId, title: title || "New Chat", project: project || "default" },
  });
  return NextResponse.json({ thread });
});
