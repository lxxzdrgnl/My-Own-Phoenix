# SaaS Multi-Tenant Architecture Design

**Date:** 2026-05-14
**Status:** Draft
**Scope:** Multi-tenancy, shared Phoenix, WebSocket relay connector, security hardening

---

## 1. Problem Statement

Current architecture is single-user, local-only:
- All data (evals, agents, datasets, providers) is global — no user isolation
- Phoenix runs on localhost:6006
- Agent chat requires direct network access to agent (localhost:2024)
- No team collaboration support

**Goal:** Transform into a multi-tenant SaaS where:
- Each user's data is isolated
- Teams can share projects with role-based access
- Agents running locally can connect to SaaS without public URLs
- Phoenix is hosted by SaaS, shared across users

---

## 2. Architecture Overview

```
┌─────────────────────── SaaS Server ───────────────────────┐
│                                                            │
│  Next.js App                                               │
│  ├─ /api/*              ← All routes enforce auth + ACL   │
│  ├─ /api/ws-relay       ← WebSocket hub for connectors    │
│  ├─ /api/collect        ← OTel trace ingestion proxy      │
│  └─ PostgreSQL          ← Multi-tenant data store         │
│                                                            │
│  Phoenix Server (shared)                                   │
│  └─ All users' traces, isolated by project prefix          │
│                                                            │
└────────────────────────────────────────────────────────────┘
        ▲                           ▲
        │ HTTPS                     │ WSS (persistent)
        │                           │
   [Browser]                 [Python Connector]
                                    │
                                    ▼
                             [Local Agent]
```

### Connection Types

| Connection | Direction | Purpose | Auth |
|------------|-----------|---------|------|
| Trace collection | Agent → SaaS | OTel spans/traces | Project API key |
| Relay connector | Agent ← WSS → SaaS | Chat, dataset runs, playground | Project API key |
| Web app | Browser → SaaS | UI | Firebase Auth |

---

## 3. Multi-Tenancy Model

### Approach: Project-Based Access

All data is scoped to projects. Users access projects through membership.

```
User ──owns──> Project (creator, exactly 1 owner)
User ──member of──> Project (editor or viewer)
```

This is the GitHub model — each project (repo) has its own collaborator list. A user can be in different teams per project:

```
Project A → members: User A (owner), User B (editor), User E (viewer)
Project B → members: User A (editor), User C (owner), User D (editor)
```

### Role System

| Role | Data CRUD | Settings | Members | Delete Project | Transfer Ownership |
|------|-----------|----------|---------|----------------|-------------------|
| **owner** | Yes | Yes | Yes | Yes | Yes |
| **editor** | Yes | No | No | No | No |
| **viewer** | Read only | No | No | No | No |

- Every project has exactly 1 owner
- Owner is the creator by default
- Owner can transfer ownership (see section 7)

---

## 4. Data Model Changes

### New Models

```prisma
model Project {
  id            String   @id @default(cuid())
  name          String                         // 표시용 (변경 가능)
  slug          String   @unique               // Phoenix prefix용 (생성 시 고정, immutable)
  traceKeyHash  String                         // SHA-256 hash of pt_* key (프로젝트별)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  members       ProjectMember[]
  inviteCodes   ProjectInviteCode[]
  joinRequests  ProjectJoinRequest[]
  agentConfigs      AgentConfig[]
  datasets          Dataset[]
  evalConfigs       ProjectEvalConfig[]
  connectorSessions ConnectorSession[]
}

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  role      String   @default("editor")   // owner | editor | viewer
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id])

  @@unique([projectId, userId])
  @@index([userId])              // "내 프로젝트 목록" 조회 최적화
}

model ProjectInviteCode {
  id        String    @id @default(cuid())
  projectId String
  code      String    @unique              // "ABC-XY123"
  role      String    @default("editor")   // editor | viewer
  maxUses   Int       @default(0)          // 0 = unlimited
  useCount  Int       @default(0)
  expiresAt DateTime?                      // null = no expiry
  createdBy String                         // userId
  createdAt    DateTime  @default(now())
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  joinRequests ProjectJoinRequest[]

  @@unique([projectId, code])
}

model ProjectJoinRequest {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  codeId    String                         // which invite code was used
  status    String   @default("pending")   // pending | approved | rejected
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id])
  code      ProjectInviteCode @relation(fields: [codeId], references: [id])

  @@unique([projectId, userId])
}
```

### User Model Changes

```prisma
model User {
  id             String              @id
  email          String
  name           String?
  relayKeyHash   String?             // SHA-256 hash of pc_* key (사용자별)
  createdAt      DateTime            @default(now())
  threads        Thread[]
  layouts        DashboardLayout[]
  feedbacks      MessageFeedback[]
  memberships       ProjectMember[]      // 추가
  joinRequests      ProjectJoinRequest[] // 추가
  connectorSessions ConnectorSession[]   // 추가
}
```

### Existing Model Changes

All global models gain a `projectId` or `userId` foreign key for isolation:

| Model | Change | Scoping |
|-------|--------|---------|
| `EvalPrompt` | `projectId` already exists (null=global stays for built-ins) | Project |
| `ProjectEvalConfig` | `projectId` already exists | Project |
| `AgentConfig` | Add `projectId` FK to new `Project` model | Project |
| `AgentTemplate` | Add `userId` — each user registers their own templates | User |
| `Dataset` | Add `projectId` | Project |
| `DatasetRun` | Inherits from Dataset | Project |
| `DashboardLayout` | `userId` + `project` already exists | User+Project |
| `LlmProvider` | Add `userId` — each user manages their own API keys | User |
| `AppSettings` | Add `userId` (null=system-wide, set=user-scoped) | Mixed |
| `RiskItem` | Add `projectId` | Project |
| `Incident` | Add `projectId` | Project |
| `Thread` | `userId` already exists, add `projectId` FK | User+Project |

### LlmProvider Scoping

| Agent Mode | LLM Key Management |
|------------|-------------------|
| **Hosted** (no agent) | User's own API keys via `LlmProvider` (per-user) |
| **BYOA** (relay connector) | Agent uses its own keys — SaaS doesn't need them |

### Database Migration

SQLite → PostgreSQL. Required for:
- Concurrent writes (multi-user)
- Horizontal scaling
- Row-level security capabilities
- Production-grade reliability

Prisma schema change: `provider = "sqlite"` → `provider = "postgresql"` in datasource block. All existing queries remain compatible — Prisma abstracts the dialect.

### 환경별 PostgreSQL 구성

```yaml
# docker-compose.yml (개발)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: phoenix
      POSTGRES_USER: phoenix
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    environment:
      DATABASE_URL: postgresql://phoenix:${POSTGRES_PASSWORD}@postgres:5432/phoenix
    depends_on:
      - postgres

volumes:
  pgdata:
```

```bash
# 프로덕션 (미니PC의 외부 PostgreSQL 사용)
DATABASE_URL=postgresql://user:password@minipc-ip:5432/phoenix_prod
```

- 개발: Docker Compose에 PostgreSQL 포함, 로컬에서 완결
- 프로덕션: 미니PC에서 운영 중인 PostgreSQL에 연결 (DATABASE_URL만 변경)
- Phoenix 컨테이너도 동일 Docker Compose에 포함

---

## 5. Project Invite Flow

### Code-Based Invitation with Owner Approval

```
1. Owner generates invite code in Project Settings
2. Owner shares code with teammate (Slack, chat, etc.)
3. Teammate enters code in "Join Project" UI
4. JoinRequest created (status: pending)
5. Owner sees pending request in Project Settings
6. Owner approves → ProjectMember created
   Owner rejects → request marked rejected
```

### Security Controls

| Control | Implementation |
|---------|---------------|
| Code brute-force | Rate limiting on join endpoint (5 attempts/min) |
| Code entropy | Minimum 128-bit random, base62-encoded (~22 chars), CSPRNG generated server-side |
| Code expiry | `expiresAt` field, checked on use |
| Usage limit | `maxUses` / `useCount`, checked on use |
| Unknown users | Owner approval gate — code alone doesn't grant access |
| Revocation | Owner can delete invite code anytime |
| Owner notification | Join request 도착 시 in-app badge (Settings 아이콘에 숫자 뱃지). 이메일 알림은 future scope |

### UI: Project Settings > Members Tab

```
Members
────────────────────────────────────────────
user-a@gmail.com    owner     [Transfer Ownership]
user-b@gmail.com    editor ▼  [Remove]
user-c@gmail.com    viewer ▼  [Remove]

Pending Requests
────────────────────────────────────────────
user-d@gmail.com    2 min ago    [Approve] [Reject]

Invite Codes
────────────────────────────────────────────
ABC-XY123    editor    3/10 used    expires 2026-05-21    [Copy] [Delete]

[+ Generate Code]  role: [editor ▼]  max uses: [10]  expires: [7 days ▼]
```

### UI: Join Project (accessible from sidebar or nav)

```
┌──────────────────────────┐
│ Join a Project           │
│                          │
│ Code: [________] [Join]  │
│                          │
│ Status: Waiting for      │
│ owner approval...        │
└──────────────────────────┘
```

---

## 6. Shared Phoenix

### How It Works

SaaS hosts a single Phoenix instance. All users' traces are stored in the same Phoenix, isolated by project-scoped naming:

```
Phoenix project name = "{saas_project_id}_{user_project_name}"
Example: "clx1abc_my-legal-rag"
```

### Trace Collection Flow

```
User's Agent (local)
    │
    │  OTel HTTP POST (outbound — no firewall issue)
    │  Header: Authorization: Bearer pt_abc123
    │
    ▼
SaaS /api/collect endpoint
    │
    │  Validates API key → resolves to project
    │  Prefixes project name for isolation
    │
    ▼
SaaS-hosted Phoenix server
    │
    ▼
Traces stored & queryable via SaaS web UI
```

**CRITICAL: Phoenix는 인터넷에 노출하면 안 됨.** Phoenix 자체 API에는 접근 제어가 없으므로, 프로젝트명을 알면 누구든 trace를 읽을 수 있음. SaaS 서버만 Phoenix에 네트워크 접근이 가능해야 하며, Phoenix는 internal network에서만 접근 가능하도록 구성.

**프로젝트 이름은 immutable slug 사용.** 사용자가 프로젝트명을 변경해도 Phoenix 내부 프로젝트 prefix는 변경되지 않아야 함. 변경 시 기존 trace가 고아가 됨. `Project.slug` (생성 시 고정) vs `Project.name` (표시용, 변경 가능)으로 분리.

### User Setup

Users install OTel instrumentation in their agent code:

```bash
pip install openinference-instrumentation-openai arize-phoenix-otel
```

```python
# Agent code
import os
os.environ["PHOENIX_API_KEY"] = "pt_abc123"
os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = "https://our-saas.com/collect"

# Instrumentation (example for OpenAI)
from openinference.instrumentation.openai import OpenAIInstrumentor
OpenAIInstrumentor().instrument()
```

No Phoenix server installation needed. The SaaS provides the collector endpoint.

---

## 7. Owner Transfer

### Flow

1. Owner clicks "Transfer Ownership" next to a member
2. Confirmation modal appears:
   - Shows target member name
   - Warning: "You will become editor. This cannot be undone."
   - Requires typing project name to confirm
3. On confirm:
   - Target member → `role: "owner"`
   - Current owner → `role: "editor"`
4. Exactly 1 owner at all times (atomic transaction)

### UI: Transfer Modal

```
┌────────────────────────────────┐
│ Transfer Ownership             │
│                                │
│ Transfer to: user-b@gmail.com  │
│                                │
│ ⚠ You will become editor.     │
│ This cannot be undone.         │
│                                │
│ Type project name to confirm:  │
│ [________________]             │
│                                │
│          [Cancel] [Transfer]   │
└────────────────────────────────┘
```

---

## 8. WebSocket Relay Connector

### Purpose

Allow SaaS to call agents running on user's local machine (behind firewall/NAT) for:
- Chat testing
- Dataset runs
- Playground

### Architecture

```
┌─── SaaS Server ─────────┐         ┌─── User's Machine ──────┐
│                          │         │                          │
│  Browser (chat UI)       │         │  Connector (Python)      │
│       │                  │         │       │                  │
│       ▼                  │  WSS    │       ▼                  │
│  /api/ws-relay ◄─────────┼─────────┤  WebSocket client       │
│       │                  │         │       │                  │
│  Route request to        │         │  Forward to local agent  │
│  correct connector       │         │       │                  │
│                          │         │       ▼                  │
│                          │         │  http://localhost:2024   │
└──────────────────────────┘         └──────────────────────────┘
```

### Connector Package

**Distribution:** Python package via PyPI

```bash
pip install phoenix-connector
```

**Usage:**

```bash
phoenix-connector --key=pc_user123 --agent=http://localhost:2024

# Output:
# ✓ Connected to SaaS (wss://our-saas.com/api/ws-relay)
# ✓ Project: my-legal-rag
# ✓ Agent: http://localhost:2024
# ✓ Waiting for requests...
```

**Core logic (~100 lines):**

```python
import asyncio
import websockets
import httpx

async def main(key: str, agent_url: str, saas_url: str):
    async with websockets.connect(
        f"{saas_url}/api/ws-relay?key={key}"
    ) as ws:
        async for raw in ws:
            req = json.loads(raw)
            
            if req["type"] != "chat":
                continue
            
            # Forward to local agent
            async with httpx.AsyncClient() as client:
                response = client.stream(
                    "POST",
                    f"{agent_url}/runs/stream",
                    json={"input": {"messages": req["messages"]}, ...}
                )
                
                # Stream response chunks back to SaaS
                async for chunk in response.aiter_bytes():
                    await ws.send(json.dumps({
                        "requestId": req["requestId"],
                        "chunk": chunk.decode()
                    }))
```

### Protocol: SaaS ↔ Connector

**Authentication (auth frame, NOT query parameter):**

Key를 URL query에 넣으면 서버 로그/프록시 로그에 노출됨. 대신 연결 후 첫 메시지로 인증:

```
1. Connector connects: wss://saas.com/api/ws-relay (no key in URL)
2. Connector sends auth frame: {"type": "auth", "key": "pc_user123"}
3. SaaS validates key → resolves to project → accepts or closes connection
4. SaaS responds: {"type": "auth_ok", "project": "my-legal-rag"} or closes with 4001
```

**Request (SaaS → Connector):**
```json
{
  "type": "chat",
  "requestId": "req_abc",
  "messages": [{"role": "user", "content": "Hello"}],
  "threadId": "thread_123",
  "agentType": "langgraph",
  "assistantId": "agent"
}
```

**Response stream (Connector → SaaS):**
```json
{"requestId": "req_abc", "event": "messages/partial", "data": [{"type": "ai", "content": "Hel"}]}
{"requestId": "req_abc", "event": "messages/partial", "data": [{"type": "ai", "content": "Hello!"}]}
{"requestId": "req_abc", "event": "messages/complete", "data": [{"type": "ai", "content": "Hello! How can I help?"}]}
```

### Agent Type Support

The connector handles protocol translation locally:

| agentType in request | Connector action |
|---------------------|-----------------|
| `langgraph` | Uses LangGraph SDK to call `client.runs.stream()` |
| `rest` | POST to `{agent_url}/chat` with SSE streaming |

SaaS doesn't need to know the agent protocol — it sends a unified message format.

### Project API Keys: Scoped by Purpose

단일 키의 보안 문제: trace 키가 유출되면 relay 연결도 가능해짐.
2종류의 scoped key 발급, **scope가 다름:**

| Key | Prefix | Scope | 발급 단위 | 이유 |
|-----|--------|-------|----------|------|
| Trace key | `pt_` | OTel trace 수집 | **프로젝트별** | trace는 팀이 같은 프로젝트에 수집 |
| Connector key | `pc_` | WebSocket relay | **사용자별** | 에이전트는 각자 로컬에서 실행 |

```python
# 에이전트 코드에서 (팀 공유 — 같은 프로젝트 키)
PHOENIX_API_KEY=pt_abc123              # trace용 (프로젝트별)
```

```bash
# 커넥터에서 (개인 — 각자 자기 키)
phoenix-connector --key=pc_xyz789      # relay용 (사용자별)
```

사용자별 커넥터의 장점:
- A가 테스트 중에 B가 연결해도 A 안 끊김
- 동시에 각자 에이전트 테스트 가능
- 커넥터가 없는 사용자는 Hosted 모드로 동작 가능

커넥터 연결 시 **프로젝트를 지정**:
```bash
phoenix-connector --key=pc_bbb... --agent=http://localhost:2024 --project=my-legal-rag
```

프로젝트별로 연결된 커넥터만 표시:
```
프로젝트 "my-legal-rag":
├── User A → localhost:2024  ● Online
├── User B → localhost:2024  ● Online
└── User C → 없음

프로젝트 "finance-bot":
├── User B → localhost:3000  ● Online    ← B의 다른 에이전트
└── User D → localhost:5000  ● Online
```

한 사용자가 여러 프로젝트에 각각 다른 에이전트를 연결 가능.
Chat/Dataset에서는 **현재 프로젝트에 연결된 커넥터만** 드롭다운에 표시.

### 프로젝트별 에이전트 설정

커넥터 연결 시 에이전트 설정을 함께 등록:

```bash
phoenix-connector --key=pc_bbb... \
  --project=my-legal-rag \
  --agent=http://localhost:2024 \
  --type=langgraph \
  --assistant-id=agent
```

커넥터가 SaaS에 연결되면 auth frame에 설정 포함:
```json
{
  "type": "auth",
  "key": "pc_bbb...",
  "project": "my-legal-rag",
  "agentUrl": "http://localhost:2024",
  "agentType": "langgraph",
  "assistantId": "agent"
}
```

SaaS가 이 정보를 DB에 저장:

```prisma
model ConnectorSession {
  id          String   @id @default(cuid())
  userId      String
  projectId   String
  agentType   String   @default("langgraph")  // langgraph | rest
  assistantId String   @default("agent")
  status      String   @default("online")     // online | offline
  connectedAt DateTime @default(now())
  lastPingAt  DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([userId, projectId])              // 사용자당 프로젝트당 1개
  @@index([projectId, status])               // "이 프로젝트의 온라인 커넥터" 조회
}
```

- 커넥터 연결 시 → `ConnectorSession` 생성/갱신 (status: online)
- 커넥터 끊김 시 → status: offline 으로 변경
- heartbeat (30초 간격) → `lastPingAt` 갱신
- `lastPingAt`이 60초 이상 지나면 dead connection으로 간주

Settings > Agent 탭에서 확인 가능:
```
Connected Agents (this project)
────────────────────────────────────────────
You          ● Online   langgraph   agent   since 14:30
User B       ● Online   rest        agent   since 15:10
User C       ○ Offline  —           —       last seen 13:00
```

### 에이전트 선택: 팀원 에이전트 사용 가능

Chat, Playground, Dataset 실행 시 **어떤 에이전트를 쓸지 선택** 가능:

```
[Chat 페이지 상단]

Agent: [▼ My Agent (● Online)              ]
       ┌─────────────────────────────────────┐
       │ MY AGENT                            │
       │   My Agent         ● Online         │
       │─────────────────────────────────────│
       │ TEAM AGENTS                         │
       │   User B's Agent   ● Online         │
       │   User C's Agent   ○ Offline        │
       └─────────────────────────────────────┘
```

- 기본값: 내 에이전트 (자동 선택)
- 팀원 에이전트도 선택 가능 (Online인 것만 사용 가능)
- Offline 에이전트는 표시하되 선택 불가 (grayed out)
- Dataset run 시에도 동일한 에이전트 선택 드롭다운
- 요청은 선택된 사용자의 커넥터를 통해 라우팅

- 각 키는 독립적으로 회전 가능
- Trace key는 프로젝트 멤버 모두 볼 수 있음
- Connector key는 본인만 볼 수 있음 (개인 키)
- 키는 DB에 **해싱 저장** (SHA-256). 생성 시 1회만 전체 표시 (GitHub/Stripe 방식)

---

## 9. Security

### 9.1 Critical Fixes (Pre-SaaS)

#### localhost Auth Bypass (auth-server.ts:23-26)

**Current (vulnerable):**
```typescript
if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.startsWith("python-httpx")) return "internal-service";
}
```

User-Agent is trivially spoofable. In SaaS, container-to-container communication uses internal hostnames that could match.

**Fix:** Replace with internal service token (timing-safe comparison):
```typescript
import { timingSafeEqual } from "crypto";

const internalToken = req.headers.get("X-Internal-Token");
const expected = process.env.INTERNAL_SERVICE_TOKEN; // min 256-bit, auto-generated
if (internalToken && expected &&
    timingSafeEqual(Buffer.from(internalToken), Buffer.from(expected))) {
  return "internal-service";
}
```
- Remove the `host.startsWith("localhost")` guard entirely (containers use internal hostnames)
- `INTERNAL_SERVICE_TOKEN` must be at least 256 bits, generated automatically on first deploy

#### Hardcoded Salt (crypto.ts:9)

**Current (weak):**
```typescript
return scryptSync(secret, "salt", 32);
```

**Fix:** Random salt per encryption, stored alongside ciphertext:
```typescript
const salt = randomBytes(16);
const key = scryptSync(secret, salt, 32);
// Store: salt:iv:authTag:encrypted
```

**Migration path:** During PostgreSQL migration, run a one-time data migration:
1. Decrypt all existing LlmProvider API keys using old scheme (hardcoded salt, 3-part format)
2. Re-encrypt with new scheme (random salt, 4-part format)
3. Code must handle both formats during transition period

### 9.2 Data Isolation

Every API route must enforce:

1. **Authentication:** `requireAuth(req)` → get userId
2. **Authorization:** Check `ProjectMember` for userId + projectId + required role
3. **Query scoping:** All DB queries include `where: { projectId }` or `where: { userId }`

```typescript
// Example: middleware pattern
async function requireProjectAccess(
  req: NextRequest,
  projectId: string,
  minRole: "viewer" | "editor" | "owner"
): Promise<string | NextResponse> {
  const uid = await requireAuth(req);
  if (uid instanceof NextResponse) return uid;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } }
  });

  if (!member) return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  if (!hasMinRole(member.role, minRole)) return apiError(req, ErrorCode.FORBIDDEN, "Insufficient role");

  return uid;
}
```

### 9.3 WebSocket Relay Security

| Threat | Mitigation |
|--------|-----------|
| Key theft | Scoped keys (pc_* for relay only), rotation, WSS (TLS) only |
| Connection spam | Rate limit: max 5 connections/key/minute |
| Malicious requests | Connector only forwards `type: "chat"` messages |
| Man-in-the-middle | WSS (TLS) enforced, reject plain WS |
| Multiple connectors | Per-project: only 1 active connector at a time (new connection replaces old) |
| Connector impersonation | Auth frame (not query param), key validates against project |
| **Disconnect mid-request** | SaaS sends `{"event": "error", "message": "Agent disconnected"}` to browser. Browser shows retry prompt |
| **Reconnection** | Connector auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s). Pending requests are failed with timeout |
| **멤버 제거 시** | 제거된 사용자의 ConnectorSession 삭제, 활성 WebSocket 즉시 종료 |
| **프로젝트 삭제 시** | 모든 ConnectorSession cascade 삭제, 활성 WebSocket 종료 |

### 9.4 API Key Security (User LLM Keys)

| Concern | Mitigation |
|---------|-----------|
| Key storage | AES-256-GCM encryption (existing, fix salt) |
| Key management | Cloud KMS recommended for production (AWS KMS / GCP KMS) |
| Key access | Only the owning user can view/decrypt their keys |
| Key display | Always masked in UI (`sk-•••abc`) |

### 9.5 API Key Security (Trace + Connector)

| Concern | Mitigation |
|---------|-----------|
| Trace key format | `pt_{projectId_short}_{random}` — 프로젝트별 |
| Connector key format | `pc_{userId_short}_{random}` — 사용자별 |
| Key storage | SHA-256 해싱 저장, 생성 시 1회만 전체 표시 |
| Trace key rotation | Owner가 프로젝트 설정에서 재발급 |
| Connector key rotation | 본인이 글로벌 설정에서 재발급 |
| Trace key visibility | 프로젝트 멤버 모두 열람 가능 |
| Connector key visibility | 본인만 열람 가능 (글로벌 설정에서) |

### 9.6 Infrastructure

| Item | Current | SaaS Required |
|------|---------|---------------|
| Database | SQLite | PostgreSQL |
| Rate limiting | None | All API routes (e.g., 100 req/min per user) |
| CORS | Not configured | Strict origin whitelist |
| HTTPS | Not enforced | Required (all endpoints) |
| Logging | Console only | Structured logging + audit trail |

---

## 10. UI Direction & Visual Design

### 10.0 디자인 방향 전환

기존 흑백(monochrome) UI에서 벗어나, 밝고 정보 밀도 높은 대시보드 스타일로 전환.

**레퍼런스:** LiteLLM Dashboard

**변경 포인트:**

| 요소 | 기존 | 변경 |
|------|------|------|
| 배경 | `background` (흑/백 단색) | 밝은 그레이 (`#f8f9fb`) 위에 화이트 카드 |
| 카드 | 얇은 1px border | 라운드(12px) + 미세 shadow (`shadow-sm`) |
| 차트 색상 | `#3b82f6` 단색 | 다색 — 상태별, 모델별 고유 색상 |
| 뱃지/라벨 | 흑백 variants만 | 컬러 뱃지 (파스텔 배경 + 진한 텍스트) |
| 기간 선택 | DateRangePicker | 탭형 버튼 그룹 (24H, 7D, 1M, 3M) + Custom |
| 숫자 표시 | 작은 텍스트 | 대형 볼드 숫자 (stat cards) |
| 테이블 | border 기반 | 깔끔한 행 구분 (divider만) |

**색상 팔레트 확장:**

```
Base:      #f8f9fb (page bg), #ffffff (card bg), #1a1a2e (text)
Primary:   #3b82f6 (blue — 주요 지표, 성공)
Secondary: #10b981 (emerald — success/pass)
Warning:   #f59e0b (amber — warning)
Danger:    #ef4444 (red — error/fail)
Chart palette: [#3b82f6, #10b981, #f59e0b, #ef4444, #8b5cf6, #ec4899, #06b6d4]
Badge palette: 모델별 파스텔 — mint, peach, lavender, sky, sand 등
```

---

## 11. UI Flows

### 11.0 메인 진입: 프로젝트 카드 목록 → 대시보드

```
[로그인 후 첫 화면] — "/" (홈)

프로젝트가 있는 사용자:

┌─────────────────────────────────────────────────────────────┐
│ Nav: My Own Phoenix                              [User ▼]   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  My Projects                              [+ New] [Join]    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ my-legal-rag │  │ finance-bot  │  │ team-chatbot │      │
│  │              │  │              │  │              │      │
│  │ ● Connected  │  │ ○ No agent   │  │ ● Connected  │      │
│  │              │  │              │  │              │      │
│  │ Traces: 1.2K │  │ Traces: 340  │  │ Traces: 5.6K│      │
│  │ Evals: 890   │  │ Evals: 120   │  │ Evals: 4.1K │      │
│  │ Pass: 94.2%  │  │ Pass: 87.1%  │  │ Pass: 91.8% │      │
│  │              │  │              │  │              │      │
│  │ owner        │  │ editor       │  │ viewer       │      │
│  │ 3 members    │  │ 2 members    │  │ 5 members    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Shared with me                                             │
│                                                             │
│  ┌──────────────┐                                           │
│  │ data-pipeline│                                           │
│  │              │                                           │
│  │ ...          │                                           │
│  └──────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘

카드 디자인:
- 화이트 배경, rounded-xl, shadow-sm
- 상단: 프로젝트명 (font-semibold)
- 중간: 핵심 지표 3개 (Traces, Evals, Pass Rate)
- 커넥터 상태: ● 초록 dot (연결) / ○ 회색 (미연결)
- 하단: 역할 뱃지 + 멤버 수
- hover: shadow-md 전환, 커서 pointer
- 클릭 시 → 해당 프로젝트의 Dashboard로 이동
```

```
[카드 클릭] → /dashboard?project=my-legal-rag

┌─────────────────────────────────────────────────────────────┐
│ Nav: My Own Phoenix  [← Projects]  [▼ my-legal-rag]  ...   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Dashboard                                                    │
│                                                              │
│ [24H] [7D] [1M] [3M] [Custom]           [Show Filters]      │
│                                                              │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ Total Traces     │ │ Total Errors    │ │ Top Models      │ │
│ │                  │ │                 │ │                 │ │
│ │ 3,310,278        │ │   [donut chart] │ │ gpt-4o  1.4M   │ │
│ │                  │ │    4,273        │ │ claude  794K    │ │
│ │ [area chart]     │ │  Total Errors   │ │ gemini  562K    │ │
│ │ success / error  │ │ 400 / 401 / 500│ │                 │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
│                                                              │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ Costs            │ │ Eval Pass Rate  │ │ Latency         │ │
│ │ $93,128.22       │ │ 94.2%           │ │ 6.058 s / req   │ │
│ │ [bar chart]      │ │ [trend chart]   │ │ [line chart]    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘

대시보드에서 다른 페이지로:
- Nav의 Chat, Projects, Evaluations, Datasets, Settings 클릭
- 모두 현재 선택된 프로젝트 컨텍스트 유지
- [← Projects] 클릭 시 프로젝트 카드 목록으로 복귀
```

```
프로젝트 없는 사용자 — "/" (홈):

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│           Welcome to My Own Phoenix                         │
│                                                             │
│     Create a project or join an existing one                │
│     to start monitoring your AI agents.                     │
│                                                             │
│     [Create Project]     [Join with Code]                   │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 11.1 Onboarding: 신규 가입 → 첫 trace 수집까지

```
[1] 랜딩 / 로그인
    사용자가 SaaS에 접속 → Sign in 버튼 → Firebase Auth (Google/GitHub/Email)
        │
        ▼
[2] 프로젝트 없음 상태
    로그인 후 프로젝트가 0개 → 전체 화면 EmptyState:
    "Create your first project to get started"
    [Create Project] 버튼
        │
        ▼
[3] 프로젝트 생성 모달
    ┌────────────────────────────────────┐
    │ Create Project                     │
    │                                    │
    │ Project Name                       │
    │ [my-legal-rag              ]       │
    │                                    │
    │ Description (optional)             │
    │ [                          ]       │
    │                                    │
    │           [Cancel] [Create]        │
    └────────────────────────────────────┘
    Create 클릭 → Project 생성 + API key 자동 발급
        │
        ▼
[4] Setup Guide 화면 (프로젝트 생성 직후 1회 표시)
    전체 화면, 3단계 스텝 가이드:

    ┌─ Step 1: Collect Traces ──────────────────────────────┐
    │                                                        │
    │  Trace Key:     pt_abc123...def    [Copy]              │
    │  Connector Key: pc_xyz789...ghi    [Copy]              │
    │  Endpoint:      https://app.com/collect  [Copy]        │
    │                                                        │
    │  Install in your agent:                                │
    │  ┌──────────────────────────────────────────────┐      │
    │  │ pip install arize-phoenix-otel               │ [Copy]│
    │  │                                              │      │
    │  │ import os                                    │      │
    │  │ os.environ["PHOENIX_API_KEY"] = "pk_abc..."  │      │
    │  │ os.environ["PHOENIX_COLLECTOR_ENDPOINT"] =   │      │
    │  │   "https://app.com/collect"                  │      │
    │  └──────────────────────────────────────────────┘      │
    │                                                        │
    │  Status: ○ Waiting for first trace...                  │
    │          (자동 폴링 — trace 도착 시 ✓ 로 변경)          │
    └────────────────────────────────────────────────────────┘

    ┌─ Step 2: Connect Agent (Optional) ────────────────────┐
    │                                                        │
    │  Chat, Playground, Dataset에서 에이전트를 호출하려면:    │
    │  ┌──────────────────────────────────────────────┐      │
    │  │ pip install phoenix-connector               │ [Copy]│
    │  │ phoenix-connector --key=pc_user123 \          │      │
    │  │   --agent=http://localhost:2024              │      │
    │  └──────────────────────────────────────────────┘      │
    │                                                        │
    │  Status: ○ No connector connected                      │
    └────────────────────────────────────────────────────────┘

    ┌─ Step 3: Invite Team (Optional) ──────────────────────┐
    │                                                        │
    │  Share this project with teammates.                    │
    │  [Generate Invite Code]                                │
    │                                                        │
    │  You can do this later in Settings > Members.          │
    └────────────────────────────────────────────────────────┘

    [Skip, go to Dashboard →]
        │
        ▼
[5] Dashboard (프로젝트 선택된 상태)
    trace가 들어오기 시작하면 차트/위젯에 데이터 표시
```

### 11.2 Onboarding: 초대받은 사용자

```
[1] 팀원이 초대 코드를 받음 (Slack, 카톡 등으로)
    "ABC-XY123"
        │
        ▼
[2] 로그인 후 → Nav에 [Join Project] 버튼 or
    프로젝트 0개 상태에서 "Join existing project" 링크
        │
        ▼
[3] Join 모달
    ┌────────────────────────────────────┐
    │ Join a Project                     │
    │                                    │
    │ Invite Code                        │
    │ [ABC-XY123               ] [Join]  │
    │                                    │
    └────────────────────────────────────┘
        │
        ▼
[4] 대기 상태
    ┌────────────────────────────────────┐
    │ Join a Project                     │
    │                                    │
    │ ✓ Code accepted                    │
    │                                    │
    │ Project: my-legal-rag              │
    │ Status:  Waiting for owner         │
    │          approval...               │
    │                                    │
    │ You'll get access once the         │
    │ project owner approves.            │
    │                                    │
    │                          [Close]   │
    └────────────────────────────────────┘
        │
        ▼
[5] Owner가 승인 (Settings > Members에서)
        │
        ▼
[6] 팀원의 ProjectSelector에 프로젝트 나타남 → 접근 가능
```

### 11.3 네비게이션 구조 변경: Project-first + Sidebar

```
현재: 상단 Nav에 모든 페이지 링크 + 각 페이지에서 ProjectSelector
변경: 프로젝트를 먼저 선택 → 프로젝트 안에서는 좌측 사이드바 네비게이션

[URL 구조]

/                              → 프로젝트 카드 목록 (메인 홈)
/{slug}/dashboard              → 대시보드
/{slug}/traces                 → 트레이스 (기존 /projects)
/{slug}/chat                   → 채팅
/{slug}/playground             → 플레이그라운드
/{slug}/evaluations            → 평가
/{slug}/datasets               → 데이터셋
/{slug}/settings               → 프로젝트 설정
/settings                      → 글로벌 설정 (Providers, Profile, Templates)

Next.js App Router: app/[slug]/dashboard/page.tsx 등
slug = Project.slug (immutable, 생성 시 고정)
```

```
[접근 제어]

비로그인 사용자:
  /{slug}/* 접근 → 로그인 페이지로 리다이렉트

로그인했지만 프로젝트 멤버가 아닌 사용자:
  /{slug}/* 접근 → 403 페이지:
  ┌────────────────────────────────────────┐
  │                                        │
  │  Access Denied                         │
  │                                        │
  │  You don't have access to this         │
  │  project. Ask the project owner        │
  │  for an invite code.                   │
  │                                        │
  │  [← Back to Projects]  [Join Project]  │
  │                                        │
  └────────────────────────────────────────┘

존재하지 않는 slug:
  /{slug}/* 접근 → 404 페이지

구현: app/[slug]/layout.tsx에서 미들웨어로 처리
  1. Firebase Auth 확인 → 미인증 시 로그인 리다이렉트
  2. slug로 Project 조회 → 없으면 404
  3. ProjectMember에서 userId + projectId 조회 → 없으면 403
  4. role 확인 → viewer인데 write 페이지면 읽기 전용 모드
```

```
[전체 흐름]

로그인 → "/" 프로젝트 카드 목록 (11.0)
              │
              │ 카드 클릭
              ▼
         /{slug}/dashboard
              │
              │ 사이드바에서 페이지 이동
              ├── /{slug}/dashboard
              ├── /{slug}/traces
              ├── /{slug}/chat
              ├── /{slug}/playground
              ├── /{slug}/evaluations
              ├── /{slug}/datasets
              └── /{slug}/settings
```

```
[프로젝트 안: 사이드바 + 콘텐츠 레이아웃]

┌──────────┬──────────────────────────────────────────────┐
│          │                                              │
│  ← Back  │  Dashboard                                   │
│          │                                              │
│ my-legal │  [24H] [7D] [1M] [3M] [Custom]  [Filters]   │
│ -rag     │                                              │
│ ● Online │  ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│          │  │ Requests   │ │ Errors     │ │Top Models│ │
│──────────│  │ 3,310,278  │ │  [donut]   │ │gpt-4o   │ │
│          │  │ [area      │ │   4,273    │ │claude   │ │
│ Dashboard│  │  chart]    │ │ Total Err  │ │gemini   │ │
│ Traces   │  └────────────┘ └────────────┘ └──────────┘ │
│ Chat     │                                              │
│Playground│  ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│ Evals    │  │ Costs      │ │ Pass Rate  │ │ Latency  │ │
│ Datasets │  │ $93,128    │ │ 94.2%      │ │ 6.05s    │ │
│          │  │ [bar chart]│ │ [trend]    │ │ [line]   │ │
│──────────│  └────────────┘ └────────────┘ └──────────┘ │
│ Settings │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘

사이드바 구성 (Helicone 스타일, 접이식):
- 상단: [← Back] 버튼 → "/" 프로젝트 목록으로 복귀
- 프로젝트명 + 커넥터 상태 (● Online / ○ Offline)
- 구분선
- ANALYTICS
  - Dashboard     (위젯 그리드 — 기존 /dashboard의 드래그 가능 위젯 17개)
  - Overview      (stat cards + 차트 — 기존 Traces 탭의 상단 12개 지표)
  - Requests      (trace 로그 테이블 — 기존 Traces 탭의 하단)
- DEVELOP
  - Chat          (에이전트 채팅 테스트)
  - Playground    (프롬프트 테스트)
- QUALITY
  - Evaluations   (자동 평가 — eval worker, backfill)
  - Measure       (RMF 점수, Gap Analysis — 기존 Measure 탭)
  - Datasets      (데이터셋)
  - Risks         (기존 Risk Management 탭)
- 구분선
- Settings
- 하단: 글로벌 설정 링크

* 사이드바 접기/펼치기 가능 (아이콘만 / 아이콘+텍스트)
* 접힌 상태에서는 아이콘만 표시, hover 시 툴팁

* 상단 Nav바 제거 — 사이드바가 네비게이션 전담
* 기존 각 페이지의 ProjectSelector 제거
* 프로젝트 전환 = [← Back]으로 카드 목록 → 다른 카드 클릭
* 탭 2개에서 다른 프로젝트 동시 열기 가능 (URL에 slug 포함)
* 링크 공유 가능 (팀원에게 "/{slug}/dashboard" 보내면 바로 접근)
```

```
[기존 기능 매핑]

기존 URL/기능                    → 변경 URL
/                                → /                     프로젝트 카드 목록 (신규)
/ (Chat)                         → /{slug}/chat
/playground                      → /{slug}/playground
/projects/[name] Traces탭 상단   → /{slug}/overview      stat cards + 12개 지표 차트
/dashboard (위젯 그리드)          → /{slug}/dashboard     드래그 가능 위젯 대시보드
/projects/[name] Traces탭 하단   → /{slug}/requests      trace 로그 테이블 분리
/projects/[name] Measure탭       → /{slug}/measure       독립 페이지로 분리
/projects/[name] Risk탭          → /{slug}/risks         독립 페이지로 분리
/evaluations                     → /{slug}/evaluations
/datasets                        → /{slug}/datasets
/dashboard                       → /{slug}/dashboard     기존 대시보드 위젯과 통합
/settings                        → /{slug}/settings      프로젝트 설정
                                 → /settings             글로벌 설정 (Providers 등)

* 기존 project-view.tsx의 3탭을 각각 독립 페이지로 분리
* 코드는 기존 컴포넌트를 재활용 (이동만)
* 상단 Nav → 좌측 사이드바로 이동
* ProjectSelector 제거, URL param [slug]에서 읽기
```

### 11.4 Settings 분리: 프로젝트 설정 vs 글로벌 설정

```
Settings가 두 곳으로 분리:

[1] 프로젝트 설정 — /{slug}/settings
    사이드바에서 Settings 클릭

    ┌──────────┬─────────────────────────────────────────┐
    │          │                                         │
    │ ← Back   │  [Settings 서브탭]                      │
    │          │                                         │
    │ my-legal │  ┌─ 탭: API Keys | Members |            │
    │ -rag     │  │      Agent | Eval | Danger Zone      │
    │ ● Online │  │                                      │
    │──────────│  │  (선택된 탭의 내용 표시)               │
    │          │  │                                      │
    │ Dashboard│  └──────────────────────────────────────│
    │ Traces   │                                         │
    │ Chat     │                                         │
    │Playground│                                         │
    │ Evals    │                                         │
    │ Datasets │                                         │
    │──────────│                                         │
    │ Settings │ ← active                                │
    │          │                                         │
    └──────────┴─────────────────────────────────────────┘

    Settings 서브탭:
    - API Keys:     Trace key (pt_*), Connector key (pc_*), Endpoint, Quick Start
    - Members:      팀 관리, 역할, 초대 코드, 승인 대기
    - Agent:        에이전트 설정 (type, endpoint), Connector 상태
    - Eval:         Eval Worker config, 평가 프롬프트
    - Chat:         Starter questions
    - Danger Zone:  프로젝트 삭제 (owner만)

[2] 글로벌 설정 — /settings
    사이드바 하단 또는 프로젝트 목록 화면에서 접근

    ┌─ Global Settings ─────────────────────────────────────┐
    │                                                        │
    │  ┌─ 탭: Profile | Providers | Agent Templates          │
    │  │                                                     │
    │  │  (선택된 탭의 내용 표시)                              │
    │  │                                                     │
    │  └─────────────────────────────────────────────────────│
    │                                                        │
    └────────────────────────────────────────────────────────┘

    - Profile:          이름, 이메일 (Firebase)
    - Connector Key:    내 커넥터 키 (pc_*) 조회/재발급
    - Providers:        LLM API keys (per-user, OpenAI/Anthropic/Google/xAI)
    - Agent Templates:  재사용 가능한 에이전트 템플릿

* 프로젝트 설정: 프로젝트에 종속 (keys, members, agent, eval)
* 글로벌 설정: 사용자에 종속 (LLM keys, templates, profile)
```

### 11.5 Settings > General (변경)

```
기존: Phoenix URL 입력 필드
변경: 프로젝트 API Key + Endpoint + Quick Start

[General]

─── Trace API Key (프로젝트별) ─────────────
┌──────────────────────────────────────────┐
│  Trace Key                               │
│  에이전트의 trace/span 수집 인증용          │
│  모든 프로젝트 멤버가 열람 가능             │
│                                          │
│  pt_clx1a•••••••def   [👁 Show] [Copy]    │
│  [Regenerate] (owner만)                  │
│                                          │
│  Endpoint                                │
│  https://app.com/collect          [Copy] │
│                                          │
│  ⚠ 키는 생성 시 1회만 전체 표시됩니다.       │
└──────────────────────────────────────────┘

* Connector Key (pc_*)는 개인 키 → 글로벌 설정 (/settings)에서 관리
* 이 페이지에서는 Trace Key만 표시

─── Quick Start ────────────────────────────
┌──────────────────────────────────────────┐
│  1. Trace Collection               [Copy]│
│  ┌────────────────────────────────────┐  │
│  │ pip install arize-phoenix-otel     │  │
│  │                                    │  │
│  │ export PHOENIX_API_KEY="pt_..."    │  │
│  │ export PHOENIX_COLLECTOR_ENDPOINT= │  │
│  │   "https://app.com/collect"        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  2. Agent Connector (Optional)     [Copy]│
│  ┌────────────────────────────────────┐  │
│  │ pip install phoenix-connector      │  │
│  │ phoenix-connector --key=pc_... \   │  │
│  │   --agent=http://localhost:2024    │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 11.6 Settings > Members (신규)

```
[Members] — 현재 선택된 프로젝트의 멤버 관리

역할이 owner인 경우:
─── Members ────────────────────────────────
┌──────────────────────────────────────────┐
│  user-a@gmail.com    owner               │
│                      [Transfer Ownership]│
│──────────────────────────────────────────│
│  user-b@gmail.com    [editor ▼]  [Remove]│
│  user-c@gmail.com    [viewer ▼]  [Remove]│
└──────────────────────────────────────────┘
    ↑ 드롭다운으로 역할 변경 가능

역할이 editor/viewer인 경우:
→ 멤버 목록은 볼 수 있지만 편집 불가
→ [Transfer], [Remove], 역할 드롭다운 숨김

─── Pending Requests ──────────────────────
┌──────────────────────────────────────────┐
│  user-d@gmail.com    3분 전               │
│                      [Approve] [Reject]  │
│──────────────────────────────────────────│
│  user-e@gmail.com    1시간 전              │
│                      [Approve] [Reject]  │
└──────────────────────────────────────────┘
    * pending request가 없으면 이 섹션 숨김
    * owner만 볼 수 있음

─── Invite Codes ──────────────────────────
┌──────────────────────────────────────────┐
│  ABC-XY123   editor   3/10 used          │
│              expires 2026-05-21          │
│                          [Copy] [Delete] │
│──────────────────────────────────────────│
│  DEF-ZZ456   viewer   unlimited          │
│              no expiry                   │
│                          [Copy] [Delete] │
└──────────────────────────────────────────┘

[+ Generate Code]
 → 클릭 시 인라인 폼 확장:
   Role: [editor ▼]
   Max uses: [10    ] (0 = unlimited)
   Expires:  [7 days ▼] (options: 1 day, 7 days, 30 days, Never)
   [Generate]
 → 생성 후 코드가 목록에 추가되고 자동으로 클립보드 복사
```

### 11.7 Settings > Connector (신규)

```
[Connector] — 현재 프로젝트의 WebSocket Relay 상태

─── 연결 안 된 상태 ────────────────────────
┌──────────────────────────────────────────┐
│                                          │
│  ○ No connector connected                │
│                                          │
│  Connect your local agent to use         │
│  Chat, Playground, and Dataset runs.     │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ pip install phoenix-connector      │  │
│  │ phoenix-connector --key=pc_... \   │  │
│  │   --agent=http://localhost:2024    │  │
│  └────────────────────────────────────┘  │
│                                [Copy]    │
└──────────────────────────────────────────┘

─── 연결된 상태 ────────────────────────────
┌──────────────────────────────────────────┐
│                                          │
│  ● Connected                             │
│                                          │
│  Agent     http://localhost:2024          │
│  Type      langgraph                     │
│  Since     2026-05-14 14:30              │
│  User      user-a@gmail.com              │
│                                          │
└──────────────────────────────────────────┘

* 상태는 WebSocket 연결 상태를 실시간 반영
* ● 초록 dot은 CSS animation으로 pulse 효과
* 연결 끊기면 자동으로 "No connector" 상태로 전환
```

### 11.8 Transfer Ownership 흐름

```
[Members] 에서 [Transfer Ownership] 클릭
        │
        ▼
[모달 1단계] 대상 선택 (멤버가 2명 이상일 때)
┌────────────────────────────────────────┐
│ Transfer Ownership                     │
│                                        │
│ Select new owner:                      │
│                                        │
│ ○ user-b@gmail.com (editor)            │
│ ○ user-c@gmail.com (viewer)            │
│                                        │
│                    [Cancel] [Next]      │
└────────────────────────────────────────┘
        │
        ▼
[모달 2단계] 확인
┌────────────────────────────────────────┐
│ Transfer Ownership                     │
│                                        │
│ Transfer "my-legal-rag" to             │
│ user-b@gmail.com                       │
│                                        │
│ ⚠ You will become editor.             │
│   This cannot be undone.               │
│                                        │
│ Type project name to confirm:          │
│ [                              ]       │
│                                        │
│                 [Cancel] [Transfer]    │
│                          ↑ 프로젝트명   │
│                            일치할 때만  │
│                            활성화      │
└────────────────────────────────────────┘
        │
        ▼
완료 → 역할 변경 반영, 페이지 새로고침
```

### 11.9 Chat에서 Connector 연결 안 된 경우

```
사용자가 Chat 페이지 진입 → BYOA 모드인데 connector 미연결 시:

┌────────────────────────────────────────────────────────┐
│                                                        │
│  채팅 영역 중앙에 안내 표시:                               │
│                                                        │
│       ○ Agent not connected                            │
│                                                        │
│       Connect your agent to start chatting.            │
│       Run this in your terminal:                       │
│                                                        │
│       ┌──────────────────────────────────┐             │
│       │ phoenix-connector --key=pc_... \ │       [Copy]│
│       │   --agent=http://localhost:2024  │             │
│       └──────────────────────────────────┘             │
│                                                        │
│       [Go to Connector Settings]                       │
│                                                        │
└────────────────────────────────────────────────────────┘

연결 감지되면 → 자동으로 채팅 UI 전환 (폴링 or WebSocket event)
```

### 11.10 Dataset Run에서 Connector 필요한 경우

```
Dataset 페이지 → Run 실행 시:

[1] Run 버튼 클릭
        │
        ▼
[2] Connector 상태 확인
    ├─ 연결됨 → 바로 실행
    └─ 미연결 ↓

[3] 안내 모달
┌────────────────────────────────────────┐
│ Agent Required                         │
│                                        │
│ Dataset run needs a connected agent    │
│ to generate responses.                 │
│                                        │
│ ○ No connector connected               │
│                                        │
│ ┌──────────────────────────────────┐   │
│ │ phoenix-connector --key=pc_... \ │   │
│ │   --agent=http://localhost:2024  │   │
│ └──────────────────────────────────┘   │
│                                [Copy]  │
│                                        │
│ Waiting for connection...              │
│ (연결 감지 시 자동으로 run 시작)          │
│                                        │
│                            [Cancel]    │
└────────────────────────────────────────┘
```

### 11.11 프로젝트 없음 → 진입 차단 흐름

```
프로젝트가 0개인 사용자가 Dashboard, Projects, Evaluations 등 접근 시:

┌────────────────────────────────────────────────────────┐
│                                                        │
│                                                        │
│       No projects yet                                  │
│                                                        │
│       Create a project or join an existing one          │
│       to get started.                                  │
│                                                        │
│       [Create Project]  [Join Project]                  │
│                                                        │
│                                                        │
└────────────────────────────────────────────────────────┘

* EmptyState 컴포넌트 사용
* 두 버튼 모두 모달 트리거
```

### 11.12 Role별 UI 차이

```
각 역할에 따라 보이는/숨기는 요소:

[owner]
├─ Settings > Members: 멤버 추가/제거, 역할 변경, 초대 코드 관리
├─ Settings > General: API Key regenerate 버튼
├─ 프로젝트 삭제 가능
└─ 모든 CRUD

[editor]
├─ Settings > Members: 목록 읽기만 (편집 불가)
├─ Settings > General: API Key 보기/복사 (regenerate 불가)
├─ 프로젝트 삭제 불가
└─ 데이터 CRUD (eval, dataset, agent config, chat)

[viewer]
├─ Settings > Members: 목록 읽기만
├─ Settings > General: API Key 숨김
├─ Dashboard, Projects, Evaluations: 읽기만
├─ Chat: 사용 가능 (대화 읽기/쓰기는 허용)
└─ Dataset run, Eval 생성/수정/삭제 불가
```

---

## 12. Comparison: Arize vs LangSmith vs Helicone vs Ours

| Feature | Arize | LangSmith | Helicone | Ours |
|---------|-------|-----------|----------|------|
| Trace collection | OTel SDK | LangChain SDK | Proxy (2줄) | OTel SDK |
| Agent chat/test | No | Studio (local) | No | Relay connector |
| Dataset evaluation | SDK only | SDK + UI | No | UI + relay |
| Local agent connectivity | No | Local only | No | WebSocket relay |
| Team collaboration | Workspace | Organization | Organization | Project-based |
| Roles | V/E/A | V/E/A | V/E/A | Owner/Editor/Viewer |
| User analytics | No | No | Yes | Yes (추가 예정) |
| Sessions view | Yes | Yes | Yes (tree/span) | Yes (기존) |
| Alerts | No | No | Yes | Future scope |
| Self-hosted | Yes (OSS) | No | Yes (OSS) | Future scope |

### Key Differentiators

1. **No agent deployment required for testing.** 다른 플랫폼은 에이전트를 배포하거나 로컬 도구를 써야 함. 우리는 relay connector로 localhost 에이전트를 SaaS UI에서 테스트.
2. **Project-based team collaboration.** 프로젝트마다 다른 팀 구성 가능 (GitHub 모델).
3. **Integrated chat/playground.** 관찰 + 테스트가 하나의 플랫폼에서.

### Helicone에서 참고할 UI 패턴

| Helicone 패턴 | 적용 |
|--------------|------|
| 좌측 접이식 사이드바 | 채택 — 상단 Nav 대체 |
| Requests 로그 테이블 + 상세 drawer | Traces 페이지에 적용 |
| Dashboard 지표 카드 (requests, cost, latency, models) | 대시보드 위젯과 매핑 |
| Users 분석 페이지 | 신규 추가 — 사용자별 요청수/비용 분석 |
| Dark/Light mode | 기존 다크모드 지원에 라이트모드 추가 |

---

## 13. Future Considerations (Out of Scope)

These items are explicitly NOT part of this spec but the architecture should not prevent them:

- **SSO/SAML:** Enterprise auth integration
- **Alert integrations:** Slack, PagerDuty notifications
- **Billing/usage tracking:** Per-project usage metering
- **Self-hosted option:** On-premise deployment
- **Audit logs:** Track who did what, when
- **Project templates:** Quick-start project configurations
- **Hosted agents:** SaaS-managed agent execution (like LangGraph Platform)

---

## 14. Deployment

SajuGuri 프로젝트와 동일한 GitHub Actions + SSH + Docker Compose 패턴 사용.

### 구성

```
미니PC (배포 서버)
├── PostgreSQL 16          (포트 5432, 로컬만)
├── Phoenix Server         (Docker, 내부 네트워크만)
├── Next.js App            (Docker, 포트 3000)
└── docker-compose.yml
```

### GitHub Actions 워크플로우

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH and deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PC_SSH_HOST }}
          username: ${{ secrets.PC_SSH_USER }}
          key: ${{ secrets.PC_SSH_KEY }}
          script: |
            cd ~/servers/my-own-phoenix/repo
            git pull origin main
            docker compose build --no-cache app
            docker compose up -d --no-deps app
```

### Secrets

| Secret | 용도 |
|--------|------|
| `PC_SSH_KEY` | SSH 인증 키 |
| `PC_SSH_HOST` | 미니PC IP/호스트명 |
| `PC_SSH_USER` | SSH 사용자 |
| `APP_ENV` | .env 파일 전체 (DATABASE_URL, ENCRYPTION_SECRET 등) |

### PostgreSQL

- 미니PC에서 직접 실행 (Docker 외부)
- `DATABASE_URL=postgresql://user:pass@localhost:5432/phoenix_prod`
- Phoenix와 Next.js 앱이 같은 네트워크에서 접근

---

## 15. Implementation Order

1. **PostgreSQL migration** — prerequisite for everything
2. **Project + ProjectMember models** — core multi-tenancy
3. **Data isolation** — add projectId/userId to all models, enforce in API routes
4. **Security fixes** — localhost bypass, salt fix, rate limiting
5. **Settings UI** — remove Phoenix URL, add API key display, members tab
6. **Project invite flow** — invite codes, join requests, approval
7. **Trace collection proxy** — /api/collect endpoint with API key auth
8. **WebSocket relay server** — /api/ws-relay endpoint
9. **Python connector package** — PyPI package
10. **Connector UI** — status display, setup guide
11. **Onboarding flow** — first-project creation, setup wizard
