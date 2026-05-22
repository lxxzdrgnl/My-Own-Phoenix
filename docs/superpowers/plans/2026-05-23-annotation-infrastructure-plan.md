# Annotation Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI vs Human annotation separation, real-time SSE updates, pending eval placeholder, Human Review page with 3 comparison tabs, and diff→dataset workflow.

**Architecture:** SSE broadcast through Next.js API routes (in-memory Map), Python eval-worker POSTs webhook on completion, client subscription hook re-fetches per spanId. New `/[slug]/human-review` page with empty state, comparison tabs (disagreement list / confusion matrix / scatter), and dataset-collection workflow. Trace detail page tabs separate Evaluations (LLM) from Annotations (HUMAN) with badges. ProjectEvalConfig's enabled set drives pending placeholder rendering.

**Tech Stack:** Next.js 16 App Router, Prisma, React 19, lucide-react, native EventSource API, no third-party SSE library, project uses TypeScript strict mode.

**Scope boundaries observed:**
- NOT modifying `lib/query/*` or `components/query-bar/*` (spec #4 territory)
- NOT modifying `components/span-tree-view.tsx` (spec #5 territory)
- NOT modifying `project-view.tsx` search/filter UI; only adding SSE hook
- Diff/.ai/.human/.any/.diff search syntax is also #4's territory (spec mentions it but defers to #4) — we will compute diff for comparison widgets directly without using the query system

---

## File Structure

**New files:**
- `lib/sse-broadcast.ts` — In-memory broadcast helper (project → Set of writers)
- `lib/hooks/use-project-sse.ts` — Client hook to subscribe to project SSE
- `app/api/sse/project/[id]/route.ts` — SSE endpoint
- `app/api/internal/eval-completed/route.ts` — Webhook from eval-worker
- `app/api/datasets/[id]/rows-from-traces/route.ts` — Diff trace → DatasetRow
- `components/dashboard/widgets/ai-human-comparison.tsx` — 3-tab comparison widget
- `components/modals/add-diff-to-dataset-dialog.tsx` — Multi-trace dataset modal
- `app/[slug]/human-review/page.tsx` — Page entry
- `app/[slug]/human-review/human-review-view.tsx` — Page implementation
- `app/projects/[name]/traces/[traceId]/trace-detail-tabs.tsx` — Tab UI for trace detail

**Modified files:**
- `components/project-sidebar.tsx` — Add Human Review nav item
- `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx` — Render tabs
- `app/projects/[name]/project-view.tsx` — Subscribe to SSE; render pending placeholder
- `lib/i18n/en.ts`, `lib/i18n/ko.ts` — New keys (humanReview, comparison, pending)
- `eval-worker/worker.py` — POST webhook on annotation upload
- `lib/phoenix.ts` — Add small helper for grouping annotations by kind (no schema change)

---

## Task 1: SSE Broadcast Helper

**Files:**
- Create: `lib/sse-broadcast.ts`

- [ ] **Step 1: Write the broadcast helper**

```ts
// lib/sse-broadcast.ts
// In-memory pub/sub for SSE. Single-instance only.
// Each project has a Set of writer functions; broadcast invokes each writer.

export type SseMessageBase = { type: string };
export type EvalCompletedMessage = SseMessageBase & {
  type: "eval-completed";
  spanId: string;
  name: string;
  kind: "LLM" | "HUMAN";
};
export type LayoutUpdatedMessage = SseMessageBase & {
  type: "layout-updated";
  // (Reserved for spec #1; payload TBD by that spec.)
  [k: string]: unknown;
};

// Discriminated union — extend by adding new variants.
export type SseMessage = EvalCompletedMessage | LayoutUpdatedMessage;

type Writer = (msg: SseMessage) => void;
const projectWriters = new Map<string, Set<Writer>>();

export function addWriter(projectId: string, writer: Writer): () => void {
  let set = projectWriters.get(projectId);
  if (!set) {
    set = new Set();
    projectWriters.set(projectId, set);
  }
  set.add(writer);
  return () => removeWriter(projectId, writer);
}

export function removeWriter(projectId: string, writer: Writer): void {
  const set = projectWriters.get(projectId);
  if (!set) return;
  set.delete(writer);
  if (set.size === 0) projectWriters.delete(projectId);
}

export function broadcast(projectId: string, msg: SseMessage): number {
  const set = projectWriters.get(projectId);
  if (!set) return 0;
  let n = 0;
  for (const w of set) {
    try { w(msg); n++; } catch { /* writer closed */ }
  }
  return n;
}

export function connectionCount(projectId: string): number {
  return projectWriters.get(projectId)?.size ?? 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sse-broadcast.ts
git commit -m "feat(sse): add in-memory broadcast helper for project-scoped SSE"
```

---

## Task 2: SSE API Endpoint

**Files:**
- Create: `app/api/sse/project/[id]/route.ts`

- [ ] **Step 1: Implement SSE endpoint**

```ts
// app/api/sse/project/[id]/route.ts
import { NextRequest } from "next/server";
import { addWriter } from "@/lib/sse-broadcast";
import { verifyAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

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
        try { controller.enqueue(encoder.encode(data)); }
        catch { closed = true; }
      };

      // initial comment to open the stream
      send(": connected\n\n");

      const unsubscribe = addWriter(project.id, (msg) => {
        send(`event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`);
      });

      const ping = setInterval(() => send(`: ping ${Date.now()}\n\n`), 30000);

      const abort = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
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
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sse/project/\[id\]/route.ts
git commit -m "feat(sse): add /api/sse/project/[id] endpoint with project-scoped auth"
```

---

## Task 3: Eval-completed Internal Webhook

**Files:**
- Create: `app/api/internal/eval-completed/route.ts`

- [ ] **Step 1: Implement the webhook**

```ts
// app/api/internal/eval-completed/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";
import { broadcast, type EvalCompletedMessage } from "@/lib/sse-broadcast";
import { prisma } from "@/lib/prisma";

// Body: { projectIdent, spanId, name, kind }
// projectIdent = DB id OR Phoenix project name (eval-worker passes phoenix name)

export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  if (uid !== "internal-service") {
    return apiError(req, ErrorCode.UNAUTHORIZED, "Internal endpoint");
  }
  const body = (await req.json()) as {
    projectIdent?: string;
    spanId?: string;
    name?: string;
    kind?: "LLM" | "HUMAN";
  };
  const err = validateFields([
    { field: "projectIdent", value: body.projectIdent, required: true },
    { field: "spanId", value: body.spanId, required: true },
    { field: "name", value: body.name, required: true },
    { field: "kind", value: body.kind, required: true },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  // Resolve to DB id (broadcast keys by DB id)
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: body.projectIdent! }, { phoenixProject: body.projectIdent! }, { slug: body.projectIdent! }] },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ ok: true, delivered: 0 });

  const msg: EvalCompletedMessage = {
    type: "eval-completed",
    spanId: body.spanId!,
    name: body.name!,
    kind: body.kind!,
  };
  const delivered = broadcast(project.id, msg);
  return NextResponse.json({ ok: true, delivered });
});
```

- [ ] **Step 2: Commit**

```bash
git add app/api/internal/eval-completed/route.ts
git commit -m "feat(sse): add internal eval-completed webhook for eval-worker"
```

---

## Task 4: Client SSE Hook

**Files:**
- Create: `lib/hooks/use-project-sse.ts`

- [ ] **Step 1: Hook with auto-reconnect**

```ts
// lib/hooks/use-project-sse.ts
"use client";

import { useEffect, useRef } from "react";

export type SseEventHandler = (msg: { type: string; [k: string]: unknown }) => void;

/**
 * Subscribe to SSE events for a project. Reconnects after 5s on disconnect.
 * Handler may be called for any event type; switch on msg.type.
 *
 * Note: EventSource does not support custom headers, so the SSE endpoint
 * must rely on auth cookies (Firebase sets one when using getAuth().currentUser).
 * In environments where only Bearer tokens are used, this hook will fail auth
 * and the SSE will not connect — UI must degrade gracefully (manual refresh).
 */
export function useProjectSse(projectIdent: string | undefined, handler: SseEventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!projectIdent) return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      es = new EventSource(`/api/sse/project/${encodeURIComponent(projectIdent)}`);

      es.addEventListener("eval-completed", (ev) => {
        try { handlerRef.current(JSON.parse((ev as MessageEvent).data)); }
        catch { /* ignore malformed */ }
      });

      es.addEventListener("layout-updated", (ev) => {
        try { handlerRef.current(JSON.parse((ev as MessageEvent).data)); }
        catch { /* ignore malformed */ }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (!stopped) retryTimer = setTimeout(open, 5000);
      };
    };

    open();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [projectIdent]);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/hooks/use-project-sse.ts
git commit -m "feat(sse): add useProjectSse client hook with auto-reconnect"
```

---

## Task 5: Wire eval-worker to call webhook

**Files:**
- Modify: `eval-worker/worker.py` (around `phoenix_upload_annotation`)

- [ ] **Step 1: Update upload helper to notify dashboard**

Add a helper and call it inside `phoenix_upload_annotation`. Replace the existing function with:

```python
def _notify_eval_completed(project: str, span_id: str, name: str, kind: str) -> None:
    """Notify dashboard so connected clients refresh their view."""
    if not INTERNAL_TOKEN:
        return
    try:
        httpx.post(
            f"{DASHBOARD_URL}/api/internal/eval-completed",
            headers={**DASHBOARD_HEADERS, "Content-Type": "application/json"},
            json={
                "projectIdent": project,
                "spanId": span_id,
                "name": name,
                "kind": kind if kind in ("LLM", "HUMAN") else "LLM",
            },
            timeout=2,
        )
    except Exception as e:
        logger.debug("eval-completed webhook failed: %s", e)


def phoenix_upload_annotation(span_id: str, name: str, kind: str, label: str, score: float, explanation: str = "", project: str = "") -> None:
    try:
        _http.post("/v1/span_annotations?sync=true", json={
            "data": [{
                "span_id": span_id,
                "name": name,
                "annotator_kind": kind,
                "result": {"label": label, "score": score, "explanation": explanation},
            }],
        })
    except Exception as e:
        logger.warning("Annotation upload failed (%s): %s", name, e)
        return
    if project:
        # CODE evaluators are LLM-like for UI purposes; map to LLM kind.
        ui_kind = "HUMAN" if kind == "HUMAN" else "LLM"
        _notify_eval_completed(project, span_id, name, ui_kind)
```

- [ ] **Step 2: Update all `phoenix_upload_annotation` call sites to pass `project`**

In `worker.py`, the function is called from:
- `_run_trace_evals` (multiple sites)
- `_run_llm_span_evals` (2 sites)
- `_run_retriever_span_evals` (1 site)

For each call site, append the `project` argument (which is already an in-scope parameter of the surrounding `_run_*` function). Example diffs:

```python
# in _run_trace_evals, change every line like:
phoenix_upload_annotation(root_id, "banned_word", "CODE", r["label"], r["score"], r.get("explanation", ""))
# to:
phoenix_upload_annotation(root_id, "banned_word", "CODE", r["label"], r["score"], r.get("explanation", ""), project)
```

Use a regex-style mental find-and-replace. Use grep first to confirm sites, then update.

- [ ] **Step 3: Commit**

```bash
git add eval-worker/worker.py
git commit -m "feat(eval-worker): POST eval-completed webhook to dashboard after each upload"
```

---

## Task 6: i18n Keys

**Files:**
- Modify: `lib/i18n/en.ts`, `lib/i18n/ko.ts`

- [ ] **Step 1: Add humanReview, comparison, traceTabs keys to en.ts**

Insert before the closing `};` of the export:

```ts
  // ── Human Review ──
  humanReview: {
    title: "Human Review",
    pageDescription: "Compare AI evaluations with human annotations to validate model accuracy and collect training data.",
    emptyTitle: "No human annotations yet",
    emptyHowTo: "How to start",
    emptyStep1: "Open a trace from the Requests page",
    emptyStep2: "Click the [Annotations 👤] tab",
    emptyStep3: "Choose an eval name and enter Pass/Fail or a score",
    emptyStep4: "Save — comparisons will appear here",
    openRecentTrace: "Open recent trace",
    viewSample: "View sample",
    sampleBadge: "Sample data — not real",
    countSummary: "{covered} of {total} traces have human review ({pct}%)",
    diffSummary: "{diff} disagreement of {compared} comparable ({pct}%)",
    annotationFilter: "Annotation",
    annotationFilterAll: "All",
    tabDisagreement: "Disagreements",
    tabConfusion: "Confusion matrix",
    tabScatter: "Scatter plot",
    aiPass: "AI Pass",
    aiFail: "AI Fail",
    humanPass: "Human Pass",
    humanFail: "Human Fail",
    noComparable: "No comparable annotations for this eval.",
    selectedCount: "{n} selected",
    addToDataset: "Add to dataset",
    diffReasonLabel: "label mismatch",
    diffReasonScore: "score gap ≥ 0.5",
    rowsAdded: "{n} rows added",
  },

  // ── Trace Detail Tabs ──
  traceTabs: {
    inputOutput: "Input / Output",
    evaluations: "Evaluations",
    annotations: "Annotations",
    raw: "Raw",
    pending: "Pending or in progress",
    pendingShort: "-",
    noEvaluations: "No automatic evaluations yet for this trace.",
    noAnnotations: "No human annotations yet. Use the form below to add one.",
    rawDescription: "OpenTelemetry attributes (raw).",
  },
```

- [ ] **Step 2: Add Korean translations to ko.ts**

Insert the same keys with Korean translations:

```ts
  humanReview: {
    title: "Human Review",
    pageDescription: "AI 자동 평가와 사람 평가를 비교해 모델 정확도를 검증하고 학습 데이터를 모읍니다.",
    emptyTitle: "Human 평가가 아직 없습니다",
    emptyHowTo: "시작하는 방법",
    emptyStep1: "Requests 페이지에서 trace 하나 열기",
    emptyStep2: "[Annotations 👤] 탭 클릭",
    emptyStep3: "eval 이름 선택, Pass/Fail 또는 점수 입력",
    emptyStep4: "저장하면 이 페이지에서 비교 확인",
    openRecentTrace: "최근 trace 열기",
    viewSample: "샘플 예시 보기",
    sampleBadge: "샘플 데이터 — 실제 데이터 아님",
    countSummary: "총 {total}건 중 {covered}건에 Human 평가 있음 ({pct}%)",
    diffSummary: "비교 가능 {compared}건 중 {diff}건 불일치 ({pct}%)",
    annotationFilter: "어노테이션",
    annotationFilterAll: "전체",
    tabDisagreement: "불일치 목록",
    tabConfusion: "혼동행렬",
    tabScatter: "산점도",
    aiPass: "AI Pass",
    aiFail: "AI Fail",
    humanPass: "Human Pass",
    humanFail: "Human Fail",
    noComparable: "이 eval에 대해 비교 가능한 어노테이션이 없습니다.",
    selectedCount: "{n}건 선택됨",
    addToDataset: "데이터셋에 추가",
    diffReasonLabel: "라벨 불일치",
    diffReasonScore: "점수 차 ≥ 0.5",
    rowsAdded: "{n}건 추가됨",
  },
  traceTabs: {
    inputOutput: "입력 / 출력",
    evaluations: "Evaluations",
    annotations: "Annotations",
    raw: "Raw",
    pending: "평가 대기 중 또는 진행 중",
    pendingShort: "-",
    noEvaluations: "이 trace에 자동 평가 결과가 아직 없습니다.",
    noAnnotations: "아직 Human 평가가 없습니다. 아래 폼에서 추가하세요.",
    rawDescription: "OpenTelemetry 속성 (raw).",
  },
```

- [ ] **Step 3: Add humanReview entry to projects sidebar i18n (en + ko)**

In both `en.ts` and `ko.ts`, inside the `projects` object (which already has `requests`, `measureNav`, `piiGuard`, `risksNav`), add:

```ts
    humanReview: "Human Review",  // en
    humanReview: "Human Review",  // ko (keep English; spec uses "Human Review")
```

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/en.ts lib/i18n/ko.ts
git commit -m "feat(i18n): add humanReview, traceTabs, sidebar keys"
```

---

## Task 7: Project Sidebar — Add Human Review

**Files:**
- Modify: `components/project-sidebar.tsx`

- [ ] **Step 1: Add Human Review item in MONITORING group**

In the NAV_GROUPS array, in the Monitoring group, add a new item AFTER `evaluations`:

```ts
{ href: "human-review", label: t.projects.humanReview ?? "Human Review", icon: Users },
```

Also import `Users` from `lucide-react` at the top of the file (add to existing import line).

- [ ] **Step 2: Commit**

```bash
git add components/project-sidebar.tsx
git commit -m "feat(sidebar): add Human Review link under MONITORING group"
```

---

## Task 8: Add diff-trace dataset insertion API

**Files:**
- Create: `app/api/datasets/[id]/rows-from-traces/route.ts`

- [ ] **Step 1: Implement the endpoint**

```ts
// app/api/datasets/[id]/rows-from-traces/route.ts
// POST: insert one DatasetRow per (spanId, evalName) diff entry.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { batchInsertRows, updateDatasetRowCount } from "@/lib/dataset-utils";
import { requireProjectMember } from "@/lib/api-helpers";

interface DiffRow {
  spanId: string;
  traceId?: string;
  query: string;
  response: string;
  context?: string;
  evalName: string;
  aiLabel: string;
  aiScore: number;
  humanLabel: string;
  humanScore: number;
}

export const POST = authedHandler(async (
  req: NextRequest,
  uid: string,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params;
  const body = (await req.json()) as { rows?: DiffRow[] };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { rows: "rows[] required" });
  }

  const ds = await prisma.dataset.findUnique({
    where: { id },
    select: { id: true, projectId: true, rowCount: true },
  });
  if (!ds) return apiError(req, ErrorCode.DATASET_NOT_FOUND, "Dataset not found");

  if (uid !== "internal-service" && ds.projectId) {
    const roleCheck = await requireProjectMember(req, ds.projectId, uid, "editor");
    if (roleCheck instanceof NextResponse) return roleCheck;
  }

  const records = body.rows.map((r) => ({
    query: r.query,
    context: r.context ?? "",
    response: r.response,
    expected: r.humanLabel,
    ai_predicted: r.aiLabel,
    ai_score: r.aiScore,
    human_score: r.humanScore,
    eval_name: r.evalName,
    source_trace_id: r.traceId ?? "",
    source_span_id: r.spanId,
  })) as unknown as Record<string, string>[];

  await batchInsertRows(id, records, ds.rowCount ?? 0);
  await updateDatasetRowCount(id);

  return NextResponse.json({ ok: true, added: records.length });
});
```

- [ ] **Step 2: Verify `updateDatasetRowCount` helper exists or inline if not**

Run:
```bash
grep -n "updateDatasetRowCount\|batchInsertRows" lib/dataset-utils.ts
```

If `updateDatasetRowCount` is missing, replace the call with inline:
```ts
const { c } = (await prisma.$queryRaw<[{ c: number }]>`
  SELECT COUNT(*) as c FROM "DatasetRow" WHERE "datasetId" = ${id}
`)[0];
await prisma.dataset.update({ where: { id }, data: { rowCount: Number(c) } });
```

- [ ] **Step 3: Commit**

```bash
git add app/api/datasets/\[id\]/rows-from-traces/route.ts
git commit -m "feat(datasets): add /rows-from-traces endpoint for diff-trace collection"
```

---

## Task 9: Diff → Dataset Modal

**Files:**
- Create: `components/modals/add-diff-to-dataset-dialog.tsx`

- [ ] **Step 1: Build the modal component**

```tsx
// components/modals/add-diff-to-dataset-dialog.tsx
"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface DiffRowInput {
  spanId: string;
  traceId?: string;
  query: string;
  response: string;
  context?: string;
  evalName: string;
  aiLabel: string;
  aiScore: number;
  humanLabel: string;
  humanScore: number;
}

interface DatasetOpt { id: string; name: string; rowCount: number }

interface Props {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  evalName: string;
  rows: DiffRowInput[];
  onSaved?: (added: number) => void;
}

export function AddDiffToDatasetDialog({ open, onClose, projectId, evalName, rows, onSaved }: Props) {
  const t = useT();
  const [datasets, setDatasets] = useState<DatasetOpt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    setNewName(`${evalName}-diff-${today}`);
    const url = projectId ? `/api/datasets?projectId=${encodeURIComponent(projectId)}` : "/api/datasets";
    apiFetch(url).then((r) => r.json()).then((d) => {
      const list = (d.datasets ?? []) as DatasetOpt[];
      setDatasets(list);
      if (list.length > 0) setSelectedId(list[0].id);
    }).catch(() => {});
  }, [open, projectId, evalName]);

  async function insertRows(datasetId: string) {
    const res = await apiFetch(`/api/datasets/${datasetId}/rows-from-traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Failed to insert rows");
    }
    const d = await res.json();
    return d.added as number;
  }

  async function handleAddExisting() {
    if (!selectedId) return;
    setSaving(true); setErr(null);
    try {
      const added = await insertRows(selectedId);
      onSaved?.(added);
      onClose();
    } catch (e) { setErr((e as Error).message); }
    setSaving(false);
  }

  async function handleCreateAndAdd() {
    if (!newName.trim()) return;
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          headers: ["query", "context", "response", "expected", "ai_predicted", "ai_score", "human_score", "eval_name", "source_trace_id", "source_span_id"],
          queryCol: "query",
          contextCol: "context",
          rows: [],
          projectId: projectId ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create dataset");
      const data = await res.json();
      const dsId = data.dataset?.id;
      if (!dsId) throw new Error("Missing dataset id");
      const added = await insertRows(dsId);
      onSaved?.(added);
      onClose();
    } catch (e) { setErr((e as Error).message); }
    setSaving(false);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Database className="size-4" />
          {t.humanReview.addToDataset}
        </div>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{t.humanReview.selectedCount.replace("{n}", String(rows.length))}</p>
          {!creating ? (
            <div className="space-y-3">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.rowCount})</option>
                ))}
                {datasets.length === 0 && <option value="">No datasets</option>}
              </select>
              <div className="flex gap-2">
                <Button onClick={handleAddExisting} disabled={saving || !selectedId} className="flex-1 text-xs">
                  {saving ? "..." : t.humanReview.addToDataset}
                </Button>
                <Button variant="outline" onClick={() => setCreating(true)} className="gap-1 text-xs">
                  <Plus className="size-3" /> New
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="text-sm" />
              <div className="flex gap-2">
                <Button onClick={handleCreateAndAdd} disabled={saving || !newName.trim()} className="flex-1 text-xs">
                  {saving ? "..." : "Create & add"}
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)} className="text-xs">Cancel</Button>
              </div>
            </div>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
      </ModalBody>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/modals/add-diff-to-dataset-dialog.tsx
git commit -m "feat(modals): add diff-trace dataset insertion dialog"
```

---

## Task 10: AI vs Human Comparison Widget

**Files:**
- Create: `components/dashboard/widgets/ai-human-comparison.tsx`

- [ ] **Step 1: Build widget with 3 tabs + diff/comparable utilities**

```tsx
// components/dashboard/widgets/ai-human-comparison.tsx
"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { type Trace, type Annotation } from "@/lib/phoenix";
import { FAIL_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { AddDiffToDatasetDialog, type DiffRowInput } from "@/components/modals/add-diff-to-dataset-dialog";

// ── Pure helpers (also exported for tests) ──

export interface ComparablePair {
  spanId: string;
  traceId: string;
  evalName: string;
  ai: Annotation;
  human: Annotation;
  isDiff: boolean;
  diffReason: "label" | "score" | "none";
  query: string;
  response: string;
  context: string;
}

const SCORE_GAP_THRESHOLD = 0.5;

function isFail(a: Annotation): boolean {
  if (FAIL_LABELS.has(a.label)) return true;
  return a.score < 0.5 && a.label !== "pass";
}

export function pairsFromTraces(traces: Trace[]): ComparablePair[] {
  const out: ComparablePair[] = [];
  for (const t of traces) {
    // Group annotations on this trace by name
    const byName = new Map<string, { ai?: Annotation; human?: Annotation }>();
    for (const a of t.annotations) {
      const slot = byName.get(a.name) ?? {};
      if (a.annotatorKind === "HUMAN") slot.human = a;
      else slot.ai = a;
      byName.set(a.name, slot);
    }
    for (const [evalName, { ai, human }] of byName) {
      if (!ai || !human) continue;
      let isDiff = false;
      let reason: "label" | "score" | "none" = "none";
      if (ai.label !== human.label) { isDiff = true; reason = "label"; }
      else if (Math.abs(ai.score - human.score) >= SCORE_GAP_THRESHOLD) { isDiff = true; reason = "score"; }
      out.push({
        spanId: t.spanId,
        traceId: t.traceId,
        evalName,
        ai,
        human,
        isDiff,
        diffReason: reason,
        query: t.query,
        response: t.response,
        context: t.context,
      });
    }
  }
  return out;
}

export interface ConfusionCounts {
  aiPassHumanPass: number;
  aiPassHumanFail: number;
  aiFailHumanPass: number;
  aiFailHumanFail: number;
}

export function confusionMatrix(pairs: ComparablePair[]): ConfusionCounts {
  let pp = 0, pf = 0, fp = 0, ff = 0;
  for (const p of pairs) {
    const aFail = isFail(p.ai);
    const hFail = isFail(p.human);
    if (!aFail && !hFail) pp++;
    else if (!aFail && hFail) pf++;
    else if (aFail && !hFail) fp++;
    else ff++;
  }
  return { aiPassHumanPass: pp, aiPassHumanFail: pf, aiFailHumanPass: fp, aiFailHumanFail: ff };
}

// ── Component ──

type Tab = "disagreement" | "confusion" | "scatter";

export function AiHumanComparison({
  traces,
  projectId,
  slug,
}: {
  traces: Trace[];
  projectId?: string;
  slug?: string;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("disagreement");
  const [selectedEval, setSelectedEval] = useState<string>("");
  const [checked, setChecked] = useState<Record<string, boolean>>({}); // key: spanId|evalName
  const [dialogOpen, setDialogOpen] = useState(false);

  const allPairs = useMemo(() => pairsFromTraces(traces), [traces]);

  const evalNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPairs) set.add(p.evalName);
    return Array.from(set).sort();
  }, [allPairs]);

  // Default selection to the first available eval
  if (selectedEval === "" && evalNames.length > 0) {
    // Schedule rather than mutate during render
    setTimeout(() => setSelectedEval(evalNames[0]), 0);
  }

  const filtered = useMemo(
    () => selectedEval ? allPairs.filter((p) => p.evalName === selectedEval) : allPairs,
    [allPairs, selectedEval],
  );

  const total = traces.length;
  const tracesWithHuman = new Set(
    traces
      .filter((tr) => tr.annotations.some((a) => a.annotatorKind === "HUMAN"))
      .map((tr) => tr.spanId),
  ).size;
  const compared = filtered.length;
  const diffCount = filtered.filter((p) => p.isDiff).length;
  const pct = compared > 0 ? Math.round((diffCount / compared) * 100) : 0;
  const coveragePct = total > 0 ? Math.round((tracesWithHuman / total) * 100) : 0;

  const cm = useMemo(() => confusionMatrix(filtered), [filtered]);

  const selectedKeys = Object.keys(checked).filter((k) => checked[k]);
  const selectedRows: DiffRowInput[] = filtered
    .filter((p) => checked[`${p.spanId}|${p.evalName}`])
    .map((p) => ({
      spanId: p.spanId,
      traceId: p.traceId,
      query: p.query,
      response: p.response,
      context: p.context,
      evalName: p.evalName,
      aiLabel: p.ai.label,
      aiScore: p.ai.score,
      humanLabel: p.human.label,
      humanScore: p.human.score,
    }));

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t.humanReview.countSummary
                .replace("{covered}", String(tracesWithHuman))
                .replace("{total}", String(total))
                .replace("{pct}", String(coveragePct))}</p>
              <p className="text-xs text-muted-foreground">{t.humanReview.diffSummary
                .replace("{diff}", String(diffCount))
                .replace("{compared}", String(compared))
                .replace("{pct}", String(pct))}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t.humanReview.annotationFilter}:</span>
            <select
              value={selectedEval}
              onChange={(e) => setSelectedEval(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {evalNames.length === 0 && <option value="">—</option>}
              {evalNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        {/* Tabs */}
        <div className="mt-3 flex gap-1 border-b -mb-3">
          {([
            ["disagreement", t.humanReview.tabDisagreement],
            ["confusion", t.humanReview.tabConfusion],
            ["scatter", t.humanReview.tabScatter],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {compared === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t.humanReview.noComparable}</p>
        ) : tab === "disagreement" ? (
          <DisagreementTab
            pairs={filtered.filter((p) => p.isDiff)}
            checked={checked}
            setChecked={setChecked}
            slug={slug}
            t={t}
          />
        ) : tab === "confusion" ? (
          <ConfusionTab counts={cm} t={t} />
        ) : (
          <ScatterTab pairs={filtered} slug={slug} />
        )}
      </div>

      {/* Action bar */}
      {tab === "disagreement" && selectedKeys.length > 0 && (
        <div className="flex items-center justify-between border-t px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {t.humanReview.selectedCount.replace("{n}", String(selectedKeys.length))}
          </span>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="text-xs">
            {t.humanReview.addToDataset}
          </Button>
        </div>
      )}

      <AddDiffToDatasetDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projectId={projectId}
        evalName={selectedEval}
        rows={selectedRows}
        onSaved={() => setChecked({})}
      />
    </div>
  );
}

function DisagreementTab({
  pairs, checked, setChecked, slug, t,
}: {
  pairs: ComparablePair[];
  checked: Record<string, boolean>;
  setChecked: (v: Record<string, boolean>) => void;
  slug?: string;
  t: ReturnType<typeof useT>;
}) {
  if (pairs.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">—</p>;
  return (
    <div className="space-y-1.5">
      {pairs.map((p) => {
        const key = `${p.spanId}|${p.evalName}`;
        const reasonLabel = p.diffReason === "label" ? t.humanReview.diffReasonLabel : t.humanReview.diffReasonScore;
        const href = slug ? `/${slug}/requests` : "#";
        return (
          <div key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
            <input
              type="checkbox"
              checked={!!checked[key]}
              onChange={(e) => setChecked({ ...checked, [key]: e.target.checked })}
              className="size-3.5"
            />
            <a href={href} className="font-mono text-[11px] truncate flex-1 hover:underline" title={p.traceId}>
              {p.traceId.slice(0, 12)}…
            </a>
            <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
              AI:{p.ai.label} ({p.ai.score.toFixed(2)})
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
              Human:{p.human.label} ({p.human.score.toFixed(2)})
            </span>
            <span className="text-muted-foreground">{reasonLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function ConfusionTab({ counts, t }: { counts: ConfusionCounts; t: ReturnType<typeof useT> }) {
  const cells: { key: string; label: string; value: number; cls: string }[] = [
    { key: "pp", label: `${t.humanReview.aiPass} / ${t.humanReview.humanPass}`, value: counts.aiPassHumanPass, cls: "bg-emerald-500/20" },
    { key: "pf", label: `${t.humanReview.aiPass} / ${t.humanReview.humanFail}`, value: counts.aiPassHumanFail, cls: "bg-yellow-500/20" },
    { key: "fp", label: `${t.humanReview.aiFail} / ${t.humanReview.humanPass}`, value: counts.aiFailHumanPass, cls: "bg-yellow-500/20" },
    { key: "ff", label: `${t.humanReview.aiFail} / ${t.humanReview.humanFail}`, value: counts.aiFailHumanFail, cls: "bg-red-500/20" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
      {cells.map((c) => (
        <div key={c.key} className={`rounded-md p-4 ${c.cls}`}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
          <p className="text-2xl font-bold tabular-nums">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function ScatterTab({ pairs, slug }: { pairs: ComparablePair[]; slug?: string }) {
  // Simple SVG scatter: x = AI score (0-1), y = Human score (0-1)
  const size = 280;
  const pad = 24;
  return (
    <div className="flex justify-center">
      <svg width={size} height={size} className="border rounded">
        {/* axes */}
        <line x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} stroke="currentColor" strokeOpacity="0.3" />
        <line x1={pad} y1={pad} x2={pad} y2={size - pad} stroke="currentColor" strokeOpacity="0.3" />
        {/* diagonal */}
        <line x1={pad} y1={size - pad} x2={size - pad} y2={pad} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="2 4" />
        {pairs.map((p) => {
          const x = pad + (size - 2 * pad) * Math.max(0, Math.min(1, p.ai.score));
          const y = (size - pad) - (size - 2 * pad) * Math.max(0, Math.min(1, p.human.score));
          const href = slug ? `/${slug}/requests` : undefined;
          const dot = (
            <circle
              cx={x}
              cy={y}
              r={p.isDiff ? 4 : 3}
              fill={p.isDiff ? "#ef4444" : "#3b82f6"}
              fillOpacity={0.7}
            >
              <title>{`${p.traceId} (AI=${p.ai.score.toFixed(2)}, Human=${p.human.score.toFixed(2)})`}</title>
            </circle>
          );
          return href ? <a key={`${p.spanId}|${p.evalName}`} href={href}>{dot}</a> : dot;
        })}
        {/* Labels */}
        <text x={size / 2} y={size - 4} textAnchor="middle" className="fill-current" fontSize="10">AI score →</text>
        <text x={4} y={size / 2} textAnchor="middle" transform={`rotate(-90 8 ${size / 2})`} className="fill-current" fontSize="10">Human score →</text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/widgets/ai-human-comparison.tsx
git commit -m "feat(widget): AI vs Human comparison with disagreement/confusion/scatter tabs"
```

---

## Task 11: Human Review Page

**Files:**
- Create: `app/[slug]/human-review/page.tsx`
- Create: `app/[slug]/human-review/human-review-view.tsx`

- [ ] **Step 1: Page wrapper**

```tsx
// app/[slug]/human-review/page.tsx
"use client";
import { useProject } from "@/lib/project-context";
import { HumanReviewView } from "./human-review-view";

export default function HumanReviewPage() {
  const { phoenixProject, id } = useProject();
  return <HumanReviewView phoenixProject={phoenixProject} projectId={id} />;
}
```

- [ ] **Step 2: View component with empty state + comparison**

```tsx
// app/[slug]/human-review/human-review-view.tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users, ArrowRight, Eye } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fetchTraces, type Trace } from "@/lib/phoenix";
import { useProjectSse } from "@/lib/hooks/use-project-sse";
import { AiHumanComparison } from "@/components/dashboard/widgets/ai-human-comparison";
import { LoadingState } from "@/components/ui/empty-state";
import { useProject } from "@/lib/project-context";

const SAMPLE_TRACES: Trace[] = [
  {
    spanId: "sample-1", traceId: "trace-aaaa-0001", time: "", latency: 0,
    query: "What is the capital of France?", context: "", response: "Paris.",
    annotations: [
      { name: "hallucination", label: "fail", score: 0.2, annotatorKind: "LLM" },
      { name: "hallucination", label: "pass", score: 1.0, annotatorKind: "HUMAN" },
    ],
    promptTokens: 0, completionTokens: 0, totalTokens: 0, model: "", status: "", spanKind: "",
  },
  {
    spanId: "sample-2", traceId: "trace-aaaa-0002", time: "", latency: 0,
    query: "How tall is Everest?", context: "", response: "8,848m.",
    annotations: [
      { name: "hallucination", label: "pass", score: 0.9, annotatorKind: "LLM" },
      { name: "hallucination", label: "fail", score: 0.0, annotatorKind: "HUMAN" },
    ],
    promptTokens: 0, completionTokens: 0, totalTokens: 0, model: "", status: "", spanKind: "",
  },
];

export function HumanReviewView({ phoenixProject, projectId }: { phoenixProject: string; projectId: string }) {
  const t = useT();
  const { slug } = useProject();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSample, setShowSample] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ts = await fetchTraces(phoenixProject);
      ts.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setTraces(ts);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [phoenixProject]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch on incoming eval-completed
  useProjectSse(projectId, (msg) => {
    if (msg.type === "eval-completed") load();
  });

  const hasHuman = traces.some((tr) => tr.annotations.some((a) => a.annotatorKind === "HUMAN"));

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center gap-2">
          <Users className="size-5" />
          <h1 className="text-xl font-semibold tracking-tight">{t.humanReview.title}</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">{t.humanReview.pageDescription}</p>

        {loading ? (
          <LoadingState />
        ) : hasHuman ? (
          <AiHumanComparison traces={traces} projectId={projectId} slug={slug} />
        ) : showSample ? (
          <div>
            <div className="mb-3 rounded-md border border-dashed bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground inline-block">
              {t.humanReview.sampleBadge}
            </div>
            <div className="opacity-70">
              <AiHumanComparison traces={SAMPLE_TRACES} slug={slug} />
            </div>
            <button onClick={() => setShowSample(false)} className="mt-4 text-xs text-muted-foreground hover:text-foreground">
              ← back
            </button>
          </div>
        ) : (
          <EmptyOnboarding traces={traces} slug={slug} onShowSample={() => setShowSample(true)} t={t} />
        )}
      </div>
    </div>
  );
}

function EmptyOnboarding({
  traces, slug, onShowSample, t,
}: {
  traces: Trace[];
  slug: string;
  onShowSample: () => void;
  t: ReturnType<typeof useT>;
}) {
  const mostRecent = traces[0];
  const recentHref = mostRecent ? `/${slug}/requests` : `/${slug}/requests`;
  return (
    <div className="rounded-xl border bg-card p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <Users className="size-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t.humanReview.emptyTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {t.humanReview.countSummary
              .replace("{covered}", "0")
              .replace("{total}", String(traces.length))
              .replace("{pct}", "0")}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/10 p-4 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {t.humanReview.emptyHowTo}
        </p>
        <ol className="space-y-1.5 text-sm">
          <li className="flex gap-2"><span className="text-muted-foreground">1.</span>{t.humanReview.emptyStep1}</li>
          <li className="flex gap-2"><span className="text-muted-foreground">2.</span>{t.humanReview.emptyStep2}</li>
          <li className="flex gap-2"><span className="text-muted-foreground">3.</span>{t.humanReview.emptyStep3}</li>
          <li className="flex gap-2"><span className="text-muted-foreground">4.</span>{t.humanReview.emptyStep4}</li>
        </ol>
      </div>

      <div className="flex gap-2">
        <Link
          href={recentHref}
          className="inline-flex items-center gap-1.5 rounded-md border bg-foreground px-3 py-2 text-xs font-medium text-background hover:bg-foreground/90"
        >
          {t.humanReview.openRecentTrace} <ArrowRight className="size-3" />
        </Link>
        <button
          onClick={onShowSample}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          <Eye className="size-3" /> {t.humanReview.viewSample}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\[slug\]/human-review/page.tsx app/\[slug\]/human-review/human-review-view.tsx
git commit -m "feat(human-review): new page with empty-state onboarding and 3-tab comparison"
```

---

## Task 12: Trace Detail Tabs

**Files:**
- Create: `app/projects/[name]/traces/[traceId]/trace-detail-tabs.tsx`
- Modify: `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx`

- [ ] **Step 1: Build tabs component**

```tsx
// app/projects/[name]/traces/[traceId]/trace-detail-tabs.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { type TraceTree, type Annotation } from "@/lib/phoenix";
import { AnnotationBadges } from "@/components/annotation-badge";
import { AnnotationForm } from "@/components/modals/annotation-form";
import { apiFetch } from "@/lib/api-client";
import { Bot, User, FileJson, ListChecks, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "io" | "evaluations" | "annotations" | "raw";

interface Props {
  trace: TraceTree;
  projectId?: string;
  onRefresh: () => void;
}

function partitionAnnotations(arr: Annotation[]): { llm: Annotation[]; human: Annotation[] } {
  const llm: Annotation[] = [];
  const human: Annotation[] = [];
  for (const a of arr) {
    if (a.annotatorKind === "HUMAN") human.push(a);
    else llm.push(a);
  }
  return { llm, human };
}

export function TraceDetailTabs({ trace, projectId, onRefresh }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("io");
  const [enabledEvals, setEnabledEvals] = useState<string[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [annotateOpen, setAnnotateOpen] = useState(false);

  // Load enabled evals (for pending placeholders)
  useEffect(() => {
    if (!projectId) return;
    apiFetch(`/api/eval-config?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.configs ?? []).filter((c: any) => c.enabled).map((c: any) => c.evalName as string);
        setEnabledEvals(list);
      })
      .catch(() => {});
  }, [projectId]);

  const root = trace.rootSpan;
  const { llm, human } = partitionAnnotations(root.annotations);

  return (
    <div className="rounded-xl border bg-card">
      {/* Tab bar */}
      <div className="flex items-center border-b">
        <TabBtn active={tab === "io"} onClick={() => setTab("io")}>
          <FileJson className="size-3" /> {t.traceTabs.inputOutput}
        </TabBtn>
        <TabBtn active={tab === "evaluations"} onClick={() => setTab("evaluations")}>
          <Bot className="size-3" /> {t.traceTabs.evaluations}
          <CountBadge n={llm.length} />
        </TabBtn>
        <TabBtn active={tab === "annotations"} onClick={() => setTab("annotations")}>
          <User className="size-3" /> {t.traceTabs.annotations}
          <CountBadge n={human.length} />
        </TabBtn>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="ml-auto px-4 py-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {t.traceTabs.raw} <ChevronDown className={cn("size-3 transition-transform", showRaw && "rotate-180")} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {tab === "io" && <IoPanel input={root.input} output={root.output} />}
        {tab === "evaluations" && (
          <EvaluationsPanel
            annotations={llm}
            enabledEvals={enabledEvals}
            pendingLabel={t.traceTabs.pendingShort}
            pendingTitle={t.traceTabs.pending}
            empty={t.traceTabs.noEvaluations}
          />
        )}
        {tab === "annotations" && (
          <AnnotationsPanel
            annotations={human}
            empty={t.traceTabs.noAnnotations}
            onAdd={() => setAnnotateOpen(true)}
          />
        )}
      </div>

      {/* Raw collapsible */}
      {showRaw && (
        <div className="border-t p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t.traceTabs.rawDescription}</p>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-words text-foreground/70 max-h-96 overflow-auto">
            {JSON.stringify(root, null, 2)}
          </pre>
        </div>
      )}

      <AnnotationForm
        open={annotateOpen}
        onClose={() => setAnnotateOpen(false)}
        spanId={root.spanId}
        existingAnnotations={root.annotations}
        onSaved={onRefresh}
      />
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
        active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CountBadge({ n }: { n: number }) {
  return <span className="rounded bg-muted px-1.5 text-[10px] tabular-nums">{n}</span>;
}

function IoPanel({ input, output }: { input: string; output: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Input</p>
        <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-2 max-h-96 overflow-auto">{input || "—"}</pre>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Output</p>
        <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-2 max-h-96 overflow-auto">{output || "—"}</pre>
      </div>
    </div>
  );
}

function EvaluationsPanel({
  annotations, enabledEvals, pendingLabel, pendingTitle, empty,
}: {
  annotations: Annotation[];
  enabledEvals: string[];
  pendingLabel: string;
  pendingTitle: string;
  empty: string;
}) {
  const haveNames = new Set(annotations.map((a) => a.name));
  const pending = enabledEvals.filter((n) => !haveNames.has(n));

  if (annotations.length === 0 && pending.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnnotationBadges annotations={annotations} />
      {pending.map((name) => (
        <span
          key={`pending-${name}`}
          title={pendingTitle}
          className="inline-flex items-center gap-1 rounded border border-dashed border-foreground/20 px-2 py-1 text-[10px] font-mono text-muted-foreground"
        >
          {name} <span className="font-bold">{pendingLabel}</span>
        </span>
      ))}
    </div>
  );
}

function AnnotationsPanel({
  annotations, empty, onAdd,
}: {
  annotations: Annotation[];
  empty: string;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {annotations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <AnnotationBadges annotations={annotations} />
      )}
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Plus className="size-3" /> Add annotation
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire tabs into trace-detail-view above SpanTreeView**

In `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx`, replace the body to render the new tabs above the span tree:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchTraceTrees, type TraceTree } from "@/lib/phoenix";
import { SpanTreeView } from "@/components/span-tree-view";
import { LoadingState } from "@/components/ui/empty-state";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useProjectOptional } from "@/lib/project-context";
import { TraceDetailTabs } from "./trace-detail-tabs";

export function TraceDetailView({ projectName, traceId }: { projectName: string; traceId: string }) {
  const t = useT();
  const projectCtx = useProjectOptional();
  const [traces, setTraces] = useState<TraceTree[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTraceTrees(projectName);
      setTraces(result.filter((t) => t.traceId === traceId));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [projectName, traceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/projects/${encodeURIComponent(projectName)}`} className="rounded p-1.5 transition-colors hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t.projects.traceDetail}</h1>
          <p className="text-xs font-mono text-muted-foreground">{traceId}</p>
        </div>
      </div>
      {loading && <LoadingState />}
      {!loading && traces.length > 0 && (
        <div className="space-y-4">
          <TraceDetailTabs trace={traces[0]} projectId={projectCtx?.id} onRefresh={load} />
          <SpanTreeView traces={traces} projectName={projectName} onRefresh={load} />
        </div>
      )}
      {!loading && traces.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.projects.traceNotFound}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/projects/\[name\]/traces/\[traceId\]/trace-detail-tabs.tsx app/projects/\[name\]/traces/\[traceId\]/trace-detail-view.tsx
git commit -m "feat(trace-detail): add Evaluations/Annotations/Raw tabs with pending placeholder"
```

---

## Task 13: SSE subscription + pending placeholder in project-view

**Files:**
- Modify: `app/projects/[name]/project-view.tsx`

- [ ] **Step 1: Import the hook and the project context**

Add imports near the top:

```ts
import { useProjectSse } from "@/lib/hooks/use-project-sse";
import { useProjectOptional } from "@/lib/project-context";
```

- [ ] **Step 2: Subscribe to SSE in the component**

Inside `ProjectView` after `loadTraces` is defined and the first useEffect runs:

```ts
  const projectCtx = useProjectOptional();
  useProjectSse(projectCtx?.id, (msg) => {
    if (msg.type === "eval-completed") loadTraces();
  });
```

(Place these two lines after the existing `useEffect(() => { loadTraces(); }, [loadTraces]);`.)

- [ ] **Step 3: Commit**

```bash
git add app/projects/\[name\]/project-view.tsx
git commit -m "feat(project-view): subscribe to project SSE for live eval refresh"
```

---

## Task 14: TypeScript check

- [ ] **Step 1: Run TS check**

```bash
npx tsc --noEmit
```

Expected: zero errors related to new files (existing errors in unmodified files, if any, are out of scope).

- [ ] **Step 2: If errors, fix them**

Address only errors in newly-created or newly-modified files.

- [ ] **Step 3: Final verification commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(types): address TS errors from new SSE/human-review modules"
```

---

## Self-Review Notes

- Spec coverage:
  - #1 SSE: Tasks 1–5, 13 ✓
  - #2 Real-time updates: Tasks 1–4 ✓
  - #2 Pending: Task 12 (EvaluationsPanel pending list) ✓
  - #3 AI vs Human separation: Task 12 (trace tabs), Task 10 (comparison widget) ✓
  - #3 Comparison page + onboarding empty state: Task 11 ✓
  - #3 Diff → dataset workflow: Tasks 8, 9, 10 (checkbox + action bar) ✓
  - Sidebar nav: Task 7 ✓
  - i18n keys: Task 6 ✓
- Out of scope per parent instructions: search syntax (.diff/.ai/.human), span-tree-view changes — confirmed not touched.
- Tests: project has no test runner configured; verification is via `npx tsc --noEmit`. Diff/confusion computation is exported as pure functions (`pairsFromTraces`, `confusionMatrix`) and can be tested when a test runner is added.
