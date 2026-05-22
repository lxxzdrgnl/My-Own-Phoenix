// components/dashboard/widgets/ai-human-comparison.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { type Trace, type TraceTree, type Annotation } from "@/lib/phoenix";
import { FAIL_LABELS } from "@/lib/constants";
import { SpanTreeView } from "@/components/span-tree-view";

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
      if (ai.label !== human.label) {
        isDiff = true;
        reason = "label";
      } else if (Math.abs(ai.score - human.score) >= SCORE_GAP_THRESHOLD) {
        isDiff = true;
        reason = "score";
      }
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
  let pp = 0,
    pf = 0,
    fp = 0,
    ff = 0;
  for (const p of pairs) {
    const aFail = isFail(p.ai);
    const hFail = isFail(p.human);
    if (!aFail && !hFail) pp++;
    else if (!aFail && hFail) pf++;
    else if (aFail && !hFail) fp++;
    else ff++;
  }
  return {
    aiPassHumanPass: pp,
    aiPassHumanFail: pf,
    aiFailHumanPass: fp,
    aiFailHumanFail: ff,
  };
}

// ── Component ──

export function AiHumanComparison({
  traces,
  traceTrees,
  projectId: _projectId,
  projectName,
  slug,
  onRefresh,
}: {
  traces: Trace[];
  traceTrees?: TraceTree[];
  projectId?: string;
  projectName?: string;
  slug?: string;
  onRefresh?: () => void;
}) {
  const t = useT();
  const [selectedEval, setSelectedEval] = useState<string>("");

  const allPairs = useMemo(() => pairsFromTraces(traces), [traces]);

  // All eval names that appear on any annotation (AI or HUMAN), so the
  // filter dropdown shows the user's review even when there is no AI
  // counterpart to pair with.
  const evalNames = useMemo(() => {
    const set = new Set<string>();
    for (const tr of traces) {
      for (const a of tr.annotations) set.add(a.name);
    }
    return Array.from(set).sort();
  }, [traces]);

  // Auto-correct if selectedEval was set to a name that no longer exists.
  useEffect(() => {
    if (selectedEval !== "" && !evalNames.includes(selectedEval)) {
      setSelectedEval("");
    }
  }, [evalNames, selectedEval]);

  const filtered = useMemo(
    () => (selectedEval ? allPairs.filter((p) => p.evalName === selectedEval) : allPairs),
    [allPairs, selectedEval],
  );

  const compared = filtered.length;
  const cm = useMemo(() => confusionMatrix(filtered), [filtered]);

  // ── Disagreement list source (with fallback) ──
  // Priority 1: trace IDs that have diff pairs on selected eval.
  // Fallback: trace IDs with a HUMAN annotation matching the selected eval
  // (or any human annotation if no eval is selected).
  const diffPairs = useMemo(() => filtered.filter((p) => p.isDiff), [filtered]);
  const humanReviewedTraceIds = useMemo(() => {
    const s = new Set<string>();
    for (const tr of traces) {
      const hit = selectedEval
        ? tr.annotations.some((a) => a.annotatorKind === "HUMAN" && a.name === selectedEval)
        : tr.annotations.some((a) => a.annotatorKind === "HUMAN");
      if (hit) s.add(tr.traceId);
    }
    return s;
  }, [traces, selectedEval]);
  const disagreementTraceIds = useMemo(() => {
    if (diffPairs.length > 0) return new Set(diffPairs.map((p) => p.traceId));
    return humanReviewedTraceIds;
  }, [diffPairs, humanReviewedTraceIds]);
  const isFallbackList = diffPairs.length === 0 && humanReviewedTraceIds.size > 0;

  // ── Per-eval counts for filter pills ──
  // Shows the number of traces that would appear in the disagreement list
  // if that pill were active. Helps first-time users see at-a-glance which
  // eval has work to review.
  const evalCounts = useMemo(() => {
    function countFor(evalName: string | null): number {
      const pairsForE = evalName
        ? allPairs.filter((p) => p.evalName === evalName)
        : allPairs;
      const diffs = pairsForE.filter((p) => p.isDiff);
      if (diffs.length > 0) return new Set(diffs.map((p) => p.traceId)).size;
      // Fallback: count human-reviewed traces matching the eval (or any).
      let n = 0;
      for (const tr of traces) {
        const hit = evalName
          ? tr.annotations.some((a) => a.annotatorKind === "HUMAN" && a.name === evalName)
          : tr.annotations.some((a) => a.annotatorKind === "HUMAN");
        if (hit) n++;
      }
      return n;
    }
    const counts: Record<string, number> = { __all__: countFor(null) };
    for (const n of evalNames) counts[n] = countFor(n);
    return counts;
  }, [allPairs, traces, evalNames]);

  return (
    <div className="space-y-6">
      {/* Annotation filter — pill row with per-eval counts */}
      {evalNames.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t.humanReview.annotationFilter}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill
              active={selectedEval === ""}
              label={t.humanReview.annotationFilterAll}
              count={evalCounts.__all__ ?? 0}
              onClick={() => setSelectedEval("")}
            />
            {evalNames.map((n) => (
              <FilterPill
                key={n}
                active={selectedEval === n}
                label={n}
                count={evalCounts[n] ?? 0}
                onClick={() => setSelectedEval(n)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stats row: confusion matrix + scatter side-by-side */}
      {compared > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-6">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t.humanReview.tabConfusion}
            </p>
            <ConfusionTab counts={cm} t={t} />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t.humanReview.tabScatter}
            </p>
            <ScatterTab pairs={filtered} slug={slug} t={t} />
          </div>
        </div>
      )}

      {/* Disagreement list section */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {t.humanReview.tabDisagreement}
          </h2>
          {disagreementTraceIds.size > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {disagreementTraceIds.size}
              {compared > 0 ? ` / ${new Set(filtered.map((p) => p.traceId)).size}` : ""}
            </span>
          )}
        </div>
        <DisagreementTab
          traceIds={disagreementTraceIds}
          traceTrees={traceTrees}
          projectName={projectName}
          onRefresh={onRefresh}
          isFallbackList={isFallbackList}
          t={t}
        />
      </div>
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span
        className={`tabular-nums ${
          active ? "text-background/65" : "text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Disagreement tab ─────────────────────────────────────────────────────────

function DisagreementTab({
  traceIds,
  traceTrees,
  projectName,
  onRefresh,
  isFallbackList,
  t,
}: {
  traceIds: Set<string>;
  traceTrees?: TraceTree[];
  projectName?: string;
  onRefresh?: () => void;
  isFallbackList: boolean;
  t: ReturnType<typeof useT>;
}) {
  const filteredTrees = useMemo(
    () => (traceTrees ?? []).filter((tr) => traceIds.has(tr.traceId)),
    [traceTrees, traceIds],
  );

  if (traceIds.size === 0)
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {t.humanReview.noComparable}
      </div>
    );

  // Sample mode (no traceTrees available) — graceful empty card.
  if (!traceTrees) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {t.humanReview.noComparable}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isFallbackList && (
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span aria-hidden className="mt-[2px]">·</span>
          <span>{t.humanReview.fallbackListNote}</span>
        </div>
      )}
      <SpanTreeView traces={filteredTrees} projectName={projectName} onRefresh={onRefresh} />
    </div>
  );
}

// ─── Confusion matrix tab (monochrome) ────────────────────────────────────────

function ConfusionTab({ counts, t }: { counts: ConfusionCounts; t: ReturnType<typeof useT> }) {
  const diffTotal = counts.aiPassHumanFail + counts.aiFailHumanPass;
  const agreeTotal = counts.aiPassHumanPass + counts.aiFailHumanFail;

  // Rows = Human (truth), Cols = AI (prediction)
  // [row][col]
  //   row 0 = Human Pass, row 1 = Human Fail
  //   col 0 = AI Pass,    col 1 = AI Fail
  const matrix: { value: number; isDiff: boolean }[][] = [
    [
      { value: counts.aiPassHumanPass, isDiff: false },
      { value: counts.aiFailHumanPass, isDiff: true },
    ],
    [
      { value: counts.aiPassHumanFail, isDiff: true },
      { value: counts.aiFailHumanFail, isDiff: false },
    ],
  ];

  const colHeaders = [t.humanReview.aiPass, t.humanReview.aiFail];
  const rowHeaders = [t.humanReview.humanPass, t.humanReview.humanFail];

  return (
    <div className="mx-auto" style={{ maxWidth: 460 }}>
      {/* Top: AI axis caption */}
      <div className="mb-1 ml-[88px]">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
          AI
        </p>
      </div>

      {/* Grid: [row-header-col | col-header-1 | col-header-2]
                 ─                             ─
                 row 1 label  | cell           | cell
                 row 2 label  | cell           | cell  */}
      <div className="grid grid-cols-[88px_1fr_1fr] gap-px">
        {/* Empty corner */}
        <div />
        {/* Column headers */}
        {colHeaders.map((h, i) => (
          <div key={`col-${i}`} className="pb-2 text-center text-xs font-medium">
            {h}
          </div>
        ))}

        {/* Body rows */}
        {matrix.map((row, rIdx) => (
          <Row key={rIdx} rowLabel={rowHeaders[rIdx]} cells={row} />
        ))}
      </div>

      {/* Bottom: Human axis caption */}
      <div className="mt-1 ml-[88px]">
        <p className="text-right text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">
          HUMAN
        </p>
      </div>

      {/* Legend */}
      <div className="mt-5 flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
          <span>{t.humanReview.confusionLegendAgree}</span>
          <span className="tabular-nums font-semibold text-foreground">{agreeTotal}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-foreground" />
          <span>{t.humanReview.confusionLegendDiff}</span>
          <span className="tabular-nums font-semibold text-foreground">{diffTotal}</span>
        </span>
      </div>
    </div>
  );
}

function Row({
  rowLabel,
  cells,
}: {
  rowLabel: string;
  cells: { value: number; isDiff: boolean }[];
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-3 text-xs font-medium text-right">
        {rowLabel}
      </div>
      {cells.map((c, i) => (
        <ConfusionCell key={i} value={c.value} isDiff={c.isDiff} />
      ))}
    </>
  );
}

function ConfusionCell({ value }: { value: number; isDiff: boolean }) {
  const isMuted = value === 0;
  return (
    <div className="aspect-square flex items-center justify-center rounded-md border bg-card">
      <span
        className={`text-5xl font-black tabular-nums tracking-tight ${
          isMuted ? "text-muted-foreground/30" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Scatter tab (monochrome) ─────────────────────────────────────────────────

function ScatterTab({
  pairs,
  slug,
  t,
}: {
  pairs: ComparablePair[];
  slug?: string;
  t: ReturnType<typeof useT>;
}) {
  const size = 360;
  const padL = 44;
  const padR = 20;
  const padT = 20;
  const padB = 36;
  const innerW = size - padL - padR;
  const innerH = size - padT - padB;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const diffPairs = pairs.filter((p) => p.isDiff);
  const matchPairs = pairs.filter((p) => !p.isDiff);

  function xOf(v: number) {
    return padL + innerW * Math.max(0, Math.min(1, v));
  }
  function yOf(v: number) {
    return padT + innerH - innerH * Math.max(0, Math.min(1, v));
  }

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="text-foreground"
      >
        {/* Gridlines */}
        {ticks.map((tk) => (
          <g key={`gx-${tk}`}>
            <line
              x1={xOf(tk)}
              y1={padT}
              x2={xOf(tk)}
              y2={padT + innerH}
              stroke="currentColor"
              strokeOpacity={tk === 0 ? 0.4 : 0.08}
            />
            <line
              x1={padL}
              y1={yOf(tk)}
              x2={padL + innerW}
              y2={yOf(tk)}
              stroke="currentColor"
              strokeOpacity={tk === 0 ? 0.4 : 0.08}
            />
          </g>
        ))}

        {/* Reference diagonal */}
        <line
          x1={xOf(0)}
          y1={yOf(0)}
          x2={xOf(1)}
          y2={yOf(1)}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeDasharray="3 4"
        />

        {/* Tick labels */}
        {ticks.map((tk) => (
          <g key={`lab-${tk}`}>
            <text
              x={xOf(tk)}
              y={padT + innerH + 14}
              textAnchor="middle"
              className="fill-current"
              fillOpacity={0.5}
              fontSize="10"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              {tk.toFixed(2)}
            </text>
            <text
              x={padL - 8}
              y={yOf(tk) + 3}
              textAnchor="end"
              className="fill-current"
              fillOpacity={0.5}
              fontSize="10"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              {tk.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Match dots (rendered first so diffs paint on top) */}
        {matchPairs.map((p) => {
          const href = slug ? `/${slug}/requests` : undefined;
          const dot = (
            <circle
              cx={xOf(p.ai.score)}
              cy={yOf(p.human.score)}
              r={3}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeWidth={1}
            >
              <title>{`${p.traceId} (AI=${p.ai.score.toFixed(2)}, Human=${p.human.score.toFixed(2)})`}</title>
            </circle>
          );
          return href ? (
            <a key={`${p.spanId}|${p.evalName}`} href={href}>
              {dot}
            </a>
          ) : (
            <g key={`${p.spanId}|${p.evalName}`}>{dot}</g>
          );
        })}

        {/* Diff dots — solid filled, larger */}
        {diffPairs.map((p) => {
          const href = slug ? `/${slug}/requests` : undefined;
          const dot = (
            <circle
              cx={xOf(p.ai.score)}
              cy={yOf(p.human.score)}
              r={4.5}
              fill="currentColor"
              fillOpacity={0.92}
            >
              <title>{`${p.traceId} (AI=${p.ai.score.toFixed(2)}, Human=${p.human.score.toFixed(2)})`}</title>
            </circle>
          );
          return href ? (
            <a key={`${p.spanId}|${p.evalName}`} href={href}>
              {dot}
            </a>
          ) : (
            <g key={`${p.spanId}|${p.evalName}`}>{dot}</g>
          );
        })}

        {/* Axis labels */}
        <text
          x={padL + innerW / 2}
          y={size - 8}
          textAnchor="middle"
          className="fill-current"
          fillOpacity={0.65}
          fontSize="10"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {t.humanReview.scatterXAxis}
        </text>
        <text
          x={12}
          y={padT + innerH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${padT + innerH / 2})`}
          className="fill-current"
          fillOpacity={0.65}
          fontSize="10"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {t.humanReview.scatterYAxis}
        </text>
      </svg>

      {/* Legend */}
      {pairs.length > 0 && (
        <div className="mt-4 flex items-center gap-5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-foreground" />
            <span>{t.humanReview.confusionLegendDiff}</span>
            <span className="tabular-nums font-semibold text-foreground">
              {diffPairs.length}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full border border-foreground/45 bg-transparent" />
            <span>{t.humanReview.confusionLegendAgree}</span>
            <span className="tabular-nums font-semibold text-foreground">
              {matchPairs.length}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
