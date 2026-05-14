# Plan 6: WebSocket Relay + Python Connector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable SaaS to call local agents via WebSocket reverse relay. Create the Python connector package (PyPI) and update Chat/Playground/Dataset UI with agent selector.

**Architecture:** SaaS has a `/api/ws-relay` WebSocket endpoint. Python connector connects outbound to SaaS, authenticates with `pc_*` key, receives chat/dataset requests, forwards to local agent, streams responses back. ConnectorSession tracks online/offline state.

**Tech Stack:** WebSocket (ws library on SaaS), Python (websockets + httpx), PyPI packaging

**Depends on:** Plan 1 (ConnectorSession model), Plan 2 (UI pages under [slug])

**Spec:** Section 8

---

### Task 1: WebSocket Relay Server

**Files:**
- Create: `app/api/ws-relay/route.ts`
- Modify: `lib/prisma.ts` (if needed for WS context)

**WebSocket endpoint behavior:**

```
1. Client connects: wss://saas.com/api/ws-relay
2. Server waits for auth frame (5 second timeout):
   { "type": "auth", "key": "pc_xxx", "project": "my-legal-rag",
     "agentUrl": "http://localhost:2024", "agentType": "langgraph", "assistantId": "agent" }
3. Server validates:
   - Hash pc_* key, match against User.relayKeyHash
   - Verify user is member of the project (by slug)
   - If invalid → close with code 4001
4. Server creates/updates ConnectorSession (status: "online")
5. Connection established — server holds reference in memory Map<projectId_userId, WebSocket>
6. Heartbeat: server sends ping every 30s, expects pong within 10s
7. On close: set ConnectorSession.status = "offline"
```

**Request routing (when Chat/Dataset sends a request):**
```
1. Chat UI calls internal API: POST /api/chat-relay
   Body: { projectSlug, targetUserId, messages, threadId }
2. Server looks up WebSocket for (projectId, targetUserId) in memory Map
3. If found → send request through WebSocket:
   { "type": "chat", "requestId": "req_abc", "messages": [...],
     "threadId": "...", "agentType": "langgraph", "assistantId": "agent" }
4. Connector processes and streams back:
   { "requestId": "req_abc", "event": "messages/partial", "data": [...] }
5. Server streams to browser via SSE response
6. On "messages/complete" → close SSE
7. On WebSocket disconnect → send error event to browser
```

**Implementation note:** Next.js App Router does not natively support WebSocket upgrade in API routes. Options:
- Use a custom Next.js server (`server.ts`) with `ws` library
- Or use a separate lightweight WS server (e.g., `ws-server.ts`) running alongside Next.js in the same container
- Recommended: custom server approach — add `server.ts` that handles both Next.js and WS

**Custom server structure:**
```typescript
// server.ts
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";

const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res, parse(req.url!, true)));
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/api/ws-relay") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", handleConnectorConnection);
  server.listen(3000);
});
```

---

### Task 2: Chat Relay API (SSE Bridge)

**Files:**
- Create: `app/api/chat-relay/route.ts`

**POST /api/chat-relay — Browser → SaaS → Connector bridge:**
```
Auth: requireProjectAccess (editor+)
Body: { projectSlug, targetUserId, messages, threadId }

Flow:
1. Look up active WebSocket for targetUserId in project
2. If not found → 404 "Agent not connected"
3. Generate requestId
4. Send request through WebSocket
5. Return SSE stream:
   - Listen for WebSocket messages with matching requestId
   - Forward each chunk as SSE event
   - On "messages/complete" → close stream
   - On timeout (60s) → send error event, close
   - On WebSocket disconnect → send error event, close
```

---

### Task 3: Python Connector Package

**Files:**
- Create: `connector/` directory (separate from main app)
```
connector/
  pyproject.toml
  README.md
  src/
    phoenix_connector/
      __init__.py
      cli.py          — CLI entry point
      client.py       — WebSocket client + reconnection
      forwarder.py    — Agent forwarding (LangGraph + REST SSE)
```

**pyproject.toml:**
```toml
[project]
name = "phoenix-connector"
version = "0.1.0"
description = "Connect local agents to My Own Phoenix SaaS"
requires-python = ">=3.10"
dependencies = [
  "websockets>=12.0",
  "httpx>=0.27",
  "click>=8.0",
]

[project.scripts]
phoenix-connector = "phoenix_connector.cli:main"
```

**cli.py:**
```python
import click
import asyncio
from .client import run_connector

@click.command()
@click.option("--key", required=True, help="Connector key (pc_*)")
@click.option("--agent", required=True, help="Local agent URL")
@click.option("--project", required=True, help="Project slug")
@click.option("--type", "agent_type", default="langgraph", help="Agent type (langgraph|rest)")
@click.option("--assistant-id", default="agent", help="LangGraph assistant ID")
@click.option("--saas-url", default="wss://app.com", help="SaaS WebSocket URL")
def main(key, agent, project, agent_type, assistant_id, saas_url):
    """Connect your local agent to My Own Phoenix SaaS."""
    asyncio.run(run_connector(key, agent, project, agent_type, assistant_id, saas_url))
```

**client.py:**
```python
import json
import asyncio
import websockets
from .forwarder import forward_to_agent

async def run_connector(key, agent_url, project, agent_type, assistant_id, saas_url):
    ws_url = f"{saas_url}/api/ws-relay"
    backoff = 1

    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                # Auth frame
                await ws.send(json.dumps({
                    "type": "auth",
                    "key": key,
                    "project": project,
                    "agentUrl": agent_url,
                    "agentType": agent_type,
                    "assistantId": assistant_id,
                }))

                auth_response = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                if auth_response.get("type") != "auth_ok":
                    print(f"✗ Auth failed: {auth_response.get('error', 'Unknown')}")
                    return

                print(f"✓ Connected to SaaS")
                print(f"✓ Project: {auth_response.get('project', project)}")
                print(f"✓ Agent: {agent_url} ({agent_type})")
                print(f"⏳ Waiting for requests...")
                backoff = 1  # Reset on successful connection

                async for raw in ws:
                    req = json.loads(raw)
                    if req.get("type") == "ping":
                        await ws.send(json.dumps({"type": "pong"}))
                        continue
                    if req.get("type") != "chat":
                        continue

                    # Forward to agent and stream back
                    asyncio.create_task(
                        handle_request(ws, req, agent_url, agent_type, assistant_id)
                    )

        except (websockets.ConnectionClosed, ConnectionRefusedError, OSError) as e:
            print(f"⚠ Disconnected: {e}. Reconnecting in {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

async def handle_request(ws, req, agent_url, agent_type, assistant_id):
    request_id = req["requestId"]
    try:
        async for chunk in forward_to_agent(req, agent_url, agent_type, assistant_id):
            await ws.send(json.dumps({"requestId": request_id, **chunk}))
    except Exception as e:
        await ws.send(json.dumps({
            "requestId": request_id,
            "event": "error",
            "data": {"message": str(e)},
        }))
```

**forwarder.py:**
```python
import json
import httpx

async def forward_to_agent(req, agent_url, agent_type, assistant_id):
    """Forward chat request to local agent, yield response chunks."""
    messages = req.get("messages", [])

    if agent_type == "langgraph":
        yield_from = forward_langgraph(agent_url, messages, assistant_id, req.get("threadId"))
    else:
        yield_from = forward_rest(agent_url, messages, req.get("threadId"))

    async for chunk in yield_from:
        yield chunk

async def forward_langgraph(agent_url, messages, assistant_id, thread_id):
    """Forward via LangGraph SDK HTTP API."""
    async with httpx.AsyncClient(timeout=120) as client:
        # Create thread if needed
        if not thread_id or thread_id.startswith("rest-"):
            r = await client.post(f"{agent_url}/threads", json={})
            thread_id = r.json()["thread_id"]

        # Stream run
        async with client.stream(
            "POST",
            f"{agent_url}/threads/{thread_id}/runs/stream",
            json={
                "assistant_id": assistant_id,
                "input": {"messages": messages},
                "stream_mode": ["messages"],
            },
        ) as response:
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if not raw or raw == "[DONE]":
                    continue
                try:
                    parsed = json.loads(raw)
                    yield {"event": parsed.get("event", "messages/partial"), "data": parsed.get("data", parsed)}
                except json.JSONDecodeError:
                    pass

async def forward_rest(agent_url, messages, thread_id):
    """Forward via REST SSE."""
    async with httpx.AsyncClient(timeout=120) as client:
        full_content = ""
        async with client.stream(
            "POST",
            f"{agent_url}/chat",
            json={"messages": messages, "thread_id": thread_id},
        ) as response:
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if not raw or raw == "[DONE]":
                    continue
                try:
                    parsed = json.loads(raw)
                    chunk = parsed.get("content", "") or parsed.get("delta", "") or ""
                    if chunk:
                        full_content += chunk
                        yield {"event": "messages/partial", "data": [{"type": "ai", "content": full_content}]}
                except json.JSONDecodeError:
                    if raw:
                        full_content += raw
                        yield {"event": "messages/partial", "data": [{"type": "ai", "content": full_content}]}

        if full_content:
            yield {"event": "messages/complete", "data": [{"type": "ai", "content": full_content}]}
```

---

### Task 4: Publish to PyPI

**Steps:**
```bash
cd connector
pip install build twine
python -m build
twine upload dist/*
```

**Test install:**
```bash
pip install phoenix-connector
phoenix-connector --help
```

---

### Task 5: Agent Selector UI

**Files:**
- Create: `components/agent-selector.tsx`
- Modify: `app/[slug]/chat/page.tsx`
- Modify: `app/[slug]/playground/page.tsx`
- Modify: Dataset run trigger component

**Agent selector dropdown (from spec):**
```tsx
interface ConnectedAgent {
  userId: string;
  userName: string;
  status: "online" | "offline";
  agentType: string;
}

// Fetch from: GET /api/projects/[id]/connectors
// Returns list of ConnectorSessions for this project
```

**Dropdown structure:**
```
[▼ My Agent (● Online)]
┌─────────────────────────────────┐
│ MY AGENT                        │
│   My Agent      ● Online        │
│─────────────────────────────────│
│ TEAM AGENTS                     │
│   User B        ● Online        │
│   User C        ○ Offline       │ ← disabled, grayed out
└─────────────────────────────────┘
```

- Default selection: own agent if online, otherwise first online team agent
- Offline agents shown but not selectable
- If no agents online → show "No agents connected" message with connector setup snippet

**Integration with Chat:**
- When user sends message, include `targetUserId` in the request
- Chat relay routes to that user's connector

---

### Task 6: Connector Status in Settings

**Files:**
- Modify: `app/[slug]/settings/page.tsx` (Agent tab)

**Agent tab content (from spec 11.7):**
```
Connected Agents (this project)
────────────────────────────────────────────
You          ● Online   langgraph   agent   since 14:30
User B       ● Online   rest        agent   since 15:10
User C       ○ Offline  —           —       last seen 13:00
```

- Fetch from `/api/projects/[id]/connectors` (GET ConnectorSessions for project)
- Show setup guide snippet for users without active connector
- Real-time status: poll every 10 seconds or use WebSocket event

---

### Task 7: Connector Key Management

**Files:**
- Modify: `app/settings/` (global settings — Connector Key tab)

**Connector Key tab in global settings:**
- Display masked key: `pc_xyz78•••••••ghi`
- [Show] toggle
- [Copy] button
- [Regenerate] button with confirmation
- Setup guide snippet with key pre-filled

**API:** Add endpoint to generate/regenerate connector key:
- `POST /api/user/connector-key` — Generate if not exists
- `PUT /api/user/connector-key` — Regenerate (invalidate old)
- Returns full key once, stores SHA-256 hash in User.relayKeyHash
