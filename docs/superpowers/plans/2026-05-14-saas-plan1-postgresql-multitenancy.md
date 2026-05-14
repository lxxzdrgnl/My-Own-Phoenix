# Plan 1: PostgreSQL Migration + Project Model + Data Isolation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from SQLite to PostgreSQL and add the Project model with multi-tenant data isolation — the foundation for all SaaS features.

**Architecture:** Replace the better-sqlite3 adapter with PostgreSQL via Prisma. Add Project, ProjectMember, ConnectorSession models. Add `projectId`/`userId` foreign keys to all existing models. Create `requireProjectAccess()` middleware for authorization. All API routes get scoped queries.

**Tech Stack:** Prisma 7 + PostgreSQL 16, Docker Compose, Next.js App Router

**Spec:** `docs/superpowers/specs/2026-05-14-saas-multi-tenant-design.md`

---

## File Structure

### New Files
- `lib/auth-project.ts` — `requireProjectAccess()` middleware
- `app/api/projects/route.ts` — Project CRUD API
- `app/api/projects/[id]/members/route.ts` — ProjectMember API

### Modified Files
- `prisma/schema.prisma` — Add Project, ProjectMember, ConnectorSession; add FKs to all models
- `prisma.config.ts` — Switch datasource to PostgreSQL URL
- `lib/prisma.ts` — Remove better-sqlite3 adapter, use standard PrismaClient
- `package.json` — Remove `@prisma/adapter-better-sqlite3`, `better-sqlite3`; add `pg`
- `docker-compose.yml` — Add PostgreSQL service
- `Dockerfile` — Remove SQLite references, use `prisma migrate deploy`
- `.env.example` — Add `DATABASE_URL`
- `lib/eval-seed.ts` — Add projectId to seed data
- All 22 API route files — Add project scoping

---

### Task 1: Switch Prisma from SQLite to PostgreSQL

**Files:**
- Modify: `prisma/schema.prisma:1-7`
- Modify: `prisma.config.ts`
- Modify: `lib/prisma.ts`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Add PostgreSQL to docker-compose.yml**

```yaml
# docker-compose.yml — add postgres service at the top of services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: phoenix
      POSTGRES_USER: phoenix
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-phoenix_dev}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U phoenix"]
      interval: 5s
      timeout: 5s
      retries: 5

# Add at the bottom:
volumes:
  pgdata:

# Update dashboard service — add depends_on postgres and DATABASE_URL:
  dashboard:
    environment:
      - DATABASE_URL=postgresql://phoenix:${POSTGRES_PASSWORD:-phoenix_dev}@postgres:5432/phoenix
    depends_on:
      postgres:
        condition: service_healthy
      phoenix:
        condition: service_healthy
```

- [ ] **Step 2: Start PostgreSQL container**

Run: `cd /home/rheon/Desktop/projects/capstone/my-own-phoenix && docker compose up -d postgres`
Expected: PostgreSQL running on localhost:5432

- [ ] **Step 3: Replace SQLite deps with PostgreSQL**

Run:
```bash
npm uninstall @prisma/adapter-better-sqlite3 better-sqlite3
npm install pg
npm install -D @types/pg
```

- [ ] **Step 4: Update prisma schema datasource**

Change `prisma/schema.prisma` lines 5-7:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 5: Update prisma.config.ts**

```typescript
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
```

- [ ] **Step 6: Update lib/prisma.ts**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 7: Add DATABASE_URL to .env and .env.example**

```bash
# .env
DATABASE_URL=postgresql://phoenix:phoenix_dev@localhost:5432/phoenix

# .env.example
DATABASE_URL=postgresql://phoenix:phoenix_dev@localhost:5432/phoenix
```

- [ ] **Step 8: Delete old migrations and create fresh baseline**

Run:
```bash
rm -rf prisma/migrations
npx prisma migrate dev --name init
```
Expected: Fresh migration created, tables created in PostgreSQL

- [ ] **Step 9: Verify — run dev server**

Run: `npm run dev`
Expected: App starts without SQLite errors. Existing pages load (may be empty data).

- [ ] **Step 10: Commit**

```bash
git add prisma/ lib/prisma.ts prisma.config.ts package.json package-lock.json docker-compose.yml .env.example
git commit -m "feat: migrate from SQLite to PostgreSQL"
```

---

### Task 2: Add Project and ProjectMember Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Project model to schema**

Add to `prisma/schema.prisma`:
```prisma
model Project {
  id                String              @id @default(cuid())
  name              String
  slug              String              @unique
  traceKeyHash      String              @default("")
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  members           ProjectMember[]
  agentConfigs      AgentConfig[]
  datasets          Dataset[]
  evalConfigs       ProjectEvalConfig[]
  evalPrompts       EvalPrompt[]
  riskItems         RiskItem[]
  incidents         Incident[]
  dashboardLayouts  DashboardLayout[]
  threads           Thread[]
  connectorSessions ConnectorSession[]
}

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  role      String   @default("editor")
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])
}

model ConnectorSession {
  id          String   @id @default(cuid())
  userId      String
  projectId   String
  agentType   String   @default("langgraph")
  assistantId String   @default("agent")
  status      String   @default("online")
  connectedAt DateTime @default(now())
  lastPingAt  DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([userId, projectId])
  @@index([projectId, status])
}
```

- [ ] **Step 2: Add relations to User model**

Update the existing `User` model:
```prisma
model User {
  id                String              @id
  email             String
  name              String?
  relayKeyHash      String?
  createdAt         DateTime            @default(now())
  threads           Thread[]
  layouts           DashboardLayout[]
  feedbacks         MessageFeedback[]
  memberships       ProjectMember[]
  connectorSessions ConnectorSession[]
}
```

- [ ] **Step 3: Add projectId FK to existing models**

Add `projectId String` and `project Project @relation(...)` to these models. Make projectId optional initially (for migration compatibility):

**AgentConfig:**
```prisma
model AgentConfig {
  id          String   @id @default(cuid())
  project     String   @unique
  alias       String?
  templateId  String?
  agentType   String   @default("langgraph")
  endpoint    String   @default("http://localhost:2024")
  assistantId String   @default("agent")
  projectId   String?
  updatedAt   DateTime @updatedAt
  template    AgentTemplate? @relation(fields: [templateId], references: [id])
  projectRef  Project?       @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

**Dataset:**
```prisma
model Dataset {
  id            String       @id @default(cuid())
  name          String
  fileName      String       @default("")
  headers       String       @default("[]")
  queryCol      String       @default("")
  contextCol    String       @default("")
  evalNames     String       @default("[]")
  evalOverrides String       @default("{}")
  rowCount      Int          @default(0)
  rows          String       @default("[]")
  projectId     String?
  datasetRows   DatasetRow[]
  runs          DatasetRun[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  project       Project?     @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

**RiskItem** — add:
```prisma
  projectRef  Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
```
(projectId field already exists)

**Incident** — add:
```prisma
  projectRef  Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
```
(projectId field already exists)

**EvalPrompt** — update projectId to be FK:
```prisma
  projectRef  Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

**ProjectEvalConfig** — add FK:
```prisma
  projectRef  Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

**DashboardLayout** — add projectId FK:
```prisma
  projectId   String?
  projectRef  Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

**Thread** — add projectId FK:
```prisma
  projectId   String?
  projectRef  Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

**LlmProvider** — add userId:
```prisma
model LlmProvider {
  id        String   @id @default(cuid())
  provider  String
  apiKey    String
  isActive  Boolean  @default(true)
  userId    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, provider])
}
```

**AgentTemplate** — add userId:
```prisma
model AgentTemplate {
  id          String        @id @default(cuid())
  name        String
  description String        @default("")
  agentType   String        @default("langgraph")
  endpoint    String        @default("http://localhost:2024")
  assistantId String        @default("agent")
  evalPrompts String        @default("{}")
  userId      String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  configs     AgentConfig[]

  @@unique([userId, name])
}
```

**AppSettings** — add userId:
```prisma
model AppSettings {
  id    String  @id @default(cuid())
  key   String
  value String
  userId String?

  @@unique([key, userId])
}
```
Note: AppSettings loses its `key @id` — needs composite unique instead.

- [ ] **Step 4: Run migration**

Run: `npx prisma migrate dev --name add_project_multitenancy`
Expected: Migration applied successfully

- [ ] **Step 5: Verify schema**

Run: `npx prisma studio`
Expected: All new tables visible (Project, ProjectMember, ConnectorSession)

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: add Project, ProjectMember, ConnectorSession models with FKs"
```

---

### Task 3: Create requireProjectAccess Middleware

**Files:**
- Create: `lib/auth-project.ts`

- [ ] **Step 1: Create auth-project.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

function hasMinRole(actual: string, required: string): boolean {
  return (ROLE_HIERARCHY[actual] ?? -1) >= (ROLE_HIERARCHY[required] ?? 999);
}

/**
 * Require authenticated user with project membership at or above minRole.
 * Returns { uid, projectId, role } or a NextResponse error.
 */
export async function requireProjectAccess(
  req: NextRequest,
  projectId: string,
  minRole: "viewer" | "editor" | "owner" = "viewer",
): Promise<{ uid: string; projectId: string; role: string } | NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });

  if (!member) {
    return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  }

  if (!hasMinRole(member.role, minRole)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Insufficient role");
  }

  return { uid, projectId, role: member.role };
}

/**
 * Resolve project from slug. Returns project or NextResponse error.
 */
export async function resolveProject(
  slug: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  return prisma.project.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit lib/auth-project.ts 2>&1 | head -5`
Expected: No errors (or only unrelated ones)

- [ ] **Step 3: Commit**

```bash
git add lib/auth-project.ts
git commit -m "feat: add requireProjectAccess middleware"
```

---

### Task 4: Create Project CRUD API

**Files:**
- Create: `app/api/projects/route.ts`

- [ ] **Step 1: Create projects API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";
import { randomBytes, createHash } from "crypto";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) + "-" + randomBytes(4).toString("hex");
}

function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// GET /api/projects — list my projects
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const memberships = await prisma.projectMember.findMany({
    where: { userId: auth },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      slug: m.project.slug,
      role: m.role,
      createdAt: m.project.createdAt,
    })),
  );
}

// POST /api/projects — create a project
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { name, description } = await req.json();
  if (!name?.trim()) {
    return apiError(req, ErrorCode.BAD_REQUEST, "Project name is required");
  }

  const slug = generateSlug(name.trim());
  const traceKey = generateKey("pt");
  const traceKeyHash = hashKey(traceKey);

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      slug,
      traceKeyHash,
      members: {
        create: { userId: auth, role: "owner" },
      },
    },
  });

  return NextResponse.json({
    id: project.id,
    name: project.name,
    slug: project.slug,
    traceKey, // shown once only
  }, { status: 201 });
}
```

- [ ] **Step 2: Test via curl**

Run:
```bash
# Start dev server first, then:
curl -s http://localhost:3000/api/projects | jq .
```
Expected: Returns array (empty or with projects)

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/
git commit -m "feat: add Project CRUD API"
```

---

### Task 5: Update Dockerfile for PostgreSQL

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Update Dockerfile**

```dockerfile
# ── Stage 1: Dependencies ──
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ──
FROM node:22-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=$NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── Stage 3: Production ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "fix: update Dockerfile for PostgreSQL (migrate deploy)"
```

---

### Task 6: Scope Existing API Routes with projectId

This is the largest task. Each API route needs:
1. Accept `projectId` as query param or body field
2. Filter queries by `projectId` (or `userId` for user-scoped models)

**This task is applied incrementally — one route group at a time.**

- [ ] **Step 1: Update /api/settings/route.ts — add userId scoping**

Add `userId` filter to GET and PUT. Settings without userId are system-wide.

```typescript
// In GET handler, after requireAuth:
const settings = await prisma.appSettings.findMany({
  where: { OR: [{ userId: null }, { userId: uid }] },
});

// In PUT handler:
await prisma.appSettings.upsert({
  where: { key_userId: { key, userId: uid } },
  update: { value },
  create: { key, value, userId: uid },
});
```

- [ ] **Step 2: Update /api/providers/route.ts — add userId scoping**

Filter LlmProvider by userId:
```typescript
// GET: 
const providers = await prisma.llmProvider.findMany({ where: { userId: uid } });

// POST:
await prisma.llmProvider.create({ data: { ...data, userId: uid } });
```

- [ ] **Step 3: Update /api/agent-templates/route.ts — add userId scoping**

Filter AgentTemplate by userId:
```typescript
// GET:
const templates = await prisma.agentTemplate.findMany({ where: { userId: uid } });

// POST:
await prisma.agentTemplate.create({ data: { ...data, userId: uid } });
```

- [ ] **Step 4: Update dataset routes — add projectId scoping**

For `/api/datasets/route.ts`, `/api/datasets/rows/route.ts`, `/api/datasets/runs/route.ts`:
```typescript
// GET: accept projectId query param
const projectId = req.nextUrl.searchParams.get("projectId");
const datasets = await prisma.dataset.findMany({ where: { projectId } });

// POST: require projectId in body
const { projectId, ...rest } = await req.json();
await prisma.dataset.create({ data: { ...rest, projectId } });
```

- [ ] **Step 5: Update eval routes — scope by projectId**

For `/api/eval-prompts/route.ts`, `/api/eval-config/route.ts`, `/api/eval-backfill/route.ts`:
Add projectId filtering similar to datasets.

- [ ] **Step 6: Update remaining routes**

Apply the same pattern to:
- `/api/agent-config/route.ts` — projectId
- `/api/dashboard/layout/route.ts` — userId + projectId
- `/api/risks/route.ts` — projectId
- `/api/incidents/route.ts` — projectId
- `/api/user-threads/route.ts` — userId (already scoped)
- `/api/feedback/route.ts` — userId (already scoped)

- [ ] **Step 7: Verify — run dev server and test key routes**

Run: `npm run dev`
Test: Navigate to Settings, Evaluations, Datasets — confirm no errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/ lib/
git commit -m "feat: add multi-tenant scoping to all API routes"
```

---

## Remaining Plans (Outlines)

### Plan 2: UI Restructure
- Replace top Nav with sidebar navigation
- Create `app/[slug]/` layout with sidebar
- Create `/` project card listing page
- Split project-view.tsx into: Dashboard, Overview, Requests, Measure, Risks
- Move pages under `app/[slug]/dashboard/`, `app/[slug]/requests/`, etc.
- Implement project context from URL `[slug]` param

### Plan 3: Security Hardening
- Fix localhost auth bypass in `lib/auth-server.ts`
- Fix hardcoded salt in `lib/crypto.ts` + data migration
- Add rate limiting middleware
- Add CSRF protection
- Ensure Phoenix is internal-only in docker-compose

### Plan 4: Team Collaboration
- Add ProjectInviteCode, ProjectJoinRequest models
- Create invite code API (`/api/projects/[id]/invite-codes/`)
- Create join request API (`/api/projects/join/`)
- Add Members tab in project settings UI
- Add Join Project modal
- Owner approval flow
- Owner transfer flow

### Plan 5: Trace Collection Proxy
- Create `/api/collect` endpoint
- Validate `pt_*` trace key via hash lookup
- Proxy OTel spans to internal Phoenix with project prefix
- Update onboarding UI with setup guide

### Plan 6: WebSocket Relay + Python Connector
- Create `/api/ws-relay` WebSocket endpoint in Next.js
- Auth frame protocol (pc_* key validation)
- ConnectorSession management (online/offline, heartbeat)
- Create Python package: `phoenix-connector`
  - CLI entry point with `--key`, `--agent`, `--project` args
  - WebSocket client with auto-reconnect (exponential backoff)
  - LangGraph SDK + REST SSE forwarding
  - Publish to PyPI
- Agent selector dropdown in Chat/Playground/Dataset UI
- Connector status display in Settings

### Plan 7: Deployment
- Create `.github/workflows/deploy.yml` (SSH + Docker Compose, SajuGuri pattern)
- Configure GitHub Secrets (PC_SSH_KEY, PC_SSH_HOST, etc.)
- Production DATABASE_URL pointing to mini PC PostgreSQL
- Health check endpoints
