# Shared Dashboard + Realtime Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert per-user dashboard layouts to per-project shared layouts with realtime SSE sync, role-gated editing, and a "last updated by" badge.

**Architecture:** Replace the per-user `DashboardLayout.userId` unique constraint with a per-project `projectId @unique`, add `lastUpdatedBy` for audit/UI. The PUT handler checks `editor+` role via `requireProjectMember` and broadcasts a `layout-updated` SSE message. Clients subscribed to the project SSE channel re-fetch when they receive a message from another user. Viewers see the dashboard in read-only mode.

**Tech Stack:** Next.js 16, Prisma 7 + Postgres, React 19, Firebase Auth, `react-grid-layout`, SSE (server-sent events) via Next.js Route Handlers.

---

## File Structure (decomposition decisions)

**Create:**
- `lib/sse-broadcast.ts` — minimal in-memory pub/sub for SSE message types. Exports `SseMessage` discriminated union, `broadcast(projectId, msg)`, `subscribe(projectId, fn) => unsubscribe`. Foreign-team marker: `// TODO(#2+#3): merge with eval-completed broadcaster`. Per-process Map of `Set<callback>`. (Sufficient for the single-server mini-PC; if #2+#3 ships its own version, integrate by replacing this file with theirs.)
- `app/api/sse/project/[id]/route.ts` — long-lived GET endpoint that subscribes to broadcaster and pipes messages to the client as SSE events. Auth via `requireProjectMember` (any role).
- `prisma/migrations/<timestamp>_shared_dashboard_layout/migration.sql` — schema + data transform (created via `prisma migrate dev --create-only`, then manually edited if needed).
- `scripts/test-dashboard-migration.ts` — standalone tsx script that simulates the data transform against an in-memory dataset to verify owner/Sean-Lee selection logic.
- `scripts/test-dashboard-layout-api.ts` — standalone tsx script that imports the route handler and exercises GET/PUT with mocked Prisma + auth to verify role gating.
- `scripts/test-sse-broadcast.ts` — standalone tsx script that subscribes, broadcasts, verifies fan-out.
- `components/dashboard/last-updated-badge.tsx` — small client component, displays "Updated: {name} · {relative-time}".

**Modify:**
- `prisma/schema.prisma` — change `DashboardLayout` model.
- `app/api/dashboard/layout/route.ts` — switch to `projectId`-based GET/PUT with role gating and SSE broadcast.
- `app/[slug]/dashboard/page.tsx` — call new API shape (projectId), subscribe to SSE, render badge, pass `readOnly` down.
- `components/dashboard/widget-grid.tsx` — already supports `readOnly` for drag/resize disable; verify and tighten.
- `components/dashboard/add-widget-menu.tsx` — wrap in `RoleGate` (already done at call site).
- `lib/i18n/en.ts` / `lib/i18n/ko.ts` — add `viewOnly`, `updatedBy`, `justNow`, `minutesAgo`, `hoursAgo`, `daysAgo` labels in `dashboard` namespace.
- `lib/openapi-spec.ts` — update `/api/dashboard/layout` request/response docs.

**No changes to** (out of scope, owned by sibling specs):
- `app/projects/[name]/project-view.tsx`, `components/trace-detail-view.tsx`, `components/span-tree-view.tsx`.

---

## Test approach

No Jest/Vitest is wired into this repo (only `next lint` + `prettier` in package.json scripts). I'm writing **standalone runnable TS scripts** under `scripts/` that:
- Import pure helpers (no React).
- Use a tiny `assert` helper from `node:assert/strict`.
- Print PASS/FAIL with a non-zero exit on failure.
- Run via `npx tsx scripts/test-<name>.ts`.

This matches the existing pattern (`scripts/backfill-prompt-scopes-to-dexter.ts`, etc.) and gives executable verification without bringing in a new framework.

---

## Task 1: SSE broadcast utility (in-memory pub/sub)

**Files:**
- Create: `lib/sse-broadcast.ts`
- Create: `scripts/test-sse-broadcast.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-sse-broadcast.ts`:

```ts
import assert from "node:assert/strict";
import { broadcast, subscribe, type SseMessage } from "../lib/sse-broadcast";

const messages: SseMessage[] = [];
const unsub = subscribe("proj-1", (m) => messages.push(m));

// Fan-out to subscribers of the same project only
broadcast("proj-1", { type: "layout-updated", projectId: "proj-1", savedBy: "u1", savedAt: "2026-05-23T00:00:00Z" });
broadcast("proj-2", { type: "layout-updated", projectId: "proj-2", savedBy: "u2", savedAt: "2026-05-23T00:00:00Z" });

assert.equal(messages.length, 1, "expected 1 message in proj-1");
assert.equal(messages[0].type, "layout-updated");

// Unsubscribe stops delivery
unsub();
broadcast("proj-1", { type: "layout-updated", projectId: "proj-1", savedBy: "u1", savedAt: "2026-05-23T00:01:00Z" });
assert.equal(messages.length, 1, "expected no new messages after unsubscribe");

console.log("PASS: sse-broadcast");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-sse-broadcast.ts`
Expected: FAIL — cannot find module `../lib/sse-broadcast`.

- [ ] **Step 3: Implement `lib/sse-broadcast.ts`**

```ts
/**
 * Minimal per-project SSE broadcaster.
 *
 * TODO(#2+#3 integration): The parallel SSE spec (eval-completed broadcaster)
 * may ship its own version of this module. When that lands, merge by extending
 * `SseMessage` union with their message types and replacing this stub's
 * implementation with theirs. Keep the `broadcast` / `subscribe` exports stable.
 *
 * In-memory only (single Node process). For multi-process deployments this
 * needs to be replaced with Redis pub/sub or similar.
 */

export type SseMessage =
  | { type: "layout-updated"; projectId: string; savedBy: string; savedAt: string }
  | { type: "eval-completed"; spanId: string; name: string; kind: "LLM" | "HUMAN" }; // TODO(#2+#3): owned by sibling spec

type Listener = (msg: SseMessage) => void;

const channels = new Map<string, Set<Listener>>();

export function subscribe(projectId: string, fn: Listener): () => void {
  let set = channels.get(projectId);
  if (!set) {
    set = new Set();
    channels.set(projectId, set);
  }
  set.add(fn);
  return () => {
    const s = channels.get(projectId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) channels.delete(projectId);
  };
}

export function broadcast(projectId: string, msg: SseMessage): void {
  const set = channels.get(projectId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(msg);
    } catch (e) {
      // Never let one listener take down others.
      console.error("[sse-broadcast] listener error", e);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-sse-broadcast.ts`
Expected: `PASS: sse-broadcast`

- [ ] **Step 5: Commit**

```bash
git add lib/sse-broadcast.ts scripts/test-sse-broadcast.ts
git commit -m "feat(sse): minimal per-project broadcaster + test"
```

---

## Task 2: SSE route handler for project channel

**Files:**
- Create: `app/api/sse/project/[id]/route.ts`

- [ ] **Step 1: Implement the SSE route**

Note: SSE routes are awkward to unit-test against `apiFetch`/Firebase; we verify by code review and a manual smoke step in Task 9. This route is a thin glue layer over the already-tested `subscribe`.

```ts
import { NextRequest } from "next/server";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";
import { subscribe, type SseMessage } from "@/lib/sse-broadcast";

export const dynamic = "force-dynamic";

export const GET = authedHandler(async (req: NextRequest, uid: string, ctx: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await ctx.params;
  const member = await requireProjectMember(req, projectId, uid);
  if (member instanceof Response) return member;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (msg: SseMessage) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      };

      // Initial comment so the client confirms the connection
      controller.enqueue(encoder.encode(`: ok\n\n`));

      const unsub = subscribe(projectId, send);

      // Keep-alive ping every 25s (defeats proxies that close idle connections)
      const ka = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          /* connection closed */
        }
      }, 25_000);

      const close = () => {
        clearInterval(ka);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/sse/project/[id]/route.ts
git commit -m "feat(sse): GET /api/sse/project/[id] route with auth + keepalive"
```

---

## Task 3: Schema change — DashboardLayout becomes per-project

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update `User` relations**

Remove the `layouts` field from `User` (DashboardLayout no longer has `userId`). Add `lastDashboardUpdates` for the `lastUpdatedBy` back-ref.

Old (line 16):
```
  layouts           DashboardLayout[]
```

Replace with:
```
  lastDashboardUpdates DashboardLayout[] @relation("DashboardLastUpdate")
```

- [ ] **Step 2: Update `DashboardLayout` model**

Replace lines 100-111:

```prisma
model DashboardLayout {
  id            String   @id @default(cuid())
  projectId     String   @unique
  layout        String
  lastUpdatedBy String?
  updatedAt     DateTime @updatedAt
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  updatedByUser User?    @relation("DashboardLastUpdate", fields: [lastUpdatedBy], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 3: Verify schema parses**

Run: `npx prisma format`
Expected: file reformats successfully (no validation errors).

Run: `npx prisma validate`
Expected: "The schema is valid".

- [ ] **Step 4: Commit (schema only — migration in next task)**

```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): DashboardLayout per-project with lastUpdatedBy"
```

---

## Task 4: Migration logic test (pure data transform)

**Files:**
- Create: `scripts/test-dashboard-migration.ts`
- Create: `lib/dashboard-migration.ts` (pure logic, importable from script + migration verification)

The data-selection logic (Dexter→SeanLee, others→owner) is non-trivial. Extracting it into a pure function lets us test it without a real DB.

- [ ] **Step 1: Write the failing test**

`scripts/test-dashboard-migration.ts`:

```ts
import assert from "node:assert/strict";
import { chooseLayoutPerProject, type LayoutRow, type MemberRow, type ProjectRow, type UserRow } from "../lib/dashboard-migration";

const users: UserRow[] = [
  { id: "u-owner-a", email: "owner-a@x.com" },
  { id: "u-editor-a", email: "editor-a@x.com" },
  { id: "u-sean", email: "yihsean@gmail.com" },
  { id: "u-owner-dexter", email: "owner-dexter@x.com" },
];
const projects: ProjectRow[] = [
  { id: "p-alpha", name: "alpha" },
  { id: "p-dexter", name: "dexter" },
  { id: "p-empty", name: "empty" },
];
const members: MemberRow[] = [
  { projectId: "p-alpha", userId: "u-owner-a", role: "owner" },
  { projectId: "p-alpha", userId: "u-editor-a", role: "editor" },
  { projectId: "p-dexter", userId: "u-owner-dexter", role: "owner" },
  { projectId: "p-dexter", userId: "u-sean", role: "editor" },
  { projectId: "p-empty", userId: "u-owner-dexter", role: "owner" },
];
const layouts: LayoutRow[] = [
  { id: "l1", projectId: "p-alpha", userId: "u-owner-a", layout: "OWNER_ALPHA" },
  { id: "l2", projectId: "p-alpha", userId: "u-editor-a", layout: "EDITOR_ALPHA" },
  { id: "l3", projectId: "p-dexter", userId: "u-owner-dexter", layout: "OWNER_DEXTER" },
  { id: "l4", projectId: "p-dexter", userId: "u-sean", layout: "SEAN_DEXTER" },
  // p-empty: nobody has a layout yet
];

const chosen = chooseLayoutPerProject({ users, projects, members, layouts });

// Alpha: owner wins
const alpha = chosen.find((c) => c.projectId === "p-alpha");
assert.ok(alpha, "alpha layout should exist");
assert.equal(alpha!.layout, "OWNER_ALPHA");
assert.equal(alpha!.lastUpdatedBy, "u-owner-a");

// Dexter: Sean wins despite being editor
const dexter = chosen.find((c) => c.projectId === "p-dexter");
assert.ok(dexter, "dexter layout should exist");
assert.equal(dexter!.layout, "SEAN_DEXTER");
assert.equal(dexter!.lastUpdatedBy, "u-sean");

// Empty: no layout chosen
assert.equal(chosen.find((c) => c.projectId === "p-empty"), undefined);

// One layout per project
const projectIds = chosen.map((c) => c.projectId);
assert.equal(new Set(projectIds).size, projectIds.length, "no duplicate projects");

console.log("PASS: dashboard-migration");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-dashboard-migration.ts`
Expected: FAIL — cannot find `lib/dashboard-migration`.

- [ ] **Step 3: Implement `lib/dashboard-migration.ts`**

```ts
/**
 * Pure data-transform helper for the per-user → per-project DashboardLayout
 * migration. Tested in scripts/test-dashboard-migration.ts; used by the
 * verification step of prisma/migrations/<timestamp>_shared_dashboard_layout.
 *
 * Priority (lower number = winner):
 *   1. project.name === 'dexter' AND user.email === 'yihsean@gmail.com'
 *   2. member.role === 'owner'
 *   3. anything else (typically editor)
 */

export interface UserRow { id: string; email: string }
export interface ProjectRow { id: string; name: string }
export interface MemberRow { projectId: string; userId: string; role: string }
export interface LayoutRow { id: string; projectId: string; userId: string; layout: string }

export interface ChosenLayout {
  layoutId: string;
  projectId: string;
  layout: string;
  lastUpdatedBy: string;
}

const SEAN_EMAIL = "yihsean@gmail.com";
const DEXTER_NAME = "dexter";

function priority(
  layout: LayoutRow,
  project: ProjectRow,
  member: MemberRow | undefined,
  user: UserRow | undefined,
): number {
  if (project.name === DEXTER_NAME && user?.email === SEAN_EMAIL) return 1;
  if (member?.role === "owner") return 2;
  return 3;
}

export function chooseLayoutPerProject(input: {
  users: UserRow[];
  projects: ProjectRow[];
  members: MemberRow[];
  layouts: LayoutRow[];
}): ChosenLayout[] {
  const { users, projects, members, layouts } = input;
  const userById = new Map(users.map((u) => [u.id, u]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const memberKey = (pid: string, uid: string) => `${pid}::${uid}`;
  const memberByKey = new Map(members.map((m) => [memberKey(m.projectId, m.userId), m]));

  const groups = new Map<string, LayoutRow[]>();
  for (const l of layouts) {
    if (!groups.has(l.projectId)) groups.set(l.projectId, []);
    groups.get(l.projectId)!.push(l);
  }

  const chosen: ChosenLayout[] = [];
  for (const [projectId, rows] of groups) {
    const project = projectById.get(projectId);
    if (!project) continue; // orphan layout — skip (FK should prevent, but defensive)

    let best: { row: LayoutRow; pri: number } | null = null;
    for (const row of rows) {
      const user = userById.get(row.userId);
      const member = memberByKey.get(memberKey(row.projectId, row.userId));
      // Skip layouts owned by non-members (post-membership change)
      if (!member) continue;
      const pri = priority(row, project, member, user);
      if (!best || pri < best.pri) best = { row, pri };
    }

    if (best) {
      chosen.push({
        layoutId: best.row.id,
        projectId,
        layout: best.row.layout,
        lastUpdatedBy: best.row.userId,
      });
    }
  }
  return chosen;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-dashboard-migration.ts`
Expected: `PASS: dashboard-migration`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard-migration.ts scripts/test-dashboard-migration.ts
git commit -m "test(dashboard): pure layout-selection helper with Dexter/Sean override"
```

---

## Task 5: Generate the Prisma migration (create-only, do NOT apply)

**Files:**
- Create: `prisma/migrations/<timestamp>_shared_dashboard_layout/migration.sql`

- [ ] **Step 1: Generate skeleton**

Run: `npx prisma migrate dev --name shared_dashboard_layout --create-only`
Expected: a new migration directory created. Do NOT apply yet (the `--create-only` flag prevents that).

If the command refuses because of an unreachable DB, fall back to creating the directory and SQL file manually:

```bash
mkdir -p prisma/migrations/$(date -u +%Y%m%d%H%M%S)_shared_dashboard_layout
```

Then write the migration body (Step 2).

- [ ] **Step 2: Replace the generated SQL with the data-preserving version**

Open the new `migration.sql`. The auto-generated version will drop `userId` and recreate the table, which loses data. Replace with:

```sql
-- 1. Add new nullable column
ALTER TABLE "DashboardLayout" ADD COLUMN "lastUpdatedBy" TEXT;

-- 2. Choose one layout per project (Dexter→Sean, others→owner, fallback any member)
--    and record the original author in lastUpdatedBy.
WITH ranked AS (
  SELECT
    dl.id,
    dl."projectId",
    dl."userId",
    CASE
      WHEN p.name = 'dexter' AND u.email = 'yihsean@gmail.com' THEN 1
      WHEN pm.role = 'owner' THEN 2
      ELSE 3
    END AS pri
  FROM "DashboardLayout" dl
  JOIN "Project" p ON p.id = dl."projectId"
  JOIN "User" u ON u.id = dl."userId"
  JOIN "ProjectMember" pm
    ON pm."projectId" = dl."projectId" AND pm."userId" = dl."userId"
  WHERE dl."projectId" IS NOT NULL
),
chosen AS (
  SELECT DISTINCT ON ("projectId")
    id, "projectId", "userId"
  FROM ranked
  ORDER BY "projectId", pri, id
)
UPDATE "DashboardLayout" dl
   SET "lastUpdatedBy" = c."userId"
  FROM chosen c
 WHERE dl.id = c.id;

-- 3. Delete every row that wasn't chosen (or had no projectId mapping)
DELETE FROM "DashboardLayout"
 WHERE id NOT IN (SELECT id FROM (
   WITH ranked AS (
     SELECT
       dl.id,
       dl."projectId",
       CASE
         WHEN p.name = 'dexter' AND u.email = 'yihsean@gmail.com' THEN 1
         WHEN pm.role = 'owner' THEN 2
         ELSE 3
       END AS pri
     FROM "DashboardLayout" dl
     JOIN "Project" p ON p.id = dl."projectId"
     JOIN "User" u ON u.id = dl."userId"
     JOIN "ProjectMember" pm
       ON pm."projectId" = dl."projectId" AND pm."userId" = dl."userId"
     WHERE dl."projectId" IS NOT NULL
   )
   SELECT DISTINCT ON ("projectId") id
     FROM ranked
    ORDER BY "projectId", pri, id
 ) keep);

-- 4. Schema reshape
ALTER TABLE "DashboardLayout" DROP CONSTRAINT IF EXISTS "DashboardLayout_userId_fkey";
ALTER TABLE "DashboardLayout" DROP CONSTRAINT IF EXISTS "DashboardLayout_userId_project_key";
DROP INDEX IF EXISTS "DashboardLayout_userId_project_key";
ALTER TABLE "DashboardLayout" DROP COLUMN "userId";
ALTER TABLE "DashboardLayout" DROP COLUMN "project";

ALTER TABLE "DashboardLayout" ALTER COLUMN "projectId" SET NOT NULL;
CREATE UNIQUE INDEX "DashboardLayout_projectId_key" ON "DashboardLayout"("projectId");

ALTER TABLE "DashboardLayout"
  ADD CONSTRAINT "DashboardLayout_lastUpdatedBy_fkey"
  FOREIGN KEY ("lastUpdatedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Add a `BACKUP_BEFORE_APPLY.md` next to the migration**

Create `prisma/migrations/<timestamp>_shared_dashboard_layout/BACKUP_BEFORE_APPLY.md`:

```markdown
# Read before applying

This migration **deletes rows** from `DashboardLayout` (per-user layouts
collapse to one row per project). Take a backup first:

```bash
pg_dump --table=public."DashboardLayout" "$DATABASE_URL" \
  > backups/dashboard-layout-pre-shared-$(date -u +%Y%m%d-%H%M%S).sql
```

Apply with `npx prisma migrate deploy` (production) or
`npx prisma migrate dev` (development).
```

- [ ] **Step 4: Verify Prisma client generates against the new schema**

Run: `npx prisma generate`
Expected: succeeds. Code that references `prisma.dashboardLayout.findUnique({ where: { userId_projectName: ... } })` will type-error after this; that's fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/
git commit -m "feat(prisma): migration converts DashboardLayout to per-project (Dexter→Sean)"
```

---

## Task 6: API route — `/api/dashboard/layout` rewrite

**Files:**
- Modify: `app/api/dashboard/layout/route.ts`
- Create: `scripts/test-dashboard-layout-api.ts`

- [ ] **Step 1: Write the failing test**

The route uses `authedHandler`, Prisma, and the broadcaster. We test the handler logic with mocked Prisma + bypassed auth by importing the inner functions. To keep this simple, refactor the handlers to call extracted core functions that we test directly.

Create `scripts/test-dashboard-layout-api.ts`:

```ts
import assert from "node:assert/strict";
import { layoutGetCore, layoutPutCore, type LayoutDeps } from "../app/api/dashboard/layout/core";

function makeDeps(overrides: Partial<LayoutDeps> = {}): LayoutDeps {
  const layouts = new Map<string, { layout: string; lastUpdatedBy: string | null; updatedAt: Date }>();
  return {
    findMember: async (projectId, userId) => {
      if (projectId === "proj-1" && userId === "owner") return { role: "owner" };
      if (projectId === "proj-1" && userId === "ed") return { role: "editor" };
      if (projectId === "proj-1" && userId === "viewer") return { role: "viewer" };
      return null;
    },
    findLayout: async (projectId) => layouts.get(projectId) ?? null,
    upsertLayout: async (projectId, layout, uid) => {
      const now = new Date();
      layouts.set(projectId, { layout, lastUpdatedBy: uid, updatedAt: now });
      return { layout, lastUpdatedBy: uid, updatedAt: now };
    },
    broadcast: () => {},
    ...overrides,
  };
}

async function run() {
  // GET: viewer can read
  let deps = makeDeps();
  let res = await layoutGetCore({ projectId: "proj-1", uid: "viewer", deps });
  assert.equal(res.status, "ok");
  assert.equal(res.layout, null);

  // GET: non-member is forbidden
  res = await layoutGetCore({ projectId: "proj-1", uid: "stranger", deps });
  assert.equal(res.status, "forbidden");

  // PUT: viewer is forbidden
  deps = makeDeps();
  let put = await layoutPutCore({ projectId: "proj-1", uid: "viewer", layout: "L", deps });
  assert.equal(put.status, "forbidden");

  // PUT: editor succeeds + broadcasts
  let broadcastCalls: Array<{ projectId: string; savedBy: string }> = [];
  deps = makeDeps({
    broadcast: (projectId, msg) => {
      if (msg.type === "layout-updated") broadcastCalls.push({ projectId, savedBy: msg.savedBy });
    },
  });
  put = await layoutPutCore({ projectId: "proj-1", uid: "ed", layout: "L2", deps });
  assert.equal(put.status, "ok");
  assert.equal(broadcastCalls.length, 1);
  assert.equal(broadcastCalls[0].projectId, "proj-1");
  assert.equal(broadcastCalls[0].savedBy, "ed");

  // GET after PUT: viewer sees the saved layout + lastUpdatedBy
  res = await layoutGetCore({ projectId: "proj-1", uid: "viewer", deps });
  assert.equal(res.status, "ok");
  assert.equal(res.layout, "L2");
  assert.equal(res.lastUpdatedBy, "ed");

  // PUT: owner also succeeds
  put = await layoutPutCore({ projectId: "proj-1", uid: "owner", layout: "L3", deps });
  assert.equal(put.status, "ok");

  // PUT: missing layout body → validation error
  put = await layoutPutCore({ projectId: "proj-1", uid: "ed", layout: "", deps });
  assert.equal(put.status, "validation");

  // PUT: missing projectId → validation
  put = await layoutPutCore({ projectId: "", uid: "ed", layout: "L", deps });
  assert.equal(put.status, "validation");

  console.log("PASS: dashboard-layout-api");
}
run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-dashboard-layout-api.ts`
Expected: FAIL — cannot find `app/api/dashboard/layout/core`.

- [ ] **Step 3: Create `app/api/dashboard/layout/core.ts`**

```ts
import type { SseMessage } from "@/lib/sse-broadcast";

export interface LayoutDeps {
  findMember(projectId: string, userId: string): Promise<{ role: string } | null>;
  findLayout(projectId: string): Promise<{ layout: string; lastUpdatedBy: string | null; updatedAt: Date } | null>;
  upsertLayout(projectId: string, layout: string, uid: string): Promise<{ layout: string; lastUpdatedBy: string | null; updatedAt: Date }>;
  broadcast(projectId: string, msg: SseMessage): void;
}

export type GetResult =
  | { status: "ok"; layout: string | null; lastUpdatedBy: string | null; updatedAt: string | null }
  | { status: "forbidden" }
  | { status: "validation" };

export async function layoutGetCore(input: { projectId: string; uid: string; deps: LayoutDeps }): Promise<GetResult> {
  const { projectId, uid, deps } = input;
  if (!projectId) return { status: "validation" };
  const member = await deps.findMember(projectId, uid);
  if (!member) return { status: "forbidden" };
  const row = await deps.findLayout(projectId);
  return {
    status: "ok",
    layout: row?.layout ?? null,
    lastUpdatedBy: row?.lastUpdatedBy ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export type PutResult =
  | { status: "ok"; updatedAt: string }
  | { status: "forbidden" }
  | { status: "validation" };

export async function layoutPutCore(input: {
  projectId: string;
  uid: string;
  layout: string;
  deps: LayoutDeps;
}): Promise<PutResult> {
  const { projectId, uid, layout, deps } = input;
  if (!projectId || !layout) return { status: "validation" };
  const member = await deps.findMember(projectId, uid);
  if (!member) return { status: "forbidden" };
  if (!["owner", "editor"].includes(member.role)) return { status: "forbidden" };
  const saved = await deps.upsertLayout(projectId, layout, uid);
  deps.broadcast(projectId, {
    type: "layout-updated",
    projectId,
    savedBy: uid,
    savedAt: saved.updatedAt.toISOString(),
  });
  return { status: "ok", updatedAt: saved.updatedAt.toISOString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-dashboard-layout-api.ts`
Expected: `PASS: dashboard-layout-api`

- [ ] **Step 5: Rewrite `app/api/dashboard/layout/route.ts` to use the core**

Replace entire file contents with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { broadcast } from "@/lib/sse-broadcast";
import { layoutGetCore, layoutPutCore, type LayoutDeps } from "./core";

function realDeps(): LayoutDeps {
  return {
    findMember: (projectId, userId) =>
      prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { role: true },
      }),
    findLayout: (projectId) =>
      prisma.dashboardLayout.findUnique({
        where: { projectId },
        select: { layout: true, lastUpdatedBy: true, updatedAt: true },
      }),
    upsertLayout: (projectId, layout, uid) =>
      prisma.dashboardLayout.upsert({
        where: { projectId },
        update: { layout, lastUpdatedBy: uid },
        create: { projectId, layout, lastUpdatedBy: uid },
        select: { layout: true, lastUpdatedBy: true, updatedAt: true },
      }),
    broadcast,
  };
}

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const result = await layoutGetCore({ projectId, uid, deps: realDeps() });
  if (result.status === "validation")
    return apiError(req, ErrorCode.VALIDATION_FAILED, "projectId is required", { projectId: "missing" });
  if (result.status === "forbidden")
    return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  return NextResponse.json({
    layout: result.layout,
    lastUpdatedBy: result.lastUpdatedBy,
    updatedAt: result.updatedAt,
  });
});

export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const layout = typeof body.layout === "string" ? body.layout : "";
  const result = await layoutPutCore({ projectId, uid, layout, deps: realDeps() });
  if (result.status === "validation")
    return apiError(req, ErrorCode.VALIDATION_FAILED, "projectId and layout are required");
  if (result.status === "forbidden")
    return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  return NextResponse.json({ success: true, updatedAt: result.updatedAt });
});
```

- [ ] **Step 6: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (At this point `app/[slug]/dashboard/page.tsx` still calls the old API shape — it gets fixed in Task 7. The route handler types are independent.)

If `noEmit` complains about the old `page.tsx` it's expected; verify the errors are only the dashboard page, then proceed.

- [ ] **Step 7: Commit**

```bash
git add app/api/dashboard/layout/route.ts app/api/dashboard/layout/core.ts scripts/test-dashboard-layout-api.ts
git commit -m "feat(api): per-project dashboard layout with role gating + SSE broadcast"
```

---

## Task 7: Dashboard page — projectId API + SSE subscribe + role gating + badge

**Files:**
- Modify: `app/[slug]/dashboard/page.tsx`
- Create: `components/dashboard/last-updated-badge.tsx`
- Modify: `lib/i18n/en.ts`, `lib/i18n/ko.ts`

- [ ] **Step 1: Add new i18n keys (en)**

Edit `lib/i18n/en.ts` `dashboard` block (after `view: "View",` line 279):

```ts
    view: "View",
    viewOnly: "View only",
    updatedBy: "Updated by {name}",
    unknownUser: "someone",
    justNow: "just now",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    daysAgo: "{n}d ago",
```

- [ ] **Step 2: Add matching i18n keys (ko)**

Edit `lib/i18n/ko.ts` `dashboard` block (after `view: "보기",`):

```ts
    view: "보기",
    viewOnly: "보기 전용",
    updatedBy: "{name}님이 업데이트",
    unknownUser: "누군가",
    justNow: "방금 전",
    minutesAgo: "{n}분 전",
    hoursAgo: "{n}시간 전",
    daysAgo: "{n}일 전",
```

- [ ] **Step 3: Create the badge component**

Create `components/dashboard/last-updated-badge.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

interface LastUpdatedBadgeProps {
  updatedAt: string | null;
  updatedByName: string | null;
}

function formatRelative(updatedAt: string, t: ReturnType<typeof useT>): string {
  const then = new Date(updatedAt).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t.dashboard.justNow;
  if (mins < 60) return t.dashboard.minutesAgo.replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t.dashboard.hoursAgo.replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  return t.dashboard.daysAgo.replace("{n}", String(days));
}

export function LastUpdatedBadge({ updatedAt, updatedByName }: LastUpdatedBadgeProps) {
  const t = useT();
  // Re-render every minute so the "X minutes ago" text stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  if (!updatedAt) return null;
  const name = updatedByName ?? t.dashboard.unknownUser;
  const label = t.dashboard.updatedBy.replace("{name}", name);
  const rel = formatRelative(updatedAt, t);
  const exact = new Date(updatedAt).toLocaleString();
  return (
    <span
      title={exact}
      className="ml-auto text-xs text-muted-foreground"
    >
      {label} · {rel}
    </span>
  );
}
```

- [ ] **Step 4: Add a tiny `/api/users/[id]` lookup OR inline the name in the layout response**

To avoid an extra round trip and a new endpoint, extend the GET response to include the updater's display name. Update `app/api/dashboard/layout/route.ts` GET handler (do this incrementally on top of Task 6):

Modify `realDeps().findLayout` to also fetch the user name. Replace the `findLayout` impl:

```ts
    findLayout: (projectId) =>
      prisma.dashboardLayout.findUnique({
        where: { projectId },
        select: {
          layout: true,
          lastUpdatedBy: true,
          updatedAt: true,
          updatedByUser: { select: { name: true, email: true } },
        },
      }),
```

Update `LayoutDeps.findLayout` return type in `core.ts`:

```ts
  findLayout(projectId: string): Promise<{
    layout: string;
    lastUpdatedBy: string | null;
    updatedAt: Date;
    updatedByUser?: { name: string | null; email: string } | null;
  } | null>;
```

Extend `GetResult.ok` and `layoutGetCore`:

```ts
  | { status: "ok"; layout: string | null; lastUpdatedBy: string | null; updatedAt: string | null; updatedByName: string | null }
```

```ts
  const row = await deps.findLayout(projectId);
  return {
    status: "ok",
    layout: row?.layout ?? null,
    lastUpdatedBy: row?.lastUpdatedBy ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByName: row?.updatedByUser?.name ?? row?.updatedByUser?.email ?? null,
  };
```

Update `route.ts` GET response to include `updatedByName`.

Update `scripts/test-dashboard-layout-api.ts`:
- Mock `findLayout` to also return `updatedByUser`.
- Assert `res.updatedByName` round-trips.

Add to the existing test (between the two GETs after PUT):
```ts
  deps = makeDeps({
    broadcast: () => {},
    findLayout: async (projectId) => ({
      layout: "L2",
      lastUpdatedBy: "ed",
      updatedAt: new Date("2026-05-23T00:00:00Z"),
      updatedByUser: { name: "Ed", email: "ed@x.com" },
    }),
  });
  const named = await layoutGetCore({ projectId: "proj-1", uid: "viewer", deps });
  assert.equal(named.status, "ok");
  if (named.status === "ok") assert.equal(named.updatedByName, "Ed");
```

Run: `npx tsx scripts/test-dashboard-layout-api.ts`
Expected: `PASS: dashboard-layout-api`

- [ ] **Step 5: Rewrite the dashboard page**

The full file is long — apply these targeted edits to `app/[slug]/dashboard/page.tsx`:

(a) At the top, after the existing imports, add:

```ts
import { LastUpdatedBadge } from "@/components/dashboard/last-updated-badge";
```

(b) Replace the destructure on line 73:

```ts
  const { id: projectId, phoenixProject: project, role } = useProject();
```

(c) Add state for last-update meta after `setDateRange`:

```ts
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedByName, setLastUpdatedByName] = useState<string | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
```

(d) Update `currentUid` from `user`:

```ts
  useEffect(() => { setCurrentUid(user?.uid ?? null); }, [user]);
```

(e) Replace the layout-loading effect (lines 88-109) with a reusable `loadLayout` callback + initial-load effect:

```ts
  const loadLayout = useCallback(async () => {
    if (!projectId) return;
    setLayoutLoaded(false);
    try {
      const r = await apiFetch(`/api/dashboard/layout?projectId=${encodeURIComponent(projectId)}`);
      const data = await r.json();
      if (data.layout) {
        const parsed = JSON.parse(data.layout);
        const w = fixWidgetTitles(parsed.widgets ?? DEFAULT_WIDGETS);
        setWidgets(w);
        setLayouts(fixLayoutMins(parsed.layouts ?? DEFAULT_LAYOUTS, w));
        setViewModes(parsed.viewModes ?? {});
        setWidgetColors(parsed.widgetColors ?? {});
      } else {
        setWidgets(DEFAULT_WIDGETS);
        setLayouts(DEFAULT_LAYOUTS);
        setWidgetColors({});
      }
      setLastUpdatedAt(data.updatedAt ?? null);
      setLastUpdatedByName(data.updatedByName ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLayoutLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (!user) return;
    loadLayout();
  }, [user, loadLayout]);
```

(f) Replace the `saveLayout` callback (lines 111-134):

```ts
  const saveLayout = useCallback(
    (
      newLayouts: readonly LayoutItem[],
      newWidgets?: WidgetConfig[],
      newViewModes?: Record<string, WidgetViewMode>,
      newColors?: Record<string, WidgetColors>,
    ) => {
      if (!layoutLoaded || !user || isViewer || !projectId) return;
      const w = newWidgets ?? widgets;
      const vm = newViewModes ?? viewModes;
      const wc = newColors ?? widgetColors;
      setLayouts([...newLayouts] as LayoutItem[]);
      apiFetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          layout: JSON.stringify({ widgets: w, layouts: newLayouts, viewModes: vm, widgetColors: wc }),
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.updatedAt) {
            setLastUpdatedAt(data.updatedAt);
            // We saved — display ourselves as updater. Name lookup happens on next refetch.
            setLastUpdatedByName(user.displayName ?? user.email ?? lastUpdatedByName);
          }
        })
        .catch((e) => { console.error(e); });
    },
    [user, widgets, viewModes, widgetColors, projectId, layoutLoaded, isViewer, lastUpdatedByName],
  );
```

(g) Add the SSE subscription effect right after `saveLayout` (or near the other effects):

```ts
  useEffect(() => {
    if (!projectId || !currentUid) return;
    const url = `/api/sse/project/${encodeURIComponent(projectId)}`;
    // EventSource doesn't send Authorization headers; rely on session cookie OR
    // fall back to fetch + ReadableStream. Firebase ID tokens aren't cookies,
    // so we use fetch streaming here.
    const ctrl = new AbortController();
    (async () => {
      try {
        const { auth } = await import("@/lib/firebase");
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ctrl.signal,
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const dataLine = line.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const msg = JSON.parse(dataLine.slice(6));
              if (msg.type === "layout-updated" && msg.projectId === projectId && msg.savedBy !== currentUid) {
                loadLayout();
              }
            } catch { /* keep-alive comment etc. */ }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error("[sse]", e);
      }
    })();
    return () => ctrl.abort();
  }, [projectId, currentUid, loadLayout]);
```

(h) Update the header JSX (line 244+) to include the badge:

```tsx
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{t.dashboard.title}</h1>
        <div className="h-4 w-px bg-border/60" />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <RoleGate>
          <AddWidgetMenu onAdd={handleAddWidget} />
        </RoleGate>
        {isViewer && (
          <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t.dashboard.viewOnly}
          </span>
        )}
        <LastUpdatedBadge updatedAt={lastUpdatedAt} updatedByName={lastUpdatedByName} />
      </div>
```

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/[slug]/dashboard/page.tsx components/dashboard/last-updated-badge.tsx lib/i18n/en.ts lib/i18n/ko.ts app/api/dashboard/layout/route.ts app/api/dashboard/layout/core.ts scripts/test-dashboard-layout-api.ts
git commit -m "feat(dashboard): per-project layout fetch + SSE sync + view-only badge"
```

---

## Task 8: Update OpenAPI spec

**Files:**
- Modify: `lib/openapi-spec.ts`

- [ ] **Step 1: Update the dashboard route docs**

Edit lines 722-742. Replace with:

```ts
  "/api/dashboard/layout": {
    get: {
      tags: ["Dashboard"],
      summary: "Get the shared dashboard layout for a project",
      parameters: [
        { name: "projectId", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Layout (JSON string), lastUpdatedBy, updatedAt, updatedByName" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "403": STANDARD_ERROR_RESPONSES["403"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
    put: {
      tags: ["Dashboard"],
      summary: "Save the shared dashboard layout (editor+ only)",
      responses: {
        "200": { description: "Layout saved" },
        "400": STANDARD_ERROR_RESPONSES["400"],
        "401": STANDARD_ERROR_RESPONSES["401"],
        "403": STANDARD_ERROR_RESPONSES["403"],
        "500": STANDARD_ERROR_RESPONSES["500"],
      },
    },
  },
  "/api/sse/project/{id}": {
    get: {
      tags: ["Dashboard"],
      summary: "Subscribe to project events (SSE); includes layout-updated messages",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "text/event-stream" },
        "401": STANDARD_ERROR_RESPONSES["401"],
        "403": STANDARD_ERROR_RESPONSES["403"],
      },
    },
  },
```

Check whether `STANDARD_ERROR_RESPONSES["403"]` exists — if not, add `"403": STANDARD_ERROR_RESPONSES["401"]` style fallback or define a 403 response near the top of the file.

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/openapi-spec.ts
git commit -m "docs(openapi): dashboard layout per-project + SSE endpoint"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run all standalone tests**

```bash
npx tsx scripts/test-sse-broadcast.ts
npx tsx scripts/test-dashboard-migration.ts
npx tsx scripts/test-dashboard-layout-api.ts
```

Expected: all three print `PASS: ...`.

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm migration is NOT applied**

Run: `ls prisma/migrations/ | grep shared_dashboard_layout`
Expected: directory exists.

Do NOT run `npx prisma migrate deploy` or `npx prisma migrate dev` (without `--create-only`).

- [ ] **Step 4: Sanity scan for stragglers**

```bash
grep -rn "userId_projectName" app lib components || true
grep -rn "layouts\\b" lib/i18n || true
```

The first should return nothing (the old composite key is gone). The second is just to confirm i18n keys exist.

---

## Conflict surface with #2+#3 (SSE infra spec)

Files I created that #2+#3 may also touch:
- `lib/sse-broadcast.ts` — full module ownership overlap. The `SseMessage` union already includes their `eval-completed` type so a merge is "pick one file, union the types".
- `app/api/sse/project/[id]/route.ts` — overlap if they also expose a project-scoped channel. My implementation just pipes broadcaster messages; if they ship a richer version (auth caching, reconnect IDs, etc.), prefer theirs and verify it still subscribes via the shared module.

If their files land first, the diff resolution is:
1. Delete my `lib/sse-broadcast.ts` and replace with theirs.
2. Add the `layout-updated` variant to their `SseMessage` union.
3. Delete my `app/api/sse/project/[id]/route.ts` only if they have a working equivalent.

---

## Self-review

- Spec coverage: every row in "영향받는 파일" maps to a task above (schema → 3+5; route → 6; sse-broadcast → 1; project-view/dashboard → 7; widget-grid `readOnly` is already wired; i18n → 7).
- Placeholders: none — every code block is concrete.
- Type consistency: `LayoutDeps.findLayout` shape is the same across `core.ts`, the real Prisma `select`, and the test mock. `SseMessage.layout-updated` shape is the same in `sse-broadcast.ts`, route, page subscriber, and test.
- Out-of-scope safety: no edits to `project-view.tsx`, `trace-detail-view.tsx`, `span-tree-view.tsx`.
