"use client";

import { useState, useEffect, useMemo } from "react";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Clock, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Detection {
  type: string;
  match: string;
  confidence: number;
}

interface PiiEvalRow {
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
    simulated_output: string;
    blocked: boolean;
    leaked_tokens: string[];
    expected_blocked: boolean;
    outcome: string;
  };
}

const OUTCOME_BADGE: Record<string, string> = {
  TP: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  TN: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  FP: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  FN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  PARTIAL: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

const CATEGORY_BADGE: Record<string, string> = {
  clean: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  direct: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  obfuscated: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  cross_session: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  prompt_injection: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const TYPE_BADGE: Record<string, string> = {
  rrn: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  bank_acct: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  phone_kr: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  credit_card: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  email: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  demographic: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
};

export function PiiGuardPastRuns() {
  const [rows, setRows] = useState<PiiEvalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");

  useEffect(() => {
    fetch("/datasets/pii-eval-results.json")
      .then((r) => r.json())
      .then((data) => {
        setRows(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (outcomeFilter !== "all" && r.outcome !== outcomeFilter) return false;
      if (search && !r.id.toLowerCase().includes(search.toLowerCase()) && !r.input.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, catFilter, outcomeFilter, search]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId), [rows, selectedId]);

  const metrics = useMemo(() => {
    const counts = { TP: 0, TN: 0, FP: 0, FN: 0, PARTIAL: 0 };
    for (const r of rows) counts[r.outcome]++;
    const tp = counts.TP + counts.PARTIAL;
    const precision = tp + counts.FP > 0 ? tp / (tp + counts.FP) : 0;
    const recall = tp + counts.FN > 0 ? tp / (tp + counts.FN) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { counts, precision, recall, f1 };
  }, [rows]);

  if (loading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState icon={Clock} title="No past runs" description="Run evaluations to see results" />;

  const categories = [...new Set(rows.map((r) => r.category))];

  return (
    <div className="flex h-full">
      {/* Left: list */}
      <div className="flex w-[480px] shrink-0 flex-col border-r">
        {/* Summary bar */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="text-xs">
            <span className="font-semibold">{rows.length}</span> rows
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="text-xs">
            P:<span className="font-semibold">{metrics.precision.toFixed(3)}</span>{" "}
            R:<span className="font-semibold">{metrics.recall.toFixed(3)}</span>{" "}
            F1:<span className="font-semibold">{metrics.f1.toFixed(3)}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex gap-1 text-[10px]">
            {(["TP", "TN", "FP", "FN"] as const).map((k) => (
              <span key={k} className={`rounded px-1 py-0.5 ${OUTCOME_BADGE[k]}`}>
                {k}:{metrics.counts[k]}
              </span>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID or input..."
              className="h-8 pl-7 text-xs"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="h-8 rounded border bg-background px-2 text-xs"
          >
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="h-8 rounded border bg-background px-2 text-xs"
          >
            <option value="all">All outcomes</option>
            {["TP", "TN", "FP", "FN", "PARTIAL"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((row) => (
            <button
              key={row.id}
              onClick={() => setSelectedId(row.id)}
              className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors ${
                selectedId === row.id ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <span className="w-10 shrink-0 font-mono text-xs font-medium">{row.id}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_BADGE[row.category] ?? "bg-muted text-muted-foreground"}`}>
                {row.category}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${OUTCOME_BADGE[row.outcome]}`}>
                {row.outcome}
              </span>
              <span className="flex-1 truncate text-xs text-muted-foreground">{row.input}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {selected ? (
          <RowDetail row={selected} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a row to view details</p>
        )}
      </div>
    </div>
  );
}

function RowDetail({ row }: { row: PiiEvalRow }) {
  const combined = row.detections.combined ?? [];
  const stage1 = row.detections.stage1 ?? [];
  const stage2 = row.detections.stage2 ?? [];

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{row.id}</h2>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[row.category] ?? "bg-muted"}`}>
          {row.category}
        </span>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${OUTCOME_BADGE[row.outcome]}`}>
          {row.outcome}
        </span>
        <span className="text-xs text-muted-foreground">{row.latency_ms}ms</span>
      </div>

      {/* Input */}
      <div className="rounded-lg border bg-card p-4 space-y-1.5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Input</h3>
        <p className="text-sm leading-relaxed">{row.input}</p>
      </div>

      {/* Expected vs Actual */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 space-y-1.5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Expected Masked</h3>
          <p className="text-sm font-mono leading-relaxed whitespace-pre-wrap">{row.expected_masked}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1.5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actual Masked</h3>
          <p className="text-sm font-mono leading-relaxed whitespace-pre-wrap">{row.actual_masked}</p>
        </div>
      </div>

      {/* Detections */}
      {combined.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Detections ({combined.length})
          </h3>
          <div className="space-y-1.5">
            {combined.map((d, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[d.type] ?? "bg-muted text-foreground"}`}>
                  {d.type}
                </span>
                <span className="font-mono text-sm flex-1">{d.match}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{d.confidence.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage breakdown */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stage Breakdown</h3>
        <div className="grid grid-cols-2 gap-3">
          <StageInfo label="Stage 1 (Regex)" count={stage1.length} detections={stage1} />
          <StageInfo label="Stage 2 (LLM)" count={stage2.length} detections={stage2} />
        </div>
      </div>

      {/* Output Guard */}
      {row.output_guard && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Output Guard</h3>
          <div className="flex items-center gap-3 text-sm">
            <span>Blocked: <strong>{row.output_guard.blocked ? "Yes" : "No"}</strong></span>
            <span>Expected: <strong>{row.output_guard.expected_blocked ? "Yes" : "No"}</strong></span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${OUTCOME_BADGE[row.output_guard.outcome] ?? "bg-muted"}`}>
              {row.output_guard.outcome}
            </span>
          </div>
          {row.output_guard.leaked_tokens.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Leaked tokens: {row.output_guard.leaked_tokens.join(", ")}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function StageInfo({ label, count, detections }: { label: string; count: number; detections: Detection[] }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{count} hits</span>
      </div>
      {detections.length === 0 ? (
        <p className="text-xs text-muted-foreground">No detections</p>
      ) : (
        detections.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${TYPE_BADGE[d.type] ?? "bg-muted"}`}>{d.type}</span>
            <span className="font-mono truncate">{d.match}</span>
          </div>
        ))
      )}
    </div>
  );
}
