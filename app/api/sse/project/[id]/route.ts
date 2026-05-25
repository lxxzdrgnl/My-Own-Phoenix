// app/api/sse/project/[id]/route.ts
import { NextRequest } from "next/server";
import { addWriter } from "@/lib/sse-broadcast";
import { verifyAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { SSE_PING_INTERVAL_MS } from "@/lib/config/timeouts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectIdent } = await params;

  // Auth: must be project member (any role)
  const uid = await verifyAuth(req);
  if (!uid) return new Response("Unauthorized", { status: 401 });

  // Resolve identifier (DB id, slug, or phoenix name) to DB id
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: projectIdent }, { slug: projectIdent }, { phoenixProject: projectIdent }] },
    select: { id: true },
  });
  if (!project) return new Response("Not found", { status: 404 });

  if (uid !== "internal-service") {
    const member = await prisma.projectMember.findFirst({
      where: { projectId: project.id, userId: uid },
      select: { role: true },
    });
    if (!member) return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          closed = true;
        }
      };

      // initial comment to open the stream
      send(": connected\n\n");

      const unsubscribe = addWriter(project.id, (msg) => {
        send(`event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`);
      });

      const ping = setInterval(() => send(`: ping ${Date.now()}\n\n`), SSE_PING_INTERVAL_MS);

      const abort = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
