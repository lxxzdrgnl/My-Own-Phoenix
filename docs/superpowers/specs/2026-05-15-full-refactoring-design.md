# Full Codebase Refactoring Design Spec

**Date**: 2026-05-15
**Scope**: Dead code cleanup, auth unification, DB schema, security hardening, design patterns, component refactoring, folder structure, API docs, README

---

## Phase 1: Dead Code & Cleanup (Low Risk)

### Delete unused exports
- `lib/constants.ts`: remove `DEFAULT_LANGGRAPH_ENDPOINT`, `DEFAULT_PHOENIX_URL`
- `lib/date-utils.ts`: remove `formatDateTimeFull`
- `lib/hooks.ts`: remove `useApiFetch`
- `lib/llm-providers.ts`: remove `getActiveProviders`
- `lib/auth-project.ts`: remove `requireProjectAccess`, `resolveProject` (entire file if empty)
- `lib/chatApi.ts`: remove `getThreadState`
- `lib/dashboard-utils.ts`: remove `pieOpts`, `FAIL_COLOR_DEFAULT`

### Delete unused components
- `components/agent-selector.tsx` — replaced by unified agent/model selector
- `components/agent-config-modal.tsx` — replaced by project settings Agent tab
- `components/agent-templates-modal.tsx` — removed from selector

### Delete unused directories/files
- `app/dashboard/` — empty directory
- `scripts/migrate-sqlite-to-pg.ts` — one-time migration, done
- `scripts/migrate-encryption.ts` — one-time migration, done

---

## Phase 2: Security Hardening (Critical)

### 2a. IDOR Fixes — add ownership checks

**user-threads routes** (`app/api/user-threads/`):
- GET: use `uid` from auth instead of query param `userId`
- DELETE/PATCH `[id]`: verify `thread.userId === uid` before modifying
- GET/POST `[id]/messages`: verify thread ownership

**datasets routes** (`app/api/datasets/`):
- All CRUD: verify user is member of dataset's project via `projectId`
- `datasets/rows/`: same project membership check
- `datasets/runs/[runId]`: verify run's dataset belongs to user's project
- `datasets/runs/[runId]/export`: same check

**Other routes needing ownership checks**:
- `app/api/feedback/route.ts`: verify project membership
- `app/api/risks/route.ts`: verify project membership
- `app/api/incidents/route.ts`: verify project membership

### 2b. SQL Injection Fix

**`app/api/datasets/route.ts` line 82**: Replace `$executeRawUnsafe` with whitelist approach:
```typescript
const ALLOWED_FIELDS = new Set(["name", "fileName", "headers", "queryCol", "contextCol"]);
// reject any field not in whitelist before building SET clause
```

### 2c. Error Leakage Fix

Replace raw `e.message` in error responses with generic messages in:
- `app/api/[..._path]/route.ts`
- `app/api/pii-guard/route.ts`
- `app/api/projects/[id]/invite-codes/route.ts`

### 2d. .env — remove from git tracking

Add `.env` to `.gitignore` if not already. (Secrets already committed — user should rotate them separately.)

---

## Phase 3: Auth Pattern Unification

Migrate all routes using raw `requireAuth` to `authedHandler`:

| Route | Current | Target |
|-------|---------|--------|
| `api/chat-relay/route.ts` | requireAuth | authedHandler |
| `api/projects/route.ts` (GET/POST/PUT/DELETE) | requireAuth | authedHandler |
| `api/projects/join/route.ts` | requireAuth | authedHandler |
| `api/projects/[id]/members/route.ts` | requireAuth | authedHandler |
| `api/projects/[id]/invite-codes/route.ts` | requireAuth | authedHandler |
| `api/projects/[id]/join-requests/route.ts` | requireAuth | authedHandler |
| `api/user/connector-key/route.ts` | requireAuth | authedHandler |

---

## Phase 4: DB Schema Improvements (Data Preserved)

All changes via `prisma migrate` — no data loss.

### 4a. Standardize relation names

Rename `projectRef` → `project` in all models:
- `Thread`, `RiskItem`, `Incident`, `ProjectEvalConfig`, `AgentConfig`

This is a Prisma relation name only (no DB column change), so zero data risk.

### 4b. Remove redundant string fields

- `Thread.project` (String) — redundant with `Thread.projectId` (FK). Migrate: update all code reading `thread.project` to use `thread.projectRef.name` or join, then drop column.
- `DashboardLayout.project` (String) — same treatment.

Migration strategy: add new migration that drops these columns after verifying all code references are updated.

### 4c. Add missing indexes

```prisma
// Message — thread message queries
@@index([threadId, createdAt])

// RiskItem — assignee filtering
@@index([assignee])

// Incident — time-range queries
@@index([createdAt])
```

### 4d. Remove stale unique constraint

The `LlmProvider_userId_provider_key` was already dropped from production DB. Ensure migration file reflects this (already done).

---

## Phase 5: Design Patterns & Hooks Extraction

### 5a. `useFormSubmit` hook

Extract the repeated save/error/loading pattern (found in 18+ files):

```typescript
// lib/hooks/use-form-submit.ts
function useFormSubmit<T>(submitFn: (data: T) => Promise<Response>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (data: T) => {
    setSaving(true);
    setError(undefined);
    try {
      const res = await submitFn(data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || `Error ${res.status}`);
        return null;
      }
      return await res.json();
    } catch {
      setError("Network error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { submit, saving, error, setError };
}
```

Apply to: all modal forms, settings sections, API key add forms.

### 5b. `useResourceList` hook

Extract the repeated CRUD list pattern:

```typescript
// lib/hooks/use-resource-list.ts
function useResourceList<T>(endpoint: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => { ... }, [endpoint]);
  const create = async (data: Partial<T>) => { ... };
  const update = async (id: string, data: Partial<T>) => { ... };
  const remove = async (id: string) => { ... };

  useEffect(() => { load(); }, [load]);

  return { items, loading, load, create, update, remove };
}
```

Apply to: datasets list, eval prompts list, agent configs, threads.

### 5c. `requireProjectMember` middleware helper

Extract the repeated membership check from API routes:

```typescript
// lib/api-helpers.ts
async function requireProjectMember(
  projectId: string,
  userId: string,
  minRole?: "editor" | "owner"
): Promise<ProjectMember | NextResponse>
```

Apply to: all `/api/projects/[id]/*` routes + dataset/risk/incident routes.

---

## Phase 6: Reusable Component Cleanup

### 6a. `ConfirmDialog` component

Extract the repeated `confirm()` + destructive action pattern into a shared component:

```typescript
// components/ui/confirm-dialog.tsx
<ConfirmDialog
  title="Delete Dataset"
  description="This action cannot be undone."
  confirmText="Delete"
  variant="destructive"
  onConfirm={handleDelete}
/>
```

Replace all `if (!confirm(...)) return;` patterns (found in 8+ places).

### 6b. `ProviderRow` component reuse

The provider row UI in project settings (`app/[slug]/settings/page.tsx` ApiKeysTab) and global settings (`app/settings/providers-section.tsx`) are nearly identical. Extract into shared `components/provider-key-row.tsx`.

### 6c. Modal composition pattern

All 10+ modals share the same structure. Create `ModalForm` wrapper:

```typescript
// components/ui/modal-form.tsx
<ModalForm title="..." open={open} onClose={onClose} onSubmit={handleSubmit} saving={saving} error={error}>
  {children}
</ModalForm>
```

### 6d. `SectionCard` component

Extract the repeated settings section pattern:

```typescript
// components/ui/section-card.tsx
<SectionCard title="LLM Provider Keys" description="API keys used for...">
  {children}
</SectionCard>
```

Found in project settings, global settings, docs page.

---

## Phase 7: Folder Structure Reorganization

```
components/
  ui/              (base primitives — keep as-is)
  modals/          (move 10 modals here)
    prompts-modal.tsx
    prompt-edit-modal.tsx
    eval-selector-modal.tsx
    csv-import-modal.tsx
    add-to-dataset-modal.tsx
    auth-modal.tsx
    confirm-dialog.tsx      (new)
    modal-form.tsx          (new)
  dashboard/       (keep as-is)

lib/
  hooks/           (new — extracted hooks)
    use-form-submit.ts
    use-resource-list.ts
  api-helpers.ts   (new — requireProjectMember, etc.)
```

**NOT moving**: `app/` page structure stays the same (Next.js convention).

---

## Phase 8: Large Component Splits

### 8a. `dataset-manager.tsx` (689 lines)

Split into:
- `dataset-manager.tsx` — orchestrator (state + layout, ~200 lines)
- `dataset-sidebar.tsx` — dataset list sidebar (~100 lines)
- `dataset-toolbar.tsx` — action buttons, agent selector (~80 lines)
- Keep existing `dataset-config-panel.tsx` and `dataset-results.tsx`

### 8b. `eval-editor.tsx` (651 lines)

Split into:
- `eval-editor.tsx` — main editor (~200 lines)
- `eval-test-panel.tsx` — test execution UI (~150 lines)
- `eval-backfill-panel.tsx` — backfill date range + execution (~150 lines)

### 8c. `openapi-spec.ts` (758 lines)

Split by domain:
- `lib/openapi/index.ts` — base spec + merge
- `lib/openapi/projects.ts` — project endpoints
- `lib/openapi/datasets.ts` — dataset endpoints
- `lib/openapi/providers.ts` — provider endpoints

---

## Phase 9: API Documentation Update

Update `app/docs/sections/api.tsx` to document all 41 routes, grouped by:
- Projects & Collaboration
- Providers & API Keys
- Datasets & Runs
- Evaluations
- Observability (Feedback, Risks, Incidents)
- Chat & Threads
- Infrastructure (Health, Collect, Proxy)

---

## Phase 10: README Update

After all refactoring, update `README.md` with:
- Project overview
- Architecture diagram (text)
- Tech stack
- Getting started (Docker Compose)
- Environment variables
- API overview (link to /docs)
- Project structure
- Contributing

---

## Implementation Order

| Phase | Description | Risk | Depends On |
|-------|-------------|------|------------|
| 1 | Dead code cleanup | None | — |
| 2 | Security hardening | Low | — |
| 3 | Auth unification | Low | — |
| 4 | DB schema | Low (migration) | — |
| 5 | Design patterns (hooks) | Low | — |
| 6 | Reusable components | Low | Phase 5 |
| 7 | Folder restructure | Medium (imports) | Phase 1, 6 |
| 8 | Component splits | Medium | Phase 5, 6 |
| 9 | API docs | None | Phase 2, 3 |
| 10 | README | None | All |
