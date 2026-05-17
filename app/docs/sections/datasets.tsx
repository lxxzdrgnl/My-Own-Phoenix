"use client";

import { useState, useCallback } from "react";
import { Pencil, Download, Upload, Play, Plus, FileSpreadsheet, RefreshCw } from "lucide-react";
import { Callout } from "../code-block";
import { useT } from "@/lib/i18n";

/* ── Mock data ── */
const MOCK_DATASETS = [
  { name: "hallucination-50q", count: "50 prompts" },
  { name: "finqa-hallucination-detect...", count: "1,657 prompts" },
];

const EVAL_NAMES = ["factual_accuracy", "groundedness", "tool_correctness", "refusal", "plan_quality"];

const MOCK_PROMPTS = [
  { id: 1, query: "Apple's FY2024 revenue (net sales)?", context: '{"answer":"$391.04B","source":"AAPL 10-K FY2024","acceptable_range":[387,395]}' },
  { id: 2, query: "Apple's FY2024 net income is?", context: '{"answer":"$93.74B","source":"AAPL 10-K FY2024","acceptable_range":[92.8,94.7]}' },
  { id: 3, query: "Apple's FY2023 total revenue?", context: '{"answer":"$383.29B","source":"AAPL 10-K FY2023","acceptable_range":[379.5,387.1]}' },
  { id: 4, query: "Apple's FY2024 R&D spending?", context: '{"answer":"$31.37B","source":"AAPL 10-K FY2024 income statement","acceptable_range":[31.05,31.69]}' },
  { id: 5, query: "NVIDIA's FY2024 (Jan 28) revenue?", context: '{"answer":"$60.92B","source":"NVDA 10-K FY2024","acceptable_range":[60.31,61.53]}' },
  { id: 6, query: "NVIDIA's FY2024 net income?", context: '{"answer":"$29.76B","source":"NVDA 10-K FY2024","acceptable_range":[29.46,30.06]}' },
  { id: 7, query: "NVIDIA's FY2025 (Jan 26) revenue?", context: '{"answer":"$130.50B","source":"NVDA 10-K FY2025","acceptable_range":[129.2,131.81]}' },
  { id: 8, query: "NVIDIA's FY2025 operating income?", context: '{"answer":"$81.45B","source":"NVDA 10-K FY2025","acceptable_range":[80.64,82.27]}' },
];

const MOCK_RESPONSES: Record<number, string> = {
  1: "Apple's FY2024 revenue is **$391.0B**.",
  2: "Apple's FY2024 net income is **$93.7B**.",
  3: "Apple's FY2023 revenue is **$383.3B**.",
  4: "Apple's FY2024 R&D spending is **$31.4B**.",
  5: "NVIDIA's FY2024 (Jan 28) revenue is **$60.9B**.",
  6: "NVIDIA's FY2024 net income is **$29.8B**.",
  7: "NVIDIA's FY2025 (Jan 26) revenue is **$130.5B**.",
  8: "The data is for FY2025 operating income, not FY2024...",
};

const MOCK_EVAL_RESULTS: Record<number, string[]> = {
  1: ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
  2: ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
  3: ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
  4: ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
  5: ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
  6: ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
  7: ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
  8: ["incorrect 0.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"],
};

const EVAL_SUMMARY = [
  { name: "factual_accuracy", score: 84, count: "42/50" },
  { name: "groundedness", score: 78, count: "39/50" },
  { name: "tool_correctness", score: 100, count: "50/50" },
  { name: "refusal", score: 86, count: "43/50" },
  { name: "plan_quality", score: 100, count: "50/50" },
];

interface RunData {
  name: string;
  date: string;
  rows: { id: number; query: string; response: string; evals: string[] }[];
  evalSummary: { name: string; score: number; count: string }[];
}

const INITIAL_RUNS: RunData[] = [
  {
    name: "V2 + 7", date: "May 8, 05:45",
    rows: MOCK_PROMPTS.map((p) => ({ id: p.id, query: p.query, response: MOCK_RESPONSES[p.id], evals: MOCK_EVAL_RESULTS[p.id] })),
    evalSummary: EVAL_SUMMARY,
  },
  { name: "V2 ver2", date: "May 8, 05:09", rows: [], evalSummary: [] },
  { name: "Base", date: "May 7, 03:06", rows: [], evalSummary: [] },
];

function DatasetPreview() {
  const [tab, setTab] = useState<"prompts" | "results">("results");
  const [selectedRun, setSelectedRun] = useState(0);
  const [selectedDataset, setSelectedDataset] = useState(0);
  const [runs, setRuns] = useState<RunData[]>(INITIAL_RUNS);

  // Generate: simulate agent running on all prompts
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [generatedRows, setGeneratedRows] = useState<{ id: number; query: string; response: string; evals: string[] }[]>([]);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setGenProgress(0);
    setGeneratedRows([]);
    setTab("results");

    let i = 0;
    const interval = setInterval(() => {
      i++;
      const p = MOCK_PROMPTS[i - 1];
      if (p) {
        setGeneratedRows((prev) => [...prev, {
          id: p.id, query: p.query,
          response: MOCK_RESPONSES[p.id],
          evals: [], // no evals yet
        }]);
      }
      setGenProgress(i);
      if (i >= MOCK_PROMPTS.length) {
        clearInterval(interval);
        // Create new run
        const newRun: RunData = {
          name: `New Run`, date: "May 17, " + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
          rows: MOCK_PROMPTS.map((p) => ({
            id: p.id, query: p.query,
            response: MOCK_RESPONSES[p.id],
            evals: [],
          })),
          evalSummary: [],
        };
        setRuns((prev) => [newRun, ...prev]);
        setSelectedRun(0);
        setGenerating(false);
        setGeneratedRows([]);
      }
    }, 300);
  }, []);

  // Evaluate: simulate eval worker running on current run's rows
  const [evaluating, setEvaluating] = useState(false);
  const [evalProgress, setEvalProgress] = useState(0);

  const handleEvaluate = useCallback(() => {
    const run = runs[selectedRun];
    if (!run || run.rows.length === 0) return;
    setEvaluating(true);
    setEvalProgress(0);

    let i = 0;
    const interval = setInterval(() => {
      i++;
      setEvalProgress(i);
      // Fill in evals row by row
      setRuns((prev) => prev.map((r, ri) => {
        if (ri !== selectedRun) return r;
        return {
          ...r,
          rows: r.rows.map((row, rowIdx) => {
            if (rowIdx < i) return { ...row, evals: MOCK_EVAL_RESULTS[row.id] || ["correct 1.00", "correct 1.00", "correct 1.00", "skipped 1.00", "partial 0.50"] };
            return row;
          }),
        };
      }));
      if (i >= run.rows.length) {
        clearInterval(interval);
        // Update eval summary
        setRuns((prev) => prev.map((r, ri) => {
          if (ri !== selectedRun) return r;
          return { ...r, evalSummary: EVAL_SUMMARY };
        }));
        setEvaluating(false);
      }
    }, 200);
  }, [runs, selectedRun]);

  const currentRun = runs[selectedRun];

  return (
    <div className="rounded-xl border overflow-hidden bg-background" style={{ height: 640 }}>
      <div className="flex h-full">
        {/* ── LEFT: Dataset sidebar ── */}
        <div className="w-60 shrink-0 flex flex-col border-r">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Datasets
            </span>
            <button className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="h-3 w-3" /> Dataset
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            {MOCK_DATASETS.map((d, i) => (
              <button
                key={d.name}
                onClick={() => setSelectedDataset(i)}
                className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                  selectedDataset === i ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground"
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.name}</span>
                  <span className="text-[10px] text-muted-foreground">{d.count}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Main area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar: title + actions */}
          <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">hallucination-50q</h3>
              <span className="text-[10px] text-muted-foreground">50 prompts &middot; 7 columns</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                <Download className="h-3 w-3" /> Export
              </button>
              <button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                <Upload className="h-3 w-3" /> Import
              </button>
            </div>
          </div>

          {/* Agent row */}
          <div className="flex items-center gap-3 border-b px-5 py-2.5">
            <span className="text-xs text-muted-foreground">Agent</span>
            <select className="h-7 rounded-md border bg-background px-2 text-xs outline-none">
              <option>Select...</option>
              <option>financial-qa-agent (online)</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {generating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {generating ? `Generating ${genProgress}/${MOCK_PROMPTS.length}` : "Generate"}
            </button>
          </div>

          {/* Evals row */}
          <div className="flex items-center gap-2 border-b px-5 py-2.5">
            <span className="text-xs text-muted-foreground">Evals</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {EVAL_SUMMARY.map((e) => (
                <span key={e.name} className="rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                  {e.name}
                </span>
              ))}
            </div>
            <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              onClick={handleEvaluate}
              disabled={evaluating || !currentRun || currentRun.rows.length === 0}
              className="ml-auto flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[10px] font-medium text-background disabled:opacity-50"
            >
              {evaluating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {evaluating ? `Evaluating ${evalProgress}/${currentRun?.rows.length ?? 0}` : "Evaluate"}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b px-5">
            {(["prompts", "results"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                  tab === t
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "prompts" ? "Prompts" : "Results"}
                <span className="rounded bg-foreground/10 px-1.5 text-[10px] tabular-nums">
                  {t === "prompts" ? "50" : "6"}
                </span>
              </button>
            ))}
          </div>

          {tab === "results" ? (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Run list sidebar */}
              <div className="w-52 shrink-0 border-r overflow-y-auto">
                <p className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b">
                  Runs
                </p>
                {runs.map((run, i) => (
                  <div
                    key={`${run.name}-${i}`}
                    onClick={() => setSelectedRun(i)}
                    className={`group flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 transition-colors last:border-b-0 ${
                      selectedRun === i ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <div className={`size-1.5 shrink-0 rounded-full ${i === 0 && generating ? "bg-foreground/40 animate-pulse" : "bg-[#3b82f6]"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{run.name}</p>
                      <p className="text-[10px] text-muted-foreground">{run.date}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Results content */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {!currentRun || currentRun.rows.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/30">
                    <Play className="h-8 w-8" />
                    <span className="text-sm">No results — click Generate to run the agent</span>
                  </div>
                ) : (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rows</p>
                      <p className="text-2xl font-bold tabular-nums">{currentRun.rows.length}</p>
                    </div>
                    <div className="rounded-lg border px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Avg Latency</p>
                      <p className="text-2xl font-bold tabular-nums">8.5s</p>
                    </div>
                    <div className="rounded-lg border px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">p95 Latency</p>
                      <p className="text-2xl font-bold tabular-nums">21.2s</p>
                    </div>
                  </div>

                  {/* Eval progress bars */}
                  {currentRun.evalSummary.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {currentRun.evalSummary.map((e) => (
                      <div key={e.name} className="flex items-center gap-3 px-4 py-2.5">
                        <p className="w-32 shrink-0 truncate text-xs font-medium">{e.name}</p>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ backgroundColor: "#3b82f6", width: `${e.score}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs font-bold tabular-nums">{e.score}%</span>
                        <span className="w-16 text-right text-[10px] text-muted-foreground tabular-nums">{e.count}</span>
                      </div>
                    ))}
                  </div>
                  )}

                  {/* Evaluating progress */}
                  {evaluating && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Evaluating row {evalProgress}/{currentRun.rows.length}...
                    </div>
                  )}

                  {/* Results table */}
                  <div className="rounded-lg border">
                    <div className="overflow-auto">
                      <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
                        <thead className="sticky top-0 z-10 border-b bg-background">
                          <tr>
                            <th className="w-10 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                            <th className="w-[180px] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Query</th>
                            <th className="w-[200px] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Response</th>
                            {EVAL_NAMES.map((e) => (
                              <th key={e} className="w-[120px] px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                {e}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {currentRun.rows.map((row) => (
                            <tr key={row.id} className="hover:bg-muted/20">
                              <td className="px-3 py-3 tabular-nums text-muted-foreground">{row.id}</td>
                              <td className="w-[180px] max-w-[180px] px-3 py-3">
                                <p className="truncate text-muted-foreground">{row.query}</p>
                              </td>
                              <td className="w-[200px] max-w-[200px] px-3 py-3">
                                <p className="truncate">{row.response}</p>
                              </td>
                              {row.evals.length > 0 ? row.evals.map((ev, i) => {
                                const isError = ev.startsWith("incorrect");
                                return (
                                  <td key={i} className="px-3 py-3 text-center">
                                    <span className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-medium">
                                      <span className={`size-1.5 rounded-full ${isError ? "bg-muted-foreground/40" : "bg-[#3b82f6]"}`} />
                                      {ev.split(" ")[0]}
                                    </span>
                                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">{ev.split(" ")[1]}</span>
                                  </td>
                                );
                              }) : EVAL_NAMES.map((_, i) => (
                                <td key={i} className="px-3 py-3 text-center text-[10px] text-muted-foreground/30">—</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </div>
          ) : (
            /* Prompts tab */
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-2 text-[10px] text-muted-foreground">
                Select rows to run on a subset
              </div>
              {MOCK_PROMPTS.map((p, i) => (
                <div key={i} className="flex items-start gap-3 border-b px-5 py-3 hover:bg-muted/20">
                  <input type="checkbox" className="mt-1 rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{p.query}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                      {p.context}
                    </div>
                  </div>
                  <button className="shrink-0 p-1 text-muted-foreground/30 hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main ── */

export function Datasets() {
  const t = useT();
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.datasets.groupLabel}
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{t.docs.datasets.title}</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {t.docs.datasets.subtitle}
      </p>

      <div className="space-y-10">
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.datasets.datasetInterface}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {t.docs.datasets.datasetInterfaceHelper}
          </p>
          <DatasetPreview />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.datasets.features}</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {(t.docs.datasets.featuresList as unknown as readonly string[]).map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Callout title={t.docs.datasets.calloutTitle}>
          {t.docs.datasets.calloutText}
        </Callout>
      </div>
    </div>
  );
}
