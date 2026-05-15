import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { projectId, targetUserId, messages, threadId } = await req.json();
  if (!projectId || !targetUserId || !messages) {
    return new Response(
      JSON.stringify({
        error: "projectId, targetUserId, messages required",
      }),
      { status: 400 }
    );
  }

  // Verify membership
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth } },
  });
  if (!member) {
    return new Response(
      JSON.stringify({ error: "Not a project member" }),
      { status: 403 }
    );
  }

  // Dynamic import to avoid issues in Edge runtime
  let sendToConnector: any, onResponse: any;
  try {
    const relay = await import("@/lib/ws-relay");
    sendToConnector = relay.sendToConnector;
    onResponse = relay.onResponse;
  } catch {
    return new Response(
      JSON.stringify({ error: "WebSocket relay not available" }),
      { status: 503 }
    );
  }

  const requestId = `req_${randomBytes(8).toString("hex")}`;

  // Try to send to connector
  try {
    await sendToConnector(projectId, targetUserId, {
      type: "chat",
      requestId,
      messages,
      threadId,
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Agent not connected" }),
      { status: 404 }
    );
  }

  // Stream response back as SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const timeout = setTimeout(() => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ event: "error", data: { message: "Timeout" } })}\n\n`
          )
        );
        controller.close();
        cleanup();
      }, 60000);

      const cleanup = onResponse(requestId, (msg: any) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(msg)}\n\n`)
          );
          if (msg.event === "messages/complete" || msg.event === "error") {
            clearTimeout(timeout);
            controller.close();
            cleanup();
          }
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
