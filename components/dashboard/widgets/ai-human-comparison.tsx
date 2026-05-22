// components/dashboard/widgets/ai-human-comparison.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const allPairs = useMemo(() => pairsFromTraces(traces), [traces]);

  const evalNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPairs) set.add(p.evalName);
    return Array.from(set).sort();
  }, [allPairs]);

  // Initialize default eval selection
  useEffect(() => {
    if (selectedEval === "" && evalNames.length > 0) {
      setSelectedEval(evalNames[0]);
    }
    if (selectedEval !== "" && !evalNames.includes(selectedEval)) {
      setSelectedEval(evalNames[0] ?? "");
    }
  }, [evalNames, selectedEval]);

  const filtered = useMemo(
    () => (selectedEval ? allPairs.filter((p) => p.evalName === selectedEval) : allPairs),
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
          <div>
            <p className="text-xs text-muted-foreground">
              {t.humanReview.countSummary
                .replace("{covered}", String(tracesWithHuman))
                .replace("{total}", String(total))
                .replace("{pct}", String(coveragePct))}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.humanReview.diffSummary
                .replace("{diff}", String(diffCount))
                .replace("{compared}", String(compared))
                .replace("{pct}", String(pct))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t.humanReview.annotationFilter}:</span>
            <select
              value={selectedEval}
              onChange={(e) => setSelectedEval(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {evalNames.length === 0 && <option value="">—</option>}
              {evalNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Tabs */}
        <div className="mt-3 flex gap-1 border-b -mb-3">
          {(
            [
              ["disagreement", t.humanReview.tabDisagreement],
              ["confusion", t.humanReview.tabConfusion],
              ["scatter", t.humanReview.tabScatter],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                tab === k
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
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
  pairs,
  checked,
  setChecked,
  slug,
  t,
}: {
  pairs: ComparablePair[];
  checked: Record<string, boolean>;
  setChecked: (v: Record<string, boolean>) => void;
  slug?: string;
  t: ReturnType<typeof useT>;
}) {
  if (pairs.length === 0)
    return <p className="text-sm text-muted-foreground py-8 text-center">—</p>;
  return (
    <div className="space-y-1.5">
      {pairs.map((p) => {
        const key = `${p.spanId}|${p.evalName}`;
        const reasonLabel =
          p.diffReason === "label" ? t.humanReview.diffReasonLabel : t.humanReview.diffReasonScore;
        const href = slug ? `/${slug}/requests` : "#";
        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
          >
            <input
              type="checkbox"
              checked={!!checked[key]}
              onChange={(e) => setChecked({ ...checked, [key]: e.target.checked })}
              className="size-3.5"
            />
            <a
              href={href}
              className="font-mono text-[11px] truncate flex-1 hover:underline"
              title={p.traceId}
            >
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
    {
      key: "pp",
      label: `${t.humanReview.aiPass} / ${t.humanReview.humanPass}`,
      value: counts.aiPassHumanPass,
      cls: "bg-emerald-500/20",
    },
    {
      key: "pf",
      label: `${t.humanReview.aiPass} / ${t.humanReview.humanFail}`,
      value: counts.aiPassHumanFail,
      cls: "bg-yellow-500/20",
    },
    {
      key: "fp",
      label: `${t.humanReview.aiFail} / ${t.humanReview.humanPass}`,
      value: counts.aiFailHumanPass,
      cls: "bg-yellow-500/20",
    },
    {
      key: "ff",
      label: `${t.humanReview.aiFail} / ${t.humanReview.humanFail}`,
      value: counts.aiFailHumanFail,
      cls: "bg-red-500/20",
    },
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
  const size = 280;
  const pad = 24;
  return (
    <div className="flex justify-center">
      <svg width={size} height={size} className="border rounded">
        <line
          x1={pad}
          y1={size - pad}
          x2={size - pad}
          y2={size - pad}
          stroke="currentColor"
          strokeOpacity="0.3"
        />
        <line x1={pad} y1={pad} x2={pad} y2={size - pad} stroke="currentColor" strokeOpacity="0.3" />
        <line
          x1={pad}
          y1={size - pad}
          x2={size - pad}
          y2={pad}
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeDasharray="2 4"
        />
        {pairs.map((p) => {
          const x = pad + (size - 2 * pad) * Math.max(0, Math.min(1, p.ai.score));
          const y = size - pad - (size - 2 * pad) * Math.max(0, Math.min(1, p.human.score));
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
          return href ? (
            <a key={`${p.spanId}|${p.evalName}`} href={href}>
              {dot}
            </a>
          ) : (
            <g key={`${p.spanId}|${p.evalName}`}>{dot}</g>
          );
        })}
        <text
          x={size / 2}
          y={size - 4}
          textAnchor="middle"
          className="fill-current"
          fontSize="10"
        >
          AI score →
        </text>
        <text
          x={4}
          y={size / 2}
          textAnchor="middle"
          transform={`rotate(-90 8 ${size / 2})`}
          className="fill-current"
          fontSize="10"
        >
          Human score →
        </text>
      </svg>
    </div>
  );
}
