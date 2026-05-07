"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PASS_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/date-utils";
import { Trash2, ChevronRight, FlaskConical, Filter, X, Pencil, Check as CheckIcon } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface RunMeta {
  id: string; agentSource: string; evalNames: string; status: string; createdAt: string;
}
interface RowResult {
  rowIdx: number; response: string; query?: string;
  evals: Record<string, { label: string; score: number; explanation: string }>;
}

type EvalFilter = { type: "label"; value: "pass" | "fail" } | { type: "score"; op: "gte" | "lte"; value: number };

interface DatasetResultsProps {
  runs: RunMeta[];
  liveRunId: string | null;
  liveResults: RowResult[];
  selectedRunId: string | null;
  displayResults: RowResult[];
  displayEvalNames: string[];
  hasResults: boolean;
  hasResponses: boolean;
  onLoadRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  onRenameRun?: (runId: string, newName: string) => void;
  onBackToPrompts: () => void;
}

// ── Per-eval stats ──
interface EvalStat {
  name: string;
  total: number;
  pass: number;
  fail: number;
  errors: number;
  avgScore: number;
}

function computeEvalStats(results: RowResult[], evalNames: string[]): EvalStat[] {
  return evalNames.map((name) => {
    const entries = results.map((r) => r.evals?.[name]).filter(Boolean);
    const valid = entries.filter((e) => e.label !== "error");
    const errors = entries.filter((e) => e.label === "error").length;
    const pass = valid.filter((e) => PASS_LABELS.has(e.label.toLowerCase())).length;
    const fail = valid.length - pass;
    const avgScore = valid.length > 0 ? valid.reduce((s, e) => s + e.score, 0) / valid.length : 0;
    return { name, total: valid.length, pass, fail, errors, avgScore };
  });
}

export function DatasetResults({
  runs,
  liveRunId,
  liveResults,
  selectedRunId,
  displayResults,
  displayEvalNames,
  hasResults,
  hasResponses,
  onLoadRun,
  onDeleteRun,
  onBackToPrompts,
}: DatasetResultsProps) {
  const [expandedResultIdx, setExpandedResultIdx] = useState<number | null>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [evalFilters, setEvalFilters] = useState<Record<string, EvalFilter>>({});

  // Run rename state
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editingRunName, setEditingRunName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingRunId && renameInputRef.current) renameInputRef.current.focus();
  }, [editingRunId]);

  // Only show eval columns that have at least one result
  const activeEvalNames = displayEvalNames.filter((name) =>
    displayResults.some((r) => r.evals?.[name] && r.evals[name].label !== undefined)
  );

  // Apply filters
  const filteredResults = displayResults.filter((r) => {
    for (const [evalName, filter] of Object.entries(evalFilters)) {
      const ev = r.evals?.[evalName];
      if (!ev || ev.label === "error") return false;
      if (filter.type === "label") {
        const isPass = PASS_LABELS.has(ev.label.toLowerCase());
        if (filter.value === "pass" && !isPass) return false;
        if (filter.value === "fail" && isPass) return false;
      } else {
        if (filter.op === "gte" && ev.score < filter.value) return false;
        if (filter.op === "lte" && ev.score > filter.value) return false;
      }
    }
    return true;
  });

  const evalStats = computeEvalStats(displayResults, activeEvalNames);
  const activeFilterCount = Object.keys(evalFilters).length;

  return (
    <div className="flex h-full">
      {/* Run list sidebar */}
      {runs.length > 0 && (
        <div className="w-52 shrink-0 border-r overflow-y-auto">
          <p className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b">Runs</p>
          {liveRunId && (
            <div
              onClick={() => onLoadRun("")}
              className={cn(
                "group flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 transition-colors hover:bg-accent",
                !selectedRunId && "bg-accent"
              )}
            >
              <div className="size-1.5 shrink-0 rounded-full bg-foreground/40 animate-pulse" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">Live run</p>
                <p className="text-[10px] text-muted-foreground">{liveResults.length} responses</p>
              </div>
            </div>
          )}
          {runs.map((r) => {
            const displayName = r.agentSource.replace("llm:", "").replace(/^agent:.*/, "Dexter Agent");
            const isEditing = editingRunId === r.id;

            const handleSaveRename = async () => {
              const newName = editingRunName.trim();
              if (newName && newName !== r.agentSource) {
                try {
                  await apiFetch(`/api/datasets/runs/${r.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ agentSource: newName }),
                  });
                  r.agentSource = newName;
                } catch {}
              }
              setEditingRunId(null);
            };

            return (
            <div
              key={r.id}
              onClick={() => !isEditing && onLoadRun(r.id)}
              className={cn(
                "group flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 transition-colors hover:bg-accent last:border-b-0",
                selectedRunId === r.id && !liveRunId && "bg-accent"
              )}
            >
              <div className={cn(
                "size-1.5 shrink-0 rounded-full",
                r.status === "completed" ? "bg-[#3b82f6]" : r.status === "running" ? "bg-foreground/40 animate-pulse" : "bg-muted-foreground/20"
              )} />
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <input
                    ref={renameInputRef}
                    className="w-full rounded border bg-background px-1.5 py-0.5 text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
                    value={editingRunName}
                    onChange={(e) => setEditingRunName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveRename(); if (e.key === "Escape") setEditingRunId(null); }}
                    onBlur={handleSaveRename}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p className="truncate text-xs font-medium">{displayName}</p>
                )}
                <p className="text-[10px] text-muted-foreground">{formatDateTime(r.createdAt)}</p>
              </div>
              {isEditing ? (
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveRename(); }}
                  className="shrink-0 rounded p-1 hover:text-green-500"
                >
                  <CheckIcon className="size-3 text-muted-foreground" />
                </button>
              ) : (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingRunId(r.id); setEditingRunName(displayName); }}
                    className="shrink-0 rounded p-1 opacity-0 hover:text-foreground group-hover:opacity-100"
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteRun(r.id); }}
                    className="shrink-0 rounded p-1 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3 text-muted-foreground" />
                  </button>
                </>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Results content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!hasResults ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <EmptyState icon={FlaskConical} title="No results yet" description="Generate responses first, then optionally run evaluations." className="h-auto" />
            <button
              onClick={onBackToPrompts}
              className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="size-3" /> Back to prompts
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            {displayResults.length > 0 && (() => {
              const latencies = displayResults
                .map(r => (r as any).capture?.latencyMs ?? (r as any).latencyMs)
                .filter((v: any) => typeof v === "number" && v > 0) as number[];
              const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000 : null;
              const p95Latency = latencies.length > 0 ? (() => { const s = [...latencies].sort((a,b) => a-b); return s[Math.floor(s.length * 0.95)] / 1000; })() : null;

              return latencies.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rows</p>
                    <p className="text-2xl font-bold tabular-nums">{displayResults.length}</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Avg Latency</p>
                    <p className="text-2xl font-bold tabular-nums">{avgLatency!.toFixed(1)}s</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">p95 Latency</p>
                    <p className="text-2xl font-bold tabular-nums">{p95Latency!.toFixed(1)}s</p>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Per-eval stats */}
            {evalStats.length > 0 && (
              <div className="rounded-lg border divide-y">
                {evalStats.map((stat) => {
                  const passRate = stat.total > 0 ? (stat.pass / stat.total) * 100 : 0;
                  return (
                    <div key={stat.name} className="flex items-center gap-3 px-4 py-2.5">
                      <p className="w-32 shrink-0 truncate text-xs font-medium">{stat.name}</p>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ backgroundColor: "#3b82f6", width: `${passRate}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs font-bold tabular-nums">{passRate.toFixed(0)}%</span>
                      <span className="w-16 text-right text-[10px] text-muted-foreground tabular-nums">
                        {stat.pass}/{stat.total}
                      </span>
                      {stat.errors > 0 && (
                        <span className="text-[9px] text-destructive font-medium">{stat.errors} err</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Filter status */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{filteredResults.length}/{displayResults.length} rows</span>
                {Object.entries(evalFilters).map(([name, f]) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium">
                    {name}: {f.type === "label" ? f.value : `${f.op === "gte" ? "≥" : "≤"} ${f.value}`}
                    <button onClick={() => setEvalFilters((prev) => { const next = { ...prev }; delete next[name]; return next; })}>
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setEvalFilters({})}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Results table */}
            <div className="rounded-lg border">
              <div className="max-h-[calc(100vh-320px)] overflow-auto">
                <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
                  <thead className="sticky top-0 z-10 border-b bg-background">
                    <tr>
                      <th className="w-10 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                      <th className="w-[220px] min-w-[220px] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Query</th>
                      {hasResponses && <th className="w-[400px] min-w-[400px] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Response</th>}
                      {activeEvalNames.map((en) => {
                        const hasFilter = !!evalFilters[en];
                        const isOpen = openFilter === en;
                        return (
                          <FilterTh
                            key={en}
                            evalName={en}
                            hasFilter={hasFilter}
                            isOpen={isOpen}
                            current={evalFilters[en]}
                            onToggle={() => setOpenFilter(isOpen ? null : en)}
                            onApply={(f) => { setEvalFilters((prev) => ({ ...prev, [en]: f })); setOpenFilter(null); }}
                            onClear={() => { setEvalFilters((prev) => { const next = { ...prev }; delete next[en]; return next; }); setOpenFilter(null); }}
                            onClose={() => setOpenFilter(null)}
                          />
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredResults.map((result, i) => {
                      const query = result.query ?? "";
                      const isExpanded = expandedResultIdx === i;
                      const colSpan = 2 + (hasResponses ? 1 : 0) + activeEvalNames.length;
                      return (
                        <React.Fragment key={i}>
                          <tr
                            className={cn("cursor-pointer transition-colors", isExpanded ? "bg-accent/30" : "hover:bg-muted/20")}
                            onClick={() => setExpandedResultIdx(isExpanded ? null : i)}
                          >
                            <td className="px-3 py-3 tabular-nums text-muted-foreground">{result.rowIdx + 1}</td>
                            <td className="w-[220px] min-w-[220px] max-w-[220px] px-3 py-3">
                              <p className="truncate text-muted-foreground">{query}</p>
                            </td>
                            {hasResponses && (
                              <td className="w-[400px] min-w-[400px] max-w-[400px] px-3 py-3">
                                <p className="truncate">{result.response ?? ""}</p>
                              </td>
                            )}
                            {activeEvalNames.map((en) => {
                              const ev = result.evals?.[en];
                              if (!ev) return <td key={en} className="px-3 py-3 text-center text-muted-foreground/30">—</td>;
                              const isError = ev.label === "error";
                              const isPass = !isError && PASS_LABELS.has(ev.label.toLowerCase());
                              return (
                                <td key={en} className="px-3 py-3 text-center">
                                  <span className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-medium">
                                    <span className={cn(
                                      "size-1.5 rounded-full",
                                      isError ? "bg-destructive" : isPass ? "bg-[#3b82f6]" : "bg-muted-foreground/40"
                                    )} />
                                    {ev.label}
                                  </span>
                                  {!isError && ev.score !== undefined && (
                                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">{ev.score.toFixed(2)}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/10">
                              <td colSpan={colSpan} className="px-4 py-4" style={{ minWidth: 0, maxWidth: 0 }}>
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Query</p>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{query}</p>
                                  </div>
                                  {result.response && (
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Response</p>
                                      <p className="text-sm leading-relaxed whitespace-pre-wrap rounded border bg-background p-3">{result.response}</p>
                                    </div>
                                  )}
                                  {Object.keys(result.evals).length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Evaluations</p>
                                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                        {Object.entries(result.evals).map(([name, ev]) => {
                                          const isError = ev.label === "error";
                                          const isPass = !isError && PASS_LABELS.has(ev.label.toLowerCase());
                                          return (
                                            <div key={name} className="rounded border p-2 text-xs min-w-[140px]">
                                              <p className="font-medium mb-0.5">{name}</p>
                                              <div className="flex items-center gap-1.5">
                                                <span className={cn("size-1.5 rounded-full", isError ? "bg-destructive" : isPass ? "bg-[#3b82f6]" : "bg-muted-foreground/40")} />
                                                <span>{ev.label}</span>
                                                {!isError && ev.score !== undefined && <span className="font-mono text-muted-foreground">{ev.score.toFixed(2)}</span>}
                                              </div>
                                              {ev.explanation && <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">{ev.explanation}</p>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter Header Cell + Dropdown (fixed position) ──

function FilterTh({
  evalName, hasFilter, isOpen, current,
  onToggle, onApply, onClear, onClose,
}: {
  evalName: string; hasFilter: boolean; isOpen: boolean; current?: EvalFilter;
  onToggle: () => void; onApply: (f: EvalFilter) => void; onClear: () => void; onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 192) });
    }
  }, [isOpen]);

  return (
    <th className="w-[140px] min-w-[140px] whitespace-nowrap px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <button
        ref={btnRef}
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-foreground/5",
          hasFilter && "bg-foreground/10",
        )}
      >
        {evalName}
        <Filter className={cn("size-2.5", hasFilter ? "text-foreground" : "text-muted-foreground/30")} />
      </button>
      {isOpen && (
        <EvalFilterDropdown
          current={current}
          pos={pos}
          onApply={onApply}
          onClear={onClear}
          onClose={onClose}
        />
      )}
    </th>
  );
}

function EvalFilterDropdown({
  current, pos, onApply, onClear, onClose,
}: {
  current?: EvalFilter;
  pos: { top: number; left: number };
  onApply: (f: EvalFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [scoreOp, setScoreOp] = useState<"gte" | "lte">(current?.type === "score" ? current.op : "gte");
  const [scoreVal, setScoreVal] = useState(current?.type === "score" ? String(current.value) : "0.5");

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-48 rounded-lg border bg-background p-2 shadow-lg text-left"
        style={{ top: pos.top, left: pos.left }}
      >
        <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Label</p>
        <button
          onClick={onClear}
          className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent", !current && "bg-accent font-medium")}
        >
          All
        </button>
        <button
          onClick={() => onApply({ type: "label", value: "pass" })}
          className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent", current?.type === "label" && current.value === "pass" && "bg-accent font-medium")}
        >
          <span className="size-1.5 rounded-full bg-[#3b82f6]" /> Pass only
        </button>
        <button
          onClick={() => onApply({ type: "label", value: "fail" })}
          className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent", current?.type === "label" && current.value === "fail" && "bg-accent font-medium")}
        >
          <span className="size-1.5 rounded-full bg-muted-foreground/40" /> Fail only
        </button>

        <div className="my-1.5 h-px bg-border" />

        <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Score</p>
        <div className="flex items-center gap-1.5 px-2 py-1">
          <select
            value={scoreOp}
            onChange={(e) => setScoreOp(e.target.value as "gte" | "lte")}
            className="h-7 rounded border bg-background px-1.5 text-xs"
          >
            <option value="gte">&ge;</option>
            <option value="lte">&le;</option>
          </select>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={scoreVal}
            onChange={(e) => setScoreVal(e.target.value)}
            className="h-7 w-16 rounded border bg-background px-2 text-xs tabular-nums text-center"
          />
          <button
            onClick={() => onApply({ type: "score", op: scoreOp, value: parseFloat(scoreVal) || 0 })}
            className="h-7 rounded bg-foreground px-2.5 text-[10px] font-medium text-background"
          >
            Apply
          </button>
        </div>

        {current && (
          <>
            <div className="my-1.5 h-px bg-border" />
            <button
              onClick={onClear}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" /> Clear filter
            </button>
          </>
        )}
      </div>
    </>
  );
}
