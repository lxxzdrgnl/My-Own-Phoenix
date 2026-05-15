# Full Codebase Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up dead code, fix security vulnerabilities, unify patterns, extract reusable hooks/components, reorganize folder structure, document APIs, and update README.

**Architecture:** Incremental refactoring in 10 phases — each phase produces a working codebase. No feature changes, only structural improvements. DB migrations preserve all existing data.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7, PostgreSQL, Firebase Auth, Tailwind CSS

---

## Task 1: Dead Code Cleanup

**Files:**
- Delete: `components/agent-selector.tsx`
- Delete: `components/agent-config-modal.tsx`
- Delete: `components/agent-templates-modal.tsx`
- Delete: `scripts/migrate-sqlite-to-pg.ts`
- Delete: `scripts/migrate-encryption.ts`
- Delete: `app/dashboard/` (empty directory)
- Modify: `lib/constants.ts`
- Modify: `lib/date-utils.ts`
- Modify: `lib/hooks.ts`
- Modify: `lib/llm-providers.ts`
- Delete: `lib/auth-project.ts`
- Modify: `lib/chatApi.ts`
- Modify: `lib/dashboard-utils.ts`

- [ ] **Step 1: Delete unused component files**

```bash
rm components/agent-selector.tsx components/agent-config-modal.tsx components/agent-templates-modal.tsx
rm scripts/migrate-sqlite-to-pg.ts scripts/migrate-encryption.ts
rmdir app/dashboard 2>/dev/null || rm -rf app/dashboard
```

- [ ] **Step 2: Remove unused exports from lib files**

In `lib/constants.ts`, remove:
```typescript
// DELETE these lines:
export const DEFAULT_PHOENIX_URL = "http://localhost:6006";
export const DEFAULT_LANGGRAPH_ENDPOINT = "http://localhost:2024";
```

In `lib/date-utils.ts`, remove the `formatDateTimeFull` export.

In `lib/hooks.ts`, remove the `useApiFetch` function.

In `lib/llm-providers.ts`, remove the `getActiveProviders` function.

In `lib/chatApi.ts`, remove the `getThreadState` function.

In `lib/dashboard-utils.ts`, remove `pieOpts` and `FAIL_COLOR_DEFAULT`.

- [ ] **Step 3: Delete `lib/auth-project.ts`**

Both exports (`requireProjectAccess`, `resolveProject`) are unused.

```bash
rm lib/auth-project.ts
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove dead code, unused components, and stale scripts"
```

---

## Task 2: Security — IDOR Fixes

**Files:**
- Modify: `app/api/user-threads/route.ts`
- Modify: `app/api/user-threads/[id]/route.ts`
- Modify: `app/api/user-threads/[id]/messages/route.ts`
- Modify: `app/api/datasets/route.ts`
- Modify: `app/api/datasets/rows/route.ts`
- Modify: `app/api/datasets/runs/route.ts`
- Modify: `app/api/datasets/runs/[runId]/route.ts`
- Modify: `app/api/datasets/runs/[runId]/export/route.ts`
- Create: `lib/api-helpers.ts`

- [ ] **Step 1: Create shared `requireProjectMember` helper**

Create `lib/api-helpers.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { apiError, ErrorCode } from "@/lib/api-error";

/**
 * Verify user is a member of the given project.
 * Returns the member record or an error response.
 */
export async function requireProjectMember(
  req: NextRequest,
  projectId: string,
  userId: string,
  minRole?: "editor" | "owner"
): Promise<{ role: string } | NextResponse> {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  if (minRole === "owner" && member.role !== "owner") {
    return apiError(req, ErrorCode.FORBIDDEN, "Owner access required");
  }
  if (minRole === "editor" && !["owner", "editor"].includes(member.role)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  }
  return { role: member.role };
}

/**
 * Verify thread belongs to the authenticated user.
 */
export async function requireThreadOwner(
  req: NextRequest,
  threadId: string,
  userId: string
) {
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.userId !== userId) {
    return apiError(req, ErrorCode.FORBIDDEN, "Not your thread");
  }
  return thread;
}

/**
 * Verify dataset belongs to a project the user is a member of.
 */
export async function requireDatasetAccess(
  req: NextRequest,
  datasetId: string,
  userId: string
) {
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!dataset) return apiError(req, ErrorCode.RESOURCE_NOT_FOUND, "Dataset not found");
  if (dataset.projectId) {
    const memberCheck = await requireProjectMember(req, dataset.projectId, userId);
    if (memberCheck instanceof NextResponse) return memberCheck;
  }
  return dataset;
}
```

- [ ] **Step 2: Fix user-threads IDOR**

In `app/api/user-threads/route.ts` GET handler — use `uid` from authedHandler instead of query param:
```typescript
// BEFORE: const userId = req.nextUrl.searchParams.get("userId");
// AFTER:
const project = req.nextUrl.searchParams.get("project") || "";
const threads = await prisma.thread.findMany({
  where: { userId: uid, project },
  orderBy: { updatedAt: "desc" },
});
```

In `app/api/user-threads/[id]/route.ts` DELETE and PATCH — add ownership check:
```typescript
const thread = await requireThreadOwner(req, id, uid);
if (thread instanceof NextResponse) return thread;
```

In `app/api/user-threads/[id]/messages/route.ts` GET and POST — add ownership check:
```typescript
const thread = await requireThreadOwner(req, id, uid);
if (thread instanceof NextResponse) return thread;
```

- [ ] **Step 3: Fix datasets IDOR**

In `app/api/datasets/route.ts`:
- GET: verify project membership when `projectId` query param is provided
- PUT/DELETE: verify dataset access via `requireDatasetAccess`

In `app/api/datasets/rows/route.ts`:
- All methods: verify dataset access via `requireDatasetAccess`

In `app/api/datasets/runs/route.ts` and `runs/[runId]/route.ts`:
- Verify run's dataset access via `requireDatasetAccess`

- [ ] **Step 4: Fix SQL injection in datasets PUT**

In `app/api/datasets/route.ts` around line 82, replace unsafe dynamic SET clause:
```typescript
const ALLOWED_FIELDS = new Set(["name", "fileName", "headers", "queryCol", "contextCol"]);
const setParts: string[] = [];
const values: any[] = [];
for (const [key, val] of Object.entries(body)) {
  if (key === "id") continue;
  if (!ALLOWED_FIELDS.has(key)) continue;
  setParts.push(`"${key}" = $${values.length + 1}`);
  values.push(val);
}
if (setParts.length === 0) return apiError(req, ErrorCode.BAD_REQUEST, "No valid fields");
values.push(body.id);
await prisma.$queryRawUnsafe(
  `UPDATE "Dataset" SET ${setParts.join(", ")} WHERE id = $${values.length}`,
  ...values
);
```

- [ ] **Step 5: Fix error leakage**

In `app/api/[..._path]/route.ts` line 51:
```typescript
// BEFORE: return NextResponse.json({ error: e.message }, ...);
// AFTER:
console.error("[proxy]", e);
return NextResponse.json({ error: "Proxy request failed" }, { status: 500 });
```

In `app/api/pii-guard/route.ts` line 21:
```typescript
console.error("[pii-guard]", e);
return NextResponse.json({ error: "PII guard processing failed" }, { status: 500 });
```

In `app/api/projects/[id]/invite-codes/route.ts` lines 32, 67:
```typescript
console.error("[invite-codes]", e);
return NextResponse.json({ message: "Internal error" }, { status: 500 });
```

- [ ] **Step 6: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "security: fix IDOR vulnerabilities, SQL injection, and error leakage"
```

---

## Task 3: Auth Pattern Unification

**Files:**
- Modify: `app/api/projects/route.ts`
- Modify: `app/api/projects/join/route.ts`
- Modify: `app/api/projects/[id]/members/route.ts`
- Modify: `app/api/projects/[id]/invite-codes/route.ts`
- Modify: `app/api/projects/[id]/join-requests/route.ts`
- Modify: `app/api/chat-relay/route.ts`
- Modify: `app/api/user/connector-key/route.ts`
- Modify: `app/api/connectors/route.ts`

- [ ] **Step 1: Migrate each route from `requireAuth` to `authedHandler`**

For each file, apply this transformation pattern:

```typescript
// BEFORE:
import { requireAuth } from "@/lib/auth-server";

export async function GET(req: NextRequest, { params }: ...) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  // ... use auth as uid
}

// AFTER:
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest, uid: string, { params }: ...) => {
  // ... use uid directly
});
```

Apply to all 8 files listed above. Each file may have multiple HTTP methods (GET, POST, PUT, DELETE, PATCH) — convert all of them.

- [ ] **Step 2: Remove `requireAuth` import from `lib/auth-server.ts` if no longer used anywhere**

Check if `requireAuth` is still imported anywhere. If not, keep it but mark as `@deprecated` since `authedHandler` wraps it internally via `verifyAuth`.

- [ ] **Step 3: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: unify all API routes to use authedHandler wrapper"
```

---

## Task 4: DB Schema Improvements

**Files:**
- Modify: `prisma/schema.prisma`
- Create: new migration file (auto-generated)
- Modify: `app/api/dashboard/layout/route.ts`
- Modify: `app/api/feedback/route.ts`

- [ ] **Step 1: Standardize relation names in schema**

In `prisma/schema.prisma`, rename all `projectRef` to `project`:

```prisma
// Thread model — change:
projectRef Project? @relation(...)
// to:
project    Project? @relation(...)

// Same for: RiskItem, Incident, ProjectEvalConfig, AgentConfig
```

Note: This only changes the Prisma relation name used in TypeScript code. The DB column (`projectId`) stays the same. No data migration needed.

- [ ] **Step 2: Add missing indexes**

```prisma
model Message {
  // ... existing fields
  @@index([threadId, createdAt])
}

model RiskItem {
  // ... existing fields
  @@index([assignee])
}

model Incident {
  // ... existing fields
  @@index([createdAt])
}
```

- [ ] **Step 3: Generate and apply migration**

```bash
npx prisma migrate dev --name standardize-relations-add-indexes
```

- [ ] **Step 4: Update code references**

Search all files for `projectRef` and replace with `project`:
```bash
grep -rn "projectRef" app/ lib/ components/ --include="*.ts" --include="*.tsx"
```

Update each occurrence.

- [ ] **Step 5: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: standardize DB relations and add missing indexes"
```

---

## Task 5: Design Patterns — Custom Hooks

**Files:**
- Create: `lib/hooks/use-form-submit.ts`
- Create: `lib/hooks/use-resource-list.ts`
- Modify: `lib/hooks.ts` (re-export from new files, keep `useSettingsForm`)

- [ ] **Step 1: Create `lib/hooks/use-form-submit.ts`**

```typescript
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface UseFormSubmitOptions {
  onSuccess?: (data: any) => void;
}

export function useFormSubmit<T = Record<string, unknown>>(
  endpoint: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
  options?: UseFormSubmitOptions
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (data?: T): Promise<any | null> => {
    setSaving(true);
    setError(undefined);
    try {
      const res = await apiFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: data ? JSON.stringify(data) : undefined,
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try { msg = JSON.parse(text).message || msg; } catch { /* ignore */ }
        setError(msg);
        return null;
      }
      const result = await res.json().catch(() => ({}));
      options?.onSuccess?.(result);
      return result;
    } catch {
      setError("Network error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { submit, saving, error, setError, clearError: () => setError(undefined) };
}
```

- [ ] **Step 2: Create `lib/hooks/use-resource-list.ts`**

```typescript
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

export function useResourceList<T>(endpoint: string, dataKey: string = "items") {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : (data[dataKey] || []));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [endpoint, dataKey]);

  useEffect(() => { load(); }, [load]);

  return { items, setItems, loading, reload: load };
}
```

- [ ] **Step 3: Update `lib/hooks.ts` to re-export**

```typescript
// Keep existing useSettingsForm
export { useFormSubmit } from "./hooks/use-form-submit";
export { useResourceList } from "./hooks/use-resource-list";
```

- [ ] **Step 4: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "feat: extract useFormSubmit and useResourceList hooks"
```

---

## Task 6: Reusable Component Extraction

**Files:**
- Create: `components/ui/confirm-dialog.tsx`
- Create: `components/ui/section-card.tsx`
- Modify: files using `if (!confirm(` pattern (apply gradually — start with `app/[slug]/settings/page.tsx`, `app/[slug]/settings/members-tab.tsx`)

- [ ] **Step 1: Create `ConfirmDialog` component**

```typescript
// components/ui/confirm-dialog.tsx
"use client";

import { useState } from "react";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  trigger: React.ReactNode;
}

export function ConfirmDialog({
  title,
  description,
  confirmText = "Confirm",
  variant = "destructive",
  onConfirm,
  trigger,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader>{title}</ModalHeader>
        <ModalBody>
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={variant} onClick={handleConfirm} disabled={loading}>
              {confirmText}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Create `SectionCard` component**

```typescript
// components/ui/section-card.tsx
interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  headerVariant?: "default" | "destructive";
}

export function SectionCard({ title, description, children, headerVariant = "default" }: SectionCardProps) {
  return (
    <section>
      <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${
        headerVariant === "destructive" ? "text-destructive" : "text-muted-foreground"
      }`}>{title}</h3>
      {description && <p className="text-xs text-muted-foreground mb-3">{description}</p>}
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Apply ConfirmDialog to settings pages**

Replace `if (!confirm("Remove this API key?")) return;` patterns in `app/[slug]/settings/page.tsx` and `members-tab.tsx` with `<ConfirmDialog>`.

- [ ] **Step 4: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "feat: add ConfirmDialog, SectionCard reusable components"
```

---

## Task 7: Folder Structure Reorganization

**Files:**
- Move modal components to `components/modals/`
- Create `components/modals/index.ts` barrel export

- [ ] **Step 1: Create modals directory and move files**

```bash
mkdir -p components/modals
mv components/prompts-modal.tsx components/modals/
mv components/prompt-edit-modal.tsx components/modals/
mv components/eval-selector-modal.tsx components/modals/
mv components/csv-import-modal.tsx components/modals/
mv components/add-to-dataset-modal.tsx components/modals/
mv components/auth-modal.tsx components/modals/
mv components/annotation-form.tsx components/modals/
```

- [ ] **Step 2: Create barrel export**

```typescript
// components/modals/index.ts
export { PromptsModal, PromptFormModal, PromptFormInitial } from "./prompts-modal";
export { PromptEditModal } from "./prompt-edit-modal";
export { EvalSelectorModal } from "./eval-selector-modal";
export { CSVImportModal } from "./csv-import-modal";
export { AddToDatasetModal } from "./add-to-dataset-modal";
export { AuthModal } from "./auth-modal";
export { AnnotationForm } from "./annotation-form";
```

- [ ] **Step 3: Update all imports across codebase**

Find and replace import paths:
```bash
grep -rn "from \"@/components/prompts-modal\"" app/ components/ --include="*.tsx" --include="*.ts"
```

Update each to `from "@/components/modals/prompts-modal"` (or use barrel `from "@/components/modals"`).

Repeat for all moved files.

- [ ] **Step 4: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: organize modals into components/modals/ directory"
```

---

## Task 8: Large Component Splits

**Files:**
- Create: `app/datasets/dataset-sidebar.tsx`
- Create: `app/datasets/dataset-toolbar.tsx`
- Modify: `app/datasets/dataset-manager.tsx`
- Create: `app/evaluations/eval-test-panel.tsx`
- Create: `app/evaluations/eval-backfill-panel.tsx`
- Modify: `app/evaluations/eval-editor.tsx`

- [ ] **Step 1: Extract `DatasetSidebar` from dataset-manager**

Extract the sidebar section (dataset list, create button) into `app/datasets/dataset-sidebar.tsx`:

```typescript
// app/datasets/dataset-sidebar.tsx
"use client";
import { Sidebar, SidebarHeader, SidebarItemDiv } from "@/components/ui/sidebar";
// ... extract sidebar rendering logic
interface DatasetSidebarProps {
  datasets: DatasetMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}
export function DatasetSidebar({ datasets, selectedId, onSelect, onCreate }: DatasetSidebarProps) {
  // ... sidebar JSX from dataset-manager lines ~180-240
}
```

- [ ] **Step 2: Extract `DatasetToolbar` from dataset-manager**

Extract the action buttons (generate, evaluate, cancel, agent selector) into `app/datasets/dataset-toolbar.tsx`.

- [ ] **Step 3: Extract eval sub-panels**

From `app/evaluations/eval-editor.tsx`:
- Extract test execution UI (~lines 260-320) into `eval-test-panel.tsx`
- Extract backfill UI (~lines 330-450) into `eval-backfill-panel.tsx`

- [ ] **Step 4: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: split large components into focused sub-components"
```

---

## Task 9: API Documentation Update

**Files:**
- Modify: `app/docs/sections/api.tsx`

- [ ] **Step 1: Update API docs with all routes**

Add all undocumented routes to `app/docs/sections/api.tsx`, organized by category:

```typescript
const API_SECTIONS = [
  {
    title: "Projects & Collaboration",
    routes: [
      ["GET", "/api/projects", "List my projects"],
      ["POST", "/api/projects", "Create a project"],
      ["PUT", "/api/projects", "Rename a project (owner)"],
      ["DELETE", "/api/projects", "Delete a project (owner)"],
      ["POST", "/api/projects/join", "Join with invite code"],
      ["GET", "/api/projects/:id/members", "List members"],
      ["PUT", "/api/projects/:id/members", "Update member role (owner)"],
      ["DELETE", "/api/projects/:id/members", "Remove member (owner)"],
      ["PATCH", "/api/projects/:id/members", "Transfer ownership (owner)"],
      ["GET", "/api/projects/:id/invite-codes", "List invite codes (owner)"],
      ["POST", "/api/projects/:id/invite-codes", "Generate invite code (owner)"],
      ["DELETE", "/api/projects/:id/invite-codes", "Delete invite code (owner)"],
      ["GET", "/api/projects/:id/join-requests", "List join requests (owner)"],
      ["PUT", "/api/projects/:id/join-requests", "Approve/reject request (owner)"],
    ],
  },
  {
    title: "API Keys & Providers",
    routes: [
      ["GET", "/api/providers", "List user's API keys"],
      ["POST", "/api/providers", "Add API key"],
      ["PUT", "/api/providers/:id", "Update provider"],
      ["DELETE", "/api/providers/:id", "Delete provider"],
      ["POST", "/api/providers/test", "Test provider connection"],
      ["GET", "/api/projects/:id/providers", "List project API keys"],
      ["POST", "/api/projects/:id/providers", "Add project API key"],
      ["DELETE", "/api/projects/:id/providers/:providerId", "Remove project key"],
    ],
  },
  {
    title: "Datasets & Runs",
    routes: [
      ["GET", "/api/datasets", "List datasets"],
      ["POST", "/api/datasets", "Create dataset"],
      ["PUT", "/api/datasets", "Update dataset"],
      ["DELETE", "/api/datasets", "Delete dataset"],
      ["GET", "/api/datasets/rows", "Get dataset rows (paginated)"],
      ["POST", "/api/datasets/rows", "Add rows"],
      ["PUT", "/api/datasets/rows", "Update row"],
      ["DELETE", "/api/datasets/rows", "Delete row"],
      ["GET", "/api/datasets/runs", "List runs"],
      ["POST", "/api/datasets/runs", "Create run"],
      ["GET", "/api/datasets/runs/:runId", "Get run details"],
      ["PUT", "/api/datasets/runs/:runId", "Update run"],
      ["DELETE", "/api/datasets/runs/:runId", "Delete run"],
      ["GET", "/api/datasets/runs/:runId/export", "Export run as CSV"],
    ],
  },
  {
    title: "Evaluations",
    routes: [
      ["GET", "/api/eval-prompts", "List eval prompts"],
      ["PUT", "/api/eval-prompts", "Create/update eval prompt"],
      ["DELETE", "/api/eval-prompts", "Delete eval prompt"],
      ["GET", "/api/eval-config", "Get project eval config"],
      ["PUT", "/api/eval-config", "Update project eval config"],
      ["POST", "/api/eval-backfill", "Run eval backfill on traces"],
    ],
  },
  {
    title: "LLM & Agents",
    routes: [
      ["POST", "/api/llm", "Call LLM (multi-provider)"],
      ["GET", "/api/agent-config", "Get agent config"],
      ["PUT", "/api/agent-config", "Update agent config"],
      ["DELETE", "/api/agent-config", "Delete agent config"],
      ["POST", "/api/chat-relay", "Relay chat to connected agent"],
    ],
  },
  {
    title: "Observability",
    routes: [
      ["GET", "/api/feedback", "List feedback"],
      ["POST", "/api/feedback", "Create feedback"],
      ["DELETE", "/api/feedback", "Delete feedback"],
      ["GET", "/api/feedback/stats", "Get feedback stats"],
      ["POST", "/api/annotations", "Create annotation"],
      ["GET", "/api/risks", "List risks"],
      ["POST", "/api/risks", "Create risk"],
      ["GET", "/api/incidents", "List incidents"],
      ["POST", "/api/incidents", "Create incident"],
      ["POST", "/api/pii-guard", "Run PII detection"],
    ],
  },
  {
    title: "Connectors & Traces",
    routes: [
      ["POST", "/api/collect", "Ingest OTel traces (Bearer pt_*)"],
      ["GET", "/api/connectors", "List connected agents"],
      ["GET", "/api/user/connector-key", "Get connector key"],
      ["POST", "/api/user/connector-key", "Generate connector key"],
    ],
  },
  {
    title: "Infrastructure",
    routes: [
      ["GET", "/api/health", "Health check (no auth)"],
      ["GET", "/api/openapi.json", "OpenAPI spec"],
      ["*", "/api/v1/*", "Phoenix proxy (pass-through)"],
    ],
  },
];
```

- [ ] **Step 2: Verify build and commit**

```bash
npx tsc --noEmit
git add -A && git commit -m "docs: document all 41 API routes in docs page"
```

---

## Task 10: README Update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README**

```markdown
# My Own Phoenix

LLM observability and evaluation platform. Monitor traces, run automated evaluations, manage datasets, and collaborate on AI projects.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: PostgreSQL + Prisma 7
- **Auth**: Firebase Authentication
- **Observability**: Arize Phoenix
- **UI**: Tailwind CSS + Radix UI
- **Charts**: Highcharts
- **Deployment**: Docker Compose + GitHub Actions

## Getting Started

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- PostgreSQL 16

### Setup

```bash
# Clone
git clone <repo-url> && cd my-own-phoenix

# Install
npm install

# Environment
cp .env.example .env
# Edit .env with your Firebase, PostgreSQL, and encryption settings

# Database
npx prisma migrate deploy
npx prisma generate

# Run
docker compose up -d   # PostgreSQL + Phoenix + Eval Worker
npm run dev             # Dashboard on http://localhost:3000
```

## Project Structure

```
app/
  [slug]/          # Project pages (chat, playground, evaluations, etc.)
  api/             # 41 API routes
  docs/            # Documentation page
  projects/        # Project listing
  settings/        # Global settings
components/
  ui/              # Base primitives (Button, Input, Modal, Sidebar, etc.)
  modals/          # Modal dialogs
  dashboard/       # Dashboard widgets
lib/
  hooks/           # Custom React hooks
  api-client.ts    # Client-side fetch with auth
  api-error.ts     # Error handling + authedHandler wrapper
  api-helpers.ts   # Shared API middleware (project membership, etc.)
  prisma.ts        # Prisma client
  llm-providers.ts # Multi-provider LLM routing
  crypto.ts        # AES-256-GCM encryption
eval-worker/       # Python evaluation worker
prisma/            # Schema + migrations
```

## API Documentation

See `/docs` in the running app or `app/docs/sections/api.tsx` for the full API reference.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_SECRET` | Yes | AES-256-GCM key for API key encryption |
| `INTERNAL_SERVICE_TOKEN` | Yes | Shared secret for eval worker auth |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase config |
| `PHOENIX_URL` | No | Phoenix server URL (default: http://localhost:6006) |
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: rewrite README with architecture and setup guide"
```

- [ ] **Step 3: Final push**

```bash
git push
```
