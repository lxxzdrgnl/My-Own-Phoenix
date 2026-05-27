import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import next from "next";
import { createRelayServer, handleUpgrade, sendToConnector, onResponse, getConnection, getProjectConnections, shutdownRelay } from "./lib/ws-relay";
import { randomBytes } from "crypto";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const port = parseInt(process.env.PORT || "3000", 10);

// Handle chat-relay directly in the custom server (same process as WebSocket)
async function handleChatRelay(req: IncomingMessage, res: ServerResponse) {
  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString());

  const { projectId, targetUserId, messages, threadId } = body;
  console.log(`[chat-relay] projectId=${projectId} targetUserId=${targetUserId} msgs=${messages?.length}`);
  if (!projectId || !targetUserId || !messages) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "projectId, targetUserId, messages required" }));
    return;
  }

  // Check if connector is connected
  const conn = getConnection(projectId, targetUserId);
  console.log(`[chat-relay] Connection found: ${!!conn}, readyState: ${conn?.ws?.readyState}`);
  if (!conn) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent not connected" }));
    return;
  }

  const requestId = `req_${randomBytes(8).toString("hex")}`;

  // Send request to connector via WebSocket
  try {
    await sendToConnector(projectId, targetUserId, {
      type: "chat",
      requestId,
      messages,
      threadId,
    });
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to send to agent" }));
    return;
  }

  // Stream SSE response back
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const timeout = setTimeout(() => {
    res.write(`data: ${JSON.stringify({ event: "error", data: { message: "Timeout" } })}\n\n`);
    res.end();
    cleanup();
  }, 60000);

  const cleanup = onResponse(requestId, (msg: any) => {
    try {
      res.write(`data: ${JSON.stringify(msg)}\n\n`);
      if (msg.event === "messages/complete" || msg.event === "error") {
        clearTimeout(timeout);
        res.end();
        cleanup();
      }
    } catch {
      // Connection closed
      clearTimeout(timeout);
      cleanup();
    }
  });

  req.on("close", () => {
    clearTimeout(timeout);
    cleanup();
  });
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);

    // Intercept chat-relay before Next.js
    if (req.url === "/api/chat-relay" && req.method === "POST") {
      console.log("[chat-relay] Request received");
      handleChatRelay(req, res);
      return;
    }

    // Intercept connectors API — return live connection data from memory
    if (req.url?.startsWith("/api/connectors") && req.method === "GET") {
      const url = new URL(req.url, `http://localhost:${port}`);
      const projectId = url.searchParams.get("projectId");
      if (projectId) {
        const live = getProjectConnections(projectId);
        // Enrich with user info from DB
        (async () => {
          try {
            const { prisma } = await import("./lib/prisma");
            const users = await prisma.user.findMany({
              where: { id: { in: live.map(c => c.userId) } },
              select: { id: true, email: true, name: true },
            });
            const userMap = Object.fromEntries(users.map(u => [u.id, u]));
            const connectors = live.map(c => ({
              userId: c.userId,
              userName: userMap[c.userId]?.name || userMap[c.userId]?.email || c.userId,
              agentType: c.agentType,
              assistantId: c.assistantId,
              status: "online",
              connectedAt: c.connectedAt,
            }));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ connectors }));
          } catch (e) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ connectors: live.map(c => ({ ...c, status: "online", userName: c.userId })) }));
          }
        })();
        return;
      }
    }

    handle(req, res, parsedUrl);
  });

  // WebSocket relay on separate port (avoids conflict with Next.js HMR)
  const wsPort = parseInt(process.env.WS_PORT || "3001", 10);
  const wss = createRelayServer();
  const wsServer = createServer();
  wsServer.on("upgrade", (req, socket, head) => {
    if (req.url === "/api/ws-relay") {
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });
  wsServer.listen(wsPort, () => {
    console.log(`> WebSocket relay on ws://localhost:${wsPort}/api/ws-relay`);
  });

  server.listen(port, () => {
    console.log(`> Server ready on http://localhost:${port}`);
    console.log(`> Chat relay on http://localhost:${port}/api/chat-relay`);
  });

  // Graceful shutdown: close connector WebSockets with a close frame so they
  // reconnect to the new instance immediately on redeploy, instead of holding
  // a dead socket until their ping timeout fires.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received — shutting down gracefully`);
    shutdownRelay();
    wss.close();
    wsServer.close();
    server.close(() => process.exit(0));
    // Don't hang forever if a socket refuses to close.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
});
