import { WebSocketServer, WebSocket } from "ws";
import { createHash } from "crypto";
import { IncomingMessage } from "http";
import { Socket } from "net";

// In-memory connection pool: key = `${projectId}:${userId}`
const connections = new Map<
  string,
  { ws: WebSocket; agentType: string; assistantId: string; connectedAt: Date }
>();

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Dynamic import for prisma (ESM/CJS compatibility)
async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

// Pending request handlers for chat relay
const pendingRequests = new Map<string, (msg: any) => void>();

export function createRelayServer() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (ws: WebSocket) => {
    let authenticated = false;
    let connectionKey = "";

    // Auth timeout: 5 seconds
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, "Auth timeout");
      }
    }, 5000);

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

            // Success — register connection
            authenticated = true;
            connectionKey = `${projectRecord.id}:${user.id}`;
            connections.set(connectionKey, {
              ws,
              agentType: agentType || "langgraph",
              assistantId: assistantId || "agent",
              connectedAt: new Date(),
            });

            // Update ConnectorSession
            await prisma.connectorSession.upsert({
              where: {
                userId_projectId: {
                  userId: user.id,
                  projectId: projectRecord.id,
                },
              },
              update: {
                status: "online",
                agentType: agentType || "langgraph",
                assistantId: assistantId || "agent",
                connectedAt: new Date(),
                lastPingAt: new Date(),
              },
              create: {
                userId: user.id,
                projectId: projectRecord.id,
                agentType: agentType || "langgraph",
                assistantId: assistantId || "agent",
                status: "online",
              },
            });

            ws.send(
              JSON.stringify({
                type: "auth_ok",
                project: projectRecord.name,
              })
            );
            console.log(
              `[ws-relay] Connector authenticated: user=${user.email} project=${projectRecord.name}`
            );
          } catch (e) {
            console.error("[ws-relay] Auth error:", e);
            ws.close(4002, "Server error");
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
        console.error("[ws-relay] Message parse error:", e);
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
          console.error("[ws-relay] Cleanup error:", e);
        }
        console.log(`[ws-relay] Connector disconnected: ${connectionKey}`);
      }
    });

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);

    ws.on("close", () => clearInterval(heartbeat));
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
