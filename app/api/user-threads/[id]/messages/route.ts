import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";

export const GET = authedHandler(async (
  req: NextRequest,
  uid: string,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const rawMessages = await prisma.message.findMany({
    where: { threadId: id },
    orderBy: { createdAt: "asc" },
    include: { feedback: true },
  });

  const messages = rawMessages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    feedbackValue: m.feedback?.[0]?.value ?? null,
  }));

  return NextResponse.json({ messages });
});

export const POST = authedHandler(async (
  req: NextRequest,
  uid: string,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const { role, content } = await req.json();

  const err = validateFields([
    { field: "role", value: role, required: true },
    { field: "content", value: content, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const message = await prisma.message.create({
    data: { threadId: id, role, content },
  });

  // Update thread's updatedAt
  await prisma.thread.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ message });
});
