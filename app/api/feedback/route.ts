import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";

const PHOENIX_ENDPOINT =
  process.env.PHOENIX_COLLECTOR_ENDPOINT ?? "http://localhost:6006";

/**
 * Find the Phoenix root span that matches this assistant message
 * by searching recent spans in the project and matching response content.
 */
async function findSpanForMessage(project: string, messageContent: string, messageTime: Date) {
  try {
    // Fetch recent spans from Phoenix
    const res = await fetch(
      `${PHOENIX_ENDPOINT}/v1/projects/${encodeURIComponent(project)}/spans?limit=100`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const spans = data.data ?? [];

    // Find root spans (no parent) near the message time
    const rootSpans = spans.filter((s: any) => s.parent_id === null);
    const msgTime = messageTime.getTime();
    // Use first 50 chars as snippet — enough to uniquely match
    const snippet = messageContent.slice(0, 50);

    // Try to match by output content (output may be JSON-wrapped or plain text)
    for (const s of rootSpans) {
      const rawOutput = String(s.attributes?.["output.value"] ?? "");
      const spanTime = new Date(s.start_time).getTime();
      if (Math.abs(spanTime - msgTime) > 10 * 60 * 1000) continue;

      // Check if snippet appears anywhere in the output (handles JSON-wrapped content)
      if (rawOutput.includes(snippet)) {
        return s.context.span_id;
      }

      // Also try parsing JSON to extract text content
      try {
        const parsed = JSON.parse(rawOutput);
        const text = parsed?.messages?.[0]?.content ?? parsed?.generations?.[0]?.[0]?.text ?? "";
        if (text.includes(snippet)) {
          return s.context.span_id;
        }
      } catch (e) { console.error(e); }
    }

    // Fallback: closest root span within 5 minutes
    let closest: any = null;
    let closestDiff = Infinity;
    for (const s of rootSpans) {
      const diff = Math.abs(new Date(s.start_time).getTime() - msgTime);
      if (diff < 5 * 60 * 1000 && diff < closestDiff) {
        closest = s;
        closestDiff = diff;
      }
    }
    return closest?.context?.span_id ?? null;
  } catch {
    return null;
  }
}

async function uploadToPhoenix(spanId: string, label: string, score: number) {
  try {
    await fetch(`${PHOENIX_ENDPOINT}/v1/span_annotations?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          span_id: spanId,
          name: "user_feedback",
          annotator_kind: "HUMAN",
          result: { label, score },
        }],
      }),
    });
  } catch (e) { console.error(e); }
}

export const GET = authedHandler(async (request: NextRequest, uid: string) => {
  const messageId = request.nextUrl.searchParams.get("messageId");
  const userId = request.nextUrl.searchParams.get("userId");

  const err = validateFields([
    { field: "messageId", value: messageId, required: true },
    { field: "userId", value: userId, required: true },
  ]);
  if (err) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  // Only allow access to own feedback
  if (userId !== uid) {
    return apiError(request, ErrorCode.FORBIDDEN, "Cannot access other users' feedback");
  }

  const feedback = await prisma.messageFeedback.findUnique({
    where: { messageId_userId: { messageId: messageId!, userId: userId! } },
  });

  return NextResponse.json({ feedback });
});

export const POST = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { messageId, userId, value } = body as {
    messageId: string;
    userId: string;
    value: string;
  };

  const err = validateFields([
    { field: "messageId", value: messageId, required: true },
    { field: "userId", value: userId, required: true },
    { field: "value", value: value, required: true },
  ]);
  if (err) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  // Only allow writing feedback as yourself
  if (userId !== uid) {
    return apiError(request, ErrorCode.FORBIDDEN, "Cannot submit feedback as another user");
  }

  // Upsert feedback in Prisma
  const feedback = await prisma.messageFeedback.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId, value },
    update: { value },
  });

  // Find message → thread → project, then upload to Phoenix
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { thread: { select: { projectName: true } } },
  });

  if (message?.thread?.projectName) {
    const spanId = await findSpanForMessage(
      message.thread.projectName,
      message.content,
      message.createdAt,
    );
    if (spanId) {
      const label = value === "up" ? "positive" : "negative";
      const score = value === "up" ? 1.0 : 0.0;
      void uploadToPhoenix(spanId, label, score);
    }
  }

  return NextResponse.json({ feedback });
});

export const DELETE = authedHandler(async (request: NextRequest, uid: string) => {
  const body = await request.json();
  const { messageId, userId } = body as { messageId: string; userId: string };

  const err = validateFields([
    { field: "messageId", value: messageId, required: true },
    { field: "userId", value: userId, required: true },
  ]);
  if (err) return apiError(request, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  // Only allow deleting own feedback
  if (userId !== uid) {
    return apiError(request, ErrorCode.FORBIDDEN, "Cannot delete another user's feedback");
  }

  // Get message info before deleting feedback
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { thread: { select: { projectName: true } } },
  });

  await prisma.messageFeedback.delete({
    where: { messageId_userId: { messageId, userId } },
  });

  // Overwrite Phoenix annotation with neutral state (cancelled)
  if (message?.thread?.projectName) {
    const spanId = await findSpanForMessage(
      message.thread.projectName,
      message.content,
      message.createdAt,
    );
    if (spanId) {
      // Phoenix has no DELETE for annotations — overwrite with neutral label
      void uploadToPhoenix(spanId, "cancelled", 0.5);
    }
  }

  return NextResponse.json({ ok: true });
});
