# Guard Span Tracing — Dashboard Plan

**Date:** 2026-05-23
**Spec:** `docs/superpowers/specs/2026-05-23-guard-span-tracing-design.md` (대시보드 측 section)
**Scope:** Dashboard-side visualization for GUARDRAIL span_kind. Agent-side emit is handled by a separate agent.
**Branch:** `worktree-agent-aac9f6629aa6953ee`

## Context recap

Phoenix DB currently has 0 GUARDRAIL spans. Once the agent-side starts emitting `pii_guard` spans, the dashboard must:

1. Color/icon them distinctly in the span tree.
2. Surface a 🛡 badge on trace rows that contain a triggered guard.
3. Show a side-by-side diff (input vs masked output) in span detail.
4. Degrade gracefully — render nothing extra when no GUARDRAIL spans are present.

Attribute contract (from spec):

- `attributes["openinference.span.kind"] === "GUARDRAIL"`
- `attributes["guardrail.triggered"]: boolean`
- `attributes["guardrail.detections"]: string` — JSON array of `{type, start, end, masked}`
- `attributes["guardrail.type"]: string` — e.g. `"pii_mask"`
- `attributes["guardrail.detection_count"]: number`
- `attributes["input.value"]: string` — original
- `attributes["output.value"]: string` — masked

## Scope boundaries

- DO NOT touch the search/filter UI in `project-view.tsx` (spec #4 territory).
- DO NOT touch SSE files (spec #2 / #3).
- DO NOT touch `prisma/schema.prisma` (spec #1).
- DO add guard badge to trace rows — but the rows live in `components/span-tree-view.tsx` (`TraceAccordionItem`), NOT `project-view.tsx`. The badge will go there.
- Trace-detail integration: `trace-detail-view.tsx` already renders `SpanTreeView`. `SpanTreeView` renders `SpanDetail` for selected spans. So the GuardrailDetail integration happens inside `SpanDetail` — we branch by `spanKind === "GUARDRAIL"`.

## Decisions

1. **Span color logic:** Add GUARDRAIL to `SPAN_BAR_COLORS` map for timeline bar. For node icon/bg/fg, extend `SPAN_STYLES` similarly. Branch by `attributes["guardrail.triggered"]` in a small helper that takes the span and returns a style. To avoid plumbing attributes everywhere, store `guardrail.triggered` and `guardrail.detections` on `RawSpan` so the tree component does not need raw attribute access.

2. **RawSpan extension:** Add optional fields to `RawSpan`:
   - `guardrailTriggered?: boolean`
   - `guardrailDetections?: GuardrailDetection[]` (parsed)
   - `guardrailType?: string`
   Populate them in `buildSpanTree` only when `spanKind === "GUARDRAIL"`.

3. **TraceTree.hasGuardrailTriggered:** Add `hasGuardrailTriggered: boolean` to `TraceTree`. Compute by walking the tree once after assembly.

4. **Trace badge location:** Add to `TraceAccordionItem` in `span-tree-view.tsx` next to the existing `span count` badge. Red destructive style.

5. **GuardrailDetail component:** New file `components/span-detail/guardrail-detail.tsx`. Side-by-side two-column layout. Top header strip with type, triggered status, detection count. Below the diff a detections table. Triggered=false → "No PII detected" message + show original only.

6. **Diff highlighting strategy:** Mark detected ranges in the original (using `start`/`end` from detections). For the masked side, do a simple substring search for `[NAME]`, `[PHONE]`, etc. placeholders matching the detection types and highlight them. Plain `<mark>`-style spans with class — no fancy diff library. This is robust to mismatched offsets.

7. **i18n:** Add a small block to ko.ts/en.ts under `projects` for guardrail labels (or under a new `guardrail` namespace). Keep minimal — header text + table column labels + "No PII detected".

8. **Tests:** Codebase has no test framework. Write standalone `.ts` test files runnable via `tsx` that assert pure-function logic:
   - `lib/__tests__/phoenix.guardrail.test.ts` — `hasGuardrailTriggered` computation + RawSpan field extraction.
   - `components/__tests__/guardrail-style.test.ts` — color/icon branch logic.
   These live outside the `scripts/` exclude pattern via `__tests__/` directories. Pure-logic tests only — no DOM rendering. Move complex parsing helpers (e.g. `parseGuardrailDetections`) to standalone exports so they can be tested.

## File-by-file changes

### `lib/phoenix.ts`
- Add `GuardrailDetection` interface.
- Add export `parseGuardrailDetections(raw: unknown): GuardrailDetection[]` — robust parse of JSON-string or array.
- Add export `computeHasGuardrailTriggered(root: RawSpan): boolean`.
- Add to `RawSpan`: `guardrailTriggered?`, `guardrailDetections?`, `guardrailType?`.
- Add to `TraceTree`: `hasGuardrailTriggered: boolean`.
- In `buildSpanTree`, populate guardrail fields on each span when kind is GUARDRAIL.
- In `fetchTraceTrees`, compute `hasGuardrailTriggered` for each tree.
- (Optionally) extend `Trace` with `hasGuardrailTriggered` for parity. The spec asks for this in `fetchTraces` output. Compute by checking any span (not just root) in the trace for triggered guardrail. Will add to `Trace` and populate in `fetchTraces`.

### `components/span-tree-view.tsx`
- Add `Shield`, `ShieldCheck` imports.
- Add GUARDRAIL entries to `SPAN_BAR_COLORS` (red `#dc2626`) and `SPAN_BAR_COLORS_PASS` (gray `#9ca3af`). Or, simpler: change `SPAN_BAR_COLORS` lookups to a helper `getSpanBarColor(span)` that branches on guardrail.triggered for GUARDRAIL.
- Same for `SPAN_STYLES`: add GUARDRAIL and GUARDRAIL_PASS entries with Shield/ShieldCheck. Change `getSpanStyle(kind)` to `getSpanStyle(span)` so it can read `guardrailTriggered`. Update call sites.
- In `TraceAccordionItem`, render guard badge when `trace.hasGuardrailTriggered`.
- In `SpanDetail`, when `span.spanKind === "GUARDRAIL"`, render `<GuardrailDetail span={span} />` instead of the default input/output tabs.

### `components/span-detail/guardrail-detail.tsx` (new)
- Pure presentation. Props: `{ span: RawSpan }`.
- Reads `span.guardrailTriggered`, `span.guardrailDetections`, `span.guardrailType`, `span.input`, `span.output`.
- Layout: header strip, side-by-side panes (input/output), detections table.
- Triggered=false fallback.

### `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx`
- No changes required — already routes through `SpanTreeView` → `SpanDetail` which we extend in step 2.
- Confirm: spec says "When a GUARDRAIL span is selected in trace-detail-view.tsx, render the GuardrailDetail component." Since trace-detail-view delegates to SpanTreeView, the branching lives in SpanTreeView's SpanDetail. No edits to trace-detail-view.tsx required.

### `lib/i18n/ko.ts` and `lib/i18n/en.ts`
- Add small `guardrail` namespace OR add keys under `projects` for: "Guard", "PII Guard", "triggered", "passed", "No PII detected", "Original input", "Masked output", "detections", "Type", "Range", "Masked value".

### Tests
- `lib/__tests__/phoenix.guardrail.test.ts`
- `components/__tests__/guardrail-style.test.ts`

## Implementation order

1. `lib/phoenix.ts` — types + parse helper + compute helper + populate.
2. `lib/i18n/{en,ko}.ts` — add labels.
3. `components/span-detail/guardrail-detail.tsx` — new component.
4. `components/span-tree-view.tsx` — style branch + badge + detail integration.
5. Tests.
6. tsc check.

## Verification

- `npx tsc --noEmit` clean.
- Spot-check by reading code paths.
- (No runtime verification possible — no GUARDRAIL data in DB yet, per spec.)

## Conflict risk

- `components/span-tree-view.tsx` — `TraceAccordionItem` row is shared with potential spec #4 search/filter work. We only ADD a small badge next to the existing span count; no restructuring.
- `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx` — untouched.
- `lib/phoenix.ts` `Trace` / `TraceTree` types — additive only. Same goes for `RawSpan` (new optional fields).

## Out of scope

- Updating context extraction in `lib/phoenix.ts` to include guard output — spec says explicitly to skip.
- Search shortcut `guardrail:triggered` — depends on spec #4 search infra.
- Migration of existing traces — none have GUARDRAIL spans, nothing to migrate.
