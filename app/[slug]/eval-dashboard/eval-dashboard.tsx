"use client";

import { useState, useEffect, useMemo } from "react";
import { LoadingState } from "@/components/ui/empty-state";
import { PiiGuardDashboard } from "../pii-guard/pii-guard-dashboard";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { logger } from "@/lib/logger";

// ─── Types ───

interface EvalResult {
  score: number;
  label: string;
  explanation: string;
}

interface HallucinationRow {
  id: string;
  level: string;
  category: string;
  question: string;
  agentLatencySec: number;
  promptVariant: string;
  evaluations: {
    factualAccuracy: EvalResult | null;
    groundedness: EvalResult | null;
    toolCorrectness: EvalResult | null;
    refusal: EvalResult | null;
    planQuality: EvalResult | null;
  };
}

type DashboardTab = "hallucination" | "pii-guard";

const EVAL_NAMES = ["factualAccuracy", "groundedness", "toolCorrectness", "refusal", "planQuality"] as const;
const EVAL_SHORT: Record<string, string> = {
  factualAccuracy: "FACTUAL",
  groundedness: "GROUNDED",
  toolCorrectness: "TOOL",
  refusal: "REFUSAL",
  planQuality: "PLAN",
};

const EVAL_COLORS: Record<string, string> = {
  factualAccuracy: "#3b82f6",
  groundedness: "#1d4ed8",
  toolCorrectness: "#22c55e",
  refusal: "#f97316",
  planQuality: "#8b5cf6",
};

const LEVEL_ORDER = ["easy", "medium", "hard", "trap"];
const LEVEL_BADGE: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  hard: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  trap: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

// ─── Component ───

export function EvalDashboard() {
  const [tab, setTab] = useState<DashboardTab>("hallucination");
  const [rows, setRows] = useState<HallucinationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/datasets/hallucination-eval-results.json")
      .then((r) => r.json())
      .then((data) => setRows(data))
      .catch((e) => logger.error("eval dashboard load failed", e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {/* Title */}
        <Stack gap="xs">
          <Heading level="page">Evaluation Dashboard</Heading>
          <Text variant="caption">Phoenix traces and JSONL-based aggregated view</Text>
        </Stack>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg border bg-muted/50 p-1 w-fit">
          <button
            onClick={() => setTab("hallucination")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "hallucination" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Hallucination
          </button>
          <button
            onClick={() => setTab("pii-guard")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "pii-guard" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            PII Guard
          </button>
        </div>

        {tab === "pii-guard" ? (
          <PiiGuardDashboard />
        ) : loading ? (
          <LoadingState />
        ) : (
          <HallucinationDashboard rows={rows} />
        )}
      </div>
    </div>
  );
}

// ─── Hallucination Dashboard ───

function HallucinationDashboard({ rows }: { rows: HallucinationRow[] }) {
  const metrics = useMemo(() => computeMetrics(rows), [rows]);
  const perLevel = useMemo(() => computePerLevel(rows), [rows]);
  const trapStats = useMemo(() => computeTrapStats(rows), [rows]);

  // Filters
  const [levelFilter, setLevelFilter] = useState("all");
  const [evalFilter, setEvalFilter] = useState("all");
  const [failOnly, setFailOnly] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (levelFilter !== "all" && r.level !== levelFilter) return false;
      if (failOnly) {
        const hasFailure = EVAL_NAMES.some((name) => {
          const ev = r.evaluations[name];
          return ev && ev.score < 1.0;
        });
        if (!hasFailure) return false;
      }
      return true;
    });
  }, [rows, levelFilter, failOnly]);

  const source = rows.length > 0 ? rows[0].promptVariant : "baseline";

  return (
    <>
      {/* Sub-header */}
      <Stack gap="xs">
        <Heading level="section">Hallucination Eval</Heading>
        <Text variant="caption">
          {rows.length} rows · variants: {source} · source: hallucination-eval-results.jsonl
        </Text>
      </Stack>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="FACTUAL" value={metrics.factual.toFixed(3)} color="#3b82f6" />
        <KpiCard label="GROUNDED" value={metrics.grounded.toFixed(3)} color="#1d4ed8" />
        <KpiCard label="TOOL" value={metrics.tool.toFixed(3)} color="#22c55e" />
        <KpiCard label="REFUSAL" value={metrics.refusal.toFixed(3)} color="#f97316" />
        <KpiCard label="PLAN" value={metrics.plan.toFixed(3)} color="#8b5cf6" />
        <KpiCard label="TRAP REFUSAL" value={`${trapStats.perfect}/${trapStats.total}`} color="#ef4444" />
        <KpiCard label="LATENCY P50" value={`${metrics.p50.toFixed(1)}s`} />
        <KpiCard label="LATENCY P95" value={`${metrics.p95.toFixed(1)}s`} />
      </div>

      {/* Charts */}
      <SectionCard title="Charts">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Evaluator Means bar chart */}
          <ChartCard title="Evaluator Means" subtitle="5-evaluator mean scores">
            <BarChart
              items={EVAL_NAMES.map((name) => ({
                label: EVAL_SHORT[name],
                value: metrics[name as keyof typeof metrics] as number,
                color: EVAL_COLORS[name],
              }))}
              maxValue={1}
            />
          </ChartCard>

          {/* Per-Level × Evaluator */}
          <ChartCard title="Per-Level × Evaluator" subtitle="Level-wise evaluator means">
            <GroupedBarChart levels={perLevel} />
          </ChartCard>

          {/* Trap Refusal Distribution */}
          <ChartCard title="Trap Refusal Distribution" subtitle={`trap ${trapStats.total} rows · mean ${trapStats.mean.toFixed(2)}`}>
            <DonutChart items={[
              { label: `Perfect (${trapStats.perfect})`, value: trapStats.perfect, color: "#22c55e" },
              { label: `Partial (${trapStats.partial})`, value: trapStats.partial, color: "#8b5cf6" },
              { label: `Fail (${trapStats.fail})`, value: trapStats.fail, color: "#ef4444" },
            ]} />
          </ChartCard>

          {/* Agent Latency Histogram */}
          <ChartCard title="Agent Latency Histogram" subtitle="Query execution time distribution">
            <LatencyHistogram rows={rows} />
          </ChartCard>

          {/* Level Distribution */}
          <ChartCard title="Level Distribution" subtitle="easy / medium / hard / trap">
            <BarChart
              items={LEVEL_ORDER.map((level) => ({
                label: level,
                value: rows.filter((r) => r.level === level).length,
                color: level === "easy" ? "#22c55e" : level === "medium" ? "#3b82f6" : level === "hard" ? "#f97316" : "#ef4444",
              }))}
              maxValue={Math.max(...LEVEL_ORDER.map((l) => rows.filter((r) => r.level === l).length), 1)}
              showValue
            />
          </ChartCard>
        </div>
      </SectionCard>

      {/* Detail Table */}
      <SectionCard
        title="Detail"
        actions={
          <Inline gap="sm" className="flex-wrap">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">All levels</option>
              {LEVEL_ORDER.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select
              value={evalFilter}
              onChange={(e) => setEvalFilter(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">Any evaluator (no filter)</option>
              {EVAL_NAMES.map((n) => <option key={n} value={n}>{EVAL_SHORT[n]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={failOnly} onChange={(e) => setFailOnly(e.target.checked)} className="rounded" />
              Failures only (any &lt; 1.0)
            </label>
            <Text variant="caption" as="span">{filtered.length} / {rows.length}</Text>
          </Inline>
        }
      >

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-16">ID</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-20">LEVEL</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">QUESTION</th>
                {EVAL_NAMES.map((name) => (
                  <th key={name} className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground w-24">
                    {EVAL_SHORT[name]}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground w-20">LATENCY</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium">{row.id}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[row.level] ?? "bg-muted"}`}>
                      {row.level}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-sm">{row.question}</div>
                    <div className="text-[11px] text-muted-foreground">{row.category}</div>
                  </td>
                  {EVAL_NAMES.map((name) => {
                    const ev = row.evaluations[name];
                    if (!ev) return <td key={name} className="px-3 py-2.5 text-right text-sm text-muted-foreground">—</td>;
                    const isLow = ev.score < 1.0;
                    return (
                      <td
                        key={name}
                        className={`px-3 py-2.5 text-right text-sm tabular-nums${isLow ? " font-medium" : ""}`}
                        style={isLow ? { color: "#ef4444" } : undefined}
                      >
                        {ev.score.toFixed(2)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                    {row.agentLatencySec.toFixed(1)}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

// ─── Metrics computation ───

function computeMetrics(rows: HallucinationRow[]) {
  const avg = (name: keyof HallucinationRow["evaluations"]) => {
    const vals = rows.map((r) => r.evaluations[name]?.score).filter((s): s is number => s !== null && s !== undefined);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const latencies = rows.map((r) => r.agentLatencySec).sort((a, b) => a - b);
  return {
    factual: avg("factualAccuracy"),
    grounded: avg("groundedness"),
    tool: avg("toolCorrectness"),
    refusal: avg("refusal"),
    plan: avg("planQuality"),
    p50: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
    p95: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
    mean: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
  };
}

function computePerLevel(rows: HallucinationRow[]) {
  const result: Record<string, Record<string, number>> = {};
  for (const level of LEVEL_ORDER) {
    const levelRows = rows.filter((r) => r.level === level);
    if (levelRows.length === 0) continue;
    result[level] = {};
    for (const name of EVAL_NAMES) {
      const vals = levelRows.map((r) => r.evaluations[name]?.score).filter((s): s is number => s != null);
      result[level][EVAL_SHORT[name]] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }
  return result;
}

function computeTrapStats(rows: HallucinationRow[]) {
  const traps = rows.filter((r) => r.level === "trap");
  const refusalScores = traps.map((r) => r.evaluations.refusal?.score ?? 0);
  return {
    total: traps.length,
    perfect: refusalScores.filter((s) => s >= 1.0).length,
    partial: refusalScores.filter((s) => s > 0 && s < 1.0).length,
    fail: refusalScores.filter((s) => s === 0).length,
    mean: refusalScores.length > 0 ? refusalScores.reduce((a, b) => a + b, 0) / refusalScores.length : 0,
  };
}

// ─── Chart sub-components ───

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <Heading level="sub">{label}</Heading>
      <div className="mt-1 text-2xl font-bold" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function BarChart({ items, maxValue, showValue }: { items: { label: string; value: number; color: string }[]; maxValue: number; showValue?: boolean }) {
  return (
    <div className="flex items-end gap-3 h-40">
      {items.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="relative w-full flex flex-col justify-end" style={{ height: "120px" }}>
            <div
              className="w-full rounded-t"
              style={{
                height: `${(item.value / maxValue) * 100}%`,
                backgroundColor: item.color,
                minHeight: item.value > 0 ? "4px" : "0",
              }}
            />
          </div>
          {showValue && <span className="text-[10px] text-muted-foreground">{item.value}</span>}
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function GroupedBarChart({ levels }: { levels: Record<string, Record<string, number>> }) {
  const evalKeys = Object.values(EVAL_SHORT);
  return (
    <div className="space-y-1">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-2">
        {EVAL_NAMES.map((name) => (
          <div key={name} className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EVAL_COLORS[name] }} />
            <span className="text-[10px]">{EVAL_SHORT[name]}</span>
          </div>
        ))}
      </div>
      {/* Grouped bars per level */}
      <div className="flex items-end gap-4 h-40">
        {Object.entries(levels).map(([level, scores]) => (
          <div key={level} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: "120px" }}>
              {EVAL_NAMES.map((name) => {
                const val = scores[EVAL_SHORT[name]] ?? 0;
                return (
                  <div
                    key={name}
                    className="flex-1 rounded-t max-w-3"
                    style={{
                      height: `${val * 100}%`,
                      backgroundColor: EVAL_COLORS[name],
                      minHeight: val > 0 ? "2px" : "0",
                    }}
                  />
                );
              })}
            </div>
            <span className="text-[10px] text-muted-foreground">{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No data</p>;

  // CSS conic-gradient donut
  let cumulative = 0;
  const segments = items.map((item) => {
    const start = cumulative;
    cumulative += (item.value / total) * 360;
    return { ...item, start, end: cumulative };
  });

  const gradient = segments.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(", ");

  return (
    <div className="flex items-center gap-4">
      <div
        className="h-32 w-32 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${gradient})`,
          mask: "radial-gradient(circle at center, transparent 40%, black 41%)",
          WebkitMask: "radial-gradient(circle at center, transparent 40%, black 41%)",
        }}
      />
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-xs">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LatencyHistogram({ rows }: { rows: HallucinationRow[] }) {
  const buckets = [
    { label: "<5s", min: 0, max: 5 },
    { label: "5-10s", min: 5, max: 10 },
    { label: "10-20s", min: 10, max: 20 },
    { label: "20-40s", min: 20, max: 40 },
    { label: "40-60s", min: 40, max: 60 },
    { label: "60s+", min: 60, max: Infinity },
  ];
  const counts = buckets.map((b) => rows.filter((r) => r.agentLatencySec >= b.min && r.agentLatencySec < b.max).length);
  const max = Math.max(...counts, 1);

  const colors = ["#3b82f6", "#22c55e", "#f97316", "#ef4444", "#ef4444", "#8b5cf6"];

  return (
    <div className="flex items-end gap-2 h-32">
      {buckets.map((b, i) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="relative w-full flex flex-col justify-end" style={{ height: "100px" }}>
            <div
              className="w-full rounded-t"
              style={{
                height: `${(counts[i] / max) * 100}%`,
                backgroundColor: colors[i],
                minHeight: counts[i] > 0 ? "4px" : "0",
              }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
