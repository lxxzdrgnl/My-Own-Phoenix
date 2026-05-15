"use client";

import { useMemo, useState, useEffect } from "react";
import { LoadingState } from "@/components/ui/empty-state";

// ─── Types (matches JSONL from dexter eval results) ───

interface Detection {
  type: string;
  match: string;
  confidence: number;
}

interface RawEvalRow {
  id: string;
  category: string;
  input: string;
  expected_masked: string;
  actual_masked: string;
  detections: {
    stage1: Detection[];
    stage2: Detection[];
    combined: Detection[];
  };
  outcome: "TP" | "TN" | "FP" | "FN" | "PARTIAL";
  latency_ms: number;
  output_guard?: {
    blocked: boolean;
    expected_blocked: boolean;
    outcome: string;
    leaked_tokens: string[];
  };
}

// ─── Component ───

export function PiiGuardDashboard() {
  const [rows, setRows] = useState<RawEvalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/datasets/pii-eval-results.json")
      .then((r) => r.json())
      .then((data) => setRows(data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const metrics = useMemo(() => {
    const counts = { TP: 0, TN: 0, FP: 0, FN: 0, PARTIAL: 0 };
    for (const r of rows) counts[r.outcome]++;
    const tp = counts.TP + counts.PARTIAL;
    const precision = tp + counts.FP > 0 ? tp / (tp + counts.FP) : 0;
    const recall = tp + counts.FN > 0 ? tp / (tp + counts.FN) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const latencies = rows.map((r) => r.latency_ms).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
    const mean = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    return { counts, precision, recall, f1, p50, p95, mean };
  }, [rows]);

  const categoryBreakdown = useMemo(() => {
    const cats: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!cats[r.category]) cats[r.category] = { TP: 0, TN: 0, FP: 0, FN: 0, PARTIAL: 0 };
      cats[r.category][r.outcome]++;
    }
    return cats;
  }, [rows]);

  const piiTypeBreakdown = useMemo(() => {
    const types: Record<string, number> = {};
    for (const r of rows) {
      for (const d of r.detections.combined) {
        types[d.type] = (types[d.type] ?? 0) + 1;
      }
    }
    return types;
  }, [rows]);

  const outputGuardStats = useMemo(() => {
    const guards = rows.filter((r) => r.output_guard);
    const blocked = guards.filter((r) => r.output_guard?.blocked).length;
    return { total: guards.length, blocked, leaked: guards.length - blocked };
  }, [rows]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <KpiCard label="PRECISION" value={metrics.precision.toFixed(3)} goal="≥0.90" />
        <KpiCard label="RECALL" value={metrics.recall.toFixed(3)} goal="≥0.85" />
        <KpiCard label="F1 SCORE" value={metrics.f1.toFixed(3)} goal="≥0.87" />
        <KpiCard label="LATENCY P50" value={`${metrics.p50}ms`} />
        <KpiCard label="LATENCY P95" value={`${metrics.p95}ms`} />
        <KpiCard label="LATENCY MEAN" value={`${metrics.mean.toFixed(0)}ms`} />
        <KpiCard
          label="CONFUSION"
          value={`${metrics.counts.TP}/${metrics.counts.TN}`}
          sub={`FP:${metrics.counts.FP} FN:${metrics.counts.FN}`}
        />
      </div>

      {/* Charts */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Charts</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Outcome Distribution */}
          <ChartCard title="Outcome Distribution">
            <div className="flex items-center gap-3">
              {(["TP", "TN", "FP", "FN", "PARTIAL"] as const).map((key) => (
                <div key={key} className="text-center">
                  <div className={`text-2xl font-bold ${OUTCOME_COLORS[key]}`}>{metrics.counts[key]}</div>
                  <div className="text-[10px] text-muted-foreground">{key}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-4 overflow-hidden rounded-full">
              {(["TP", "TN", "FP", "FN", "PARTIAL"] as const).map((key) => {
                const pct = rows.length > 0 ? (metrics.counts[key] / rows.length) * 100 : 0;
                if (pct === 0) return null;
                return <div key={key} className={OUTCOME_BAR[key]} style={{ width: `${pct}%` }} title={`${key}: ${metrics.counts[key]}`} />;
              })}
            </div>
          </ChartCard>

          {/* Per-Category Outcome */}
          <ChartCard title="Per-Category Outcome">
            <div className="space-y-2">
              {Object.entries(categoryBreakdown).map(([cat, counts]) => {
                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{cat}</span>
                      <span className="text-muted-foreground">{total}</span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                      {(["TP", "TN", "FP", "FN", "PARTIAL"] as const).map((key) => {
                        const pct = total > 0 ? (counts[key] / total) * 100 : 0;
                        if (pct === 0) return null;
                        return <div key={key} className={OUTCOME_BAR[key]} style={{ width: `${pct}%` }} />;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          {/* PII Type Detection */}
          <ChartCard title="PII Type Detection">
            <div className="space-y-2">
              {Object.entries(piiTypeBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="w-20 text-xs font-medium uppercase">{type}</span>
                    <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3b82f6]"
                        style={{ width: `${(count / Math.max(...Object.values(piiTypeBreakdown), 1)) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs text-muted-foreground">{count}</span>
                  </div>
                ))}
              {Object.keys(piiTypeBreakdown).length === 0 && (
                <p className="text-xs text-muted-foreground">No PII detected</p>
              )}
            </div>
          </ChartCard>

          {/* Latency Histogram */}
          <ChartCard title="Latency Histogram">
            <LatencyHistogram rows={rows} />
          </ChartCard>

          {/* Output Guard Block Rate */}
          <ChartCard title="Output Guard Block Rate">
            <div className="flex flex-col items-center gap-2">
              <div className="text-3xl font-bold">{outputGuardStats.blocked}/{outputGuardStats.total}</div>
              <div className="text-xs text-muted-foreground">Cross-session attempts blocked</div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                {outputGuardStats.total > 0 && (
                  <>
                    <div className="h-full bg-emerald-500" style={{ width: `${(outputGuardStats.blocked / outputGuardStats.total) * 100}%` }} />
                    {outputGuardStats.leaked > 0 && (
                      <div className="h-full bg-red-500" style={{ width: `${(outputGuardStats.leaked / outputGuardStats.total) * 100}%` }} />
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-emerald-600">Blocked: {outputGuardStats.blocked}</span>
                <span className="text-red-600">Leaked: {outputGuardStats.leaked}</span>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Detail Table */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Detail</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">CATEGORY</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">OUTCOME</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">INPUT</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">DETECTIONS</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">LATENCY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.category}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${OUTCOME_BADGE[row.outcome]}`}>
                      {row.outcome}
                    </span>
                  </td>
                  <td className="max-w-[300px] truncate px-3 py-2 text-xs text-muted-foreground">{row.input}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.detections.combined.map((d, i) => (
                        <span key={i} className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">{d.type}</span>
                      ))}
                      {row.detections.combined.length === 0 && <span className="text-[10px] text-muted-foreground">-</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{row.latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function KpiCard({ label, value, goal, sub }: { label: string; value: string; goal?: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {goal && <div className="text-[10px] text-muted-foreground">goal: {goal}</div>}
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function LatencyHistogram({ rows }: { rows: RawEvalRow[] }) {
  const buckets = [
    { label: "0ms", min: 0, max: 1 },
    { label: "1-100ms", min: 1, max: 100 },
    { label: "100-500ms", min: 100, max: 500 },
    { label: "500ms-1s", min: 500, max: 1000 },
    { label: "1-2s", min: 1000, max: 2000 },
    { label: "2-3s", min: 2000, max: 3000 },
    { label: "3s+", min: 3000, max: Infinity },
  ];
  const counts = buckets.map((b) => rows.filter((r) => r.latency_ms >= b.min && r.latency_ms < b.max).length);
  const max = Math.max(...counts, 1);

  return (
    <div className="space-y-1">
      {buckets.map((b, i) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="w-16 text-right text-[10px] text-muted-foreground">{b.label}</span>
          <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
            <div className="h-full rounded bg-[#3b82f6]" style={{ width: `${(counts[i] / max) * 100}%` }} />
          </div>
          <span className="w-6 text-right text-[10px] text-muted-foreground">{counts[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Color maps ───

const OUTCOME_COLORS: Record<string, string> = {
  TP: "text-emerald-600", TN: "text-slate-500", FP: "text-red-600", FN: "text-amber-600", PARTIAL: "text-violet-600",
};
const OUTCOME_BAR: Record<string, string> = {
  TP: "bg-emerald-500", TN: "bg-slate-400", FP: "bg-red-500", FN: "bg-amber-500", PARTIAL: "bg-violet-500",
};
const OUTCOME_BADGE: Record<string, string> = {
  TP: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  TN: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  FP: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  FN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  PARTIAL: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};
