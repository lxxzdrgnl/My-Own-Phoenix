import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const project = req.nextUrl.searchParams.get("project") || "default";

  const threads = await prisma.thread.findMany({
    where: { userId: uid, projectName: project },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items: threads, nextCursor: null });
});

export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const { langGraphThreadId, title, project } = await req.json();

  const err = validateFields([
    { field: "langGraphThreadId", value: langGraphThreadId, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const thread = await prisma.thread.create({
    data: { userId: uid, langGraphThreadId, title: title || "New Chat", projectName: project || "default" },
  });
  return NextResponse.json({ thread });
});
