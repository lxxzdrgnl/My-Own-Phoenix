import { WebSocketServer, WebSocket } from "ws";
import { createHash } from "crypto";
import { IncomingMessage } from "http";
import { Socket } from "net";
import { logger } from "@/lib/logger";

// In-memory connection pool: key = `${projectId}:${userId}`
// Use globalThis so the Map is shared between custom server and Next.js API routes
const globalForRelay = globalThis as unknown as {
  __wsRelayConnections?: Map<string, { ws: WebSocket; agentType: string; assistantId: string; connectedAt: Date }>;
  __wsRelayPendingRequests?: Map<string, (msg: any) => void>;
};
if (!globalForRelay.__wsRelayConnections) {
  globalForRelay.__wsRelayConnections = new Map();
}
if (!globalForRelay.__wsRelayPendingRequests) {
  globalForRelay.__wsRelayPendingRequests = new Map();
}
const connections = globalForRelay.__wsRelayConnections;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Dynamic import for prisma (ESM/CJS compatibility)
async function getPrisma() {
  const { prisma } = await import("./prisma");
  return prisma;
}

// Pending request handlers for chat relay
const pendingRequests = globalForRelay.__wsRelayPendingRequests!;

export function createRelayServer() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (ws: WebSocket) => {
    logger.info("ws-relay new connection received");
    let authenticated = false;
    let connectionKey = "";

    // Auth timeout: 30 seconds (Prisma cold start can be slow)
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        logger.info("ws-relay auth timeout closing");
        ws.close(4001, "Auth timeout");
      }
    }, 30000);

    ws.on("message", async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Handle auth frame
        if (!authenticated && msg.type === "auth") {
          clearTimeout(authTimeout);

          const { key, project, agentType, assistantId } = msg;
          if (!key || !project) {
            ws.close(4001, "Missing key or project");
            return;
          }

          try {
            const startTime = Date.now();
            const prisma = await getPrisma();
            const keyHash = hashKey(key);
            const user = await prisma.user.findFirst({
              where: { relayKeyHash: keyHash },
            });
            if (!user) {
              ws.send(
                JSON.stringify({
                  type: "auth_error",
                  error: "Invalid connector key",
                })
              );
              ws.close(4001, "Invalid key");
              return;
            }

            const projectRecord = await prisma.project.findFirst({
              where: {
                OR: [{ slug: project }, { phoenixProject: project }],
              },
            });
            if (!projectRecord) {
              ws.send(
                JSON.stringify({
                  type: "auth_error",
                  error: "Project not found",
                })
              );
              ws.close(4001, "Project not found");
              return;
            }

            const member = await prisma.projectMember.findUnique({
              where: {
                projectId_userId: {
                  projectId: projectRecord.id,
                  userId: user.id,
                },
              },
            });
            if (!member) {
              ws.send(
                JSON.stringify({
                  type: "auth_error",
                  error: "Not a project member",
                })
              );
              ws.close(4001, "Not a member");
              return;
            }

            // Success — send auth_ok FIRST, then update DB (non-blocking)
            logger.info("ws-relay auth queries done", { ms: Date.now() - startTime, readyState: ws.readyState });
            authenticated = true;
            connectionKey = `${projectRecord.id}:${user.id}`;
            connections.set(connectionKey, {
              ws,
              agentType: agentType || "langgraph",
              assistantId: assistantId || "agent",
              connectedAt: new Date(),
            });

            ws.send(JSON.stringify({ type: "auth_ok", project: projectRecord.name }));
            logger.info("ws-relay connector authenticated", { user: user.email, project: projectRecord.name });

            // Update ConnectorSession in background (don't block the connection)
            prisma.connectorSession.upsert({
              where: { userId_projectId: { userId: user.id, projectId: projectRecord.id } },
              update: { status: "online", agentType: agentType || "langgraph", assistantId: assistantId || "agent", connectedAt: new Date(), lastPingAt: new Date() },
              create: { userId: user.id, projectId: projectRecord.id, agentType: agentType || "langgraph", assistantId: assistantId || "agent", status: "online" },
            }).catch((e: any) => logger.error("ws-relay DB upsert error", e));
          } catch (e: any) {
            logger.error("ws-relay auth error", e);
            try { ws.close(4002, "Server error"); } catch {}
          }
          return;
        }

        // Handle pong (heartbeat response)
        if (msg.type === "pong") {
          // Update lastPingAt
          return;
        }

        // Handle response chunks from connector (forward to pending requests)
        if (authenticated && msg.requestId) {
          const handler = pendingRequests.get(msg.requestId);
          if (handler) {
            handler(msg);
          }
        }
      } catch (e) {
        logger.error("ws-relay message parse error", e);
      }
    });

    ws.on("close", async () => {
      if (connectionKey) {
        connections.delete(connectionKey);
        try {
          const prisma = await getPrisma();
          const [projectId, userId] = connectionKey.split(":");
          await prisma.connectorSession.update({
            where: { userId_projectId: { userId, projectId } },
            data: { status: "offline" },
          });
        } catch (e) {
          logger.error("ws-relay cleanup error", e);
        }
        logger.info("ws-relay connector disconnected", { connectionKey });
      }
    });

    // Heartbeat disabled — Python websockets 15 handles keepalive internally
  });

  return wss;
}

export function getConnection(projectId: string, userId: string) {
  return connections.get(`${projectId}:${userId}`);
}

export function getProjectConnections(projectId: string) {
  const result: {
    userId: string;
    agentType: string;
    assistantId: string;
    connectedAt: Date;
  }[] = [];
  for (const [key, conn] of connections) {
    if (key.startsWith(`${projectId}:`)) {
      const userId = key.split(":")[1];
      result.push({
        userId,
        agentType: conn.agentType,
        assistantId: conn.assistantId,
        connectedAt: conn.connectedAt,
      });
    }
  }
  return result;
}

export function sendToConnector(
  projectId: string,
  userId: string,
  message: any
): Promise<void> {
  const conn = connections.get(`${projectId}:${userId}`);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("Connector not connected"));
  }
  conn.ws.send(JSON.stringify(message));
  return Promise.resolve();
}

export function onResponse(
  requestId: string,
  handler: (msg: any) => void
): () => void {
  pendingRequests.set(requestId, handler);
  return () => pendingRequests.delete(requestId);
}

export function handleUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  wss: WebSocketServer
) {
  if (req.url === "/api/ws-relay") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
}
