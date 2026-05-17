"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  GridLayout,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, Settings2, X, Plus } from "lucide-react";

/* ── Color presets (from real widget-grid.tsx) ── */
const PAIR_PRESETS: { name: string; colors: [string, string] }[] = [
  { name: "Default", colors: ["oklch(0.65 0.15 250)", "oklch(0.70 0.12 195)"] },
  { name: "Ocean", colors: ["oklch(0.60 0.14 230)", "oklch(0.72 0.10 200)"] },
  { name: "Sunset", colors: ["oklch(0.65 0.18 25)", "oklch(0.72 0.15 55)"] },
  { name: "Forest", colors: ["oklch(0.60 0.14 150)", "oklch(0.72 0.10 170)"] },
  { name: "Purple", colors: ["oklch(0.58 0.18 290)", "oklch(0.70 0.12 310)"] },
  { name: "Mono", colors: ["oklch(0.45 0.00 0)", "oklch(0.65 0.00 0)"] },
];
import { Callout } from "../code-block";

/* ── Widget definitions ── */
interface WidgetDef {
  id: string;
  title: string;
  value: string;
  label: string;
  trend?: string;
}

const INITIAL_WIDGETS: WidgetDef[] = [
  { id: "hal", title: "Hallucination Rate", value: "65.0%", label: "HALLUCINATION AVG", trend: "Based on 2 samples" },
  { id: "qa", title: "QA Accuracy", value: "100.0%", label: "QA CORRECTNESS AVG", trend: "Based on 4 samples" },
  { id: "total", title: "Total Queries", value: "42", label: "TOTAL SPANS" },
  { id: "latency", title: "Latency P95", value: "6389ms", label: "AVG LATENCY" },
];

const INITIAL_LAYOUT: LayoutItem[] = [
  { i: "hal", x: 0, y: 0, w: 2, h: 2, minW: 1, minH: 1 },
  { i: "qa", x: 2, y: 0, w: 2, h: 2, minW: 1, minH: 1 },
  { i: "total", x: 0, y: 2, w: 2, h: 1, minW: 1, minH: 1 },
  { i: "latency", x: 2, y: 2, w: 2, h: 1, minW: 1, minH: 1 },
];

const EXTRA_WIDGETS: WidgetDef[] = [
  { id: "rag", title: "RAG Relevance", value: "85.0%", label: "RETRIEVAL RELEVANCE" },
  { id: "cost", title: "Cost Tracking", value: "$12.40", label: "TOTAL COST" },
  { id: "err", title: "Error Rate", value: "0.0%", label: "ERROR RATE" },
  { id: "tok", title: "Token Efficiency", value: "1,245", label: "AVG TOKENS/CALL" },
];

type ViewMode = "summary" | "trend" | "detail";
const VIEW_LABELS: Record<ViewMode, string> = { summary: "Summary", trend: "Trend", detail: "Detail" };
const VIEW_ORDER: ViewMode[] = ["summary", "trend", "detail"];

/* Mock trend data per widget */
const TREND_DATA: Record<string, number[]> = {
  hal: [72, 68, 65, 70, 63, 65, 60, 65],
  qa: [95, 98, 100, 97, 100, 100, 100, 100],
  total: [3, 5, 4, 7, 6, 8, 5, 4],
  latency: [5200, 6100, 5800, 7200, 6389, 5900, 6800, 6389],
  rag: [80, 82, 85, 83, 87, 85, 84, 85],
  cost: [8, 10, 11, 9, 12, 14, 13, 12],
  err: [2, 1, 0, 1, 0, 0, 0, 0],
  tok: [1100, 1050, 1200, 1300, 1180, 1245, 1150, 1245],
};

const DETAIL_DATA: Record<string, { label: string; value: string }[]> = {
  hal: [{ label: "Total evaluated", value: "2" }, { label: "Factual", value: "1" }, { label: "Hallucinated", value: "1" }, { label: "Avg score", value: "0.65" }],
  qa: [{ label: "Total evaluated", value: "4" }, { label: "Correct", value: "4" }, { label: "Incorrect", value: "0" }, { label: "Accuracy", value: "100%" }],
  total: [{ label: "LLM spans", value: "28" }, { label: "TOOL spans", value: "8" }, { label: "CHAIN spans", value: "6" }, { label: "Total", value: "42" }],
  latency: [{ label: "p50", value: "4.2s" }, { label: "p90", value: "5.8s" }, { label: "p95", value: "6.4s" }, { label: "p99", value: "8.1s" }],
  rag: [{ label: "Relevant", value: "85%" }, { label: "Partial", value: "10%" }, { label: "Irrelevant", value: "5%" }, { label: "Avg score", value: "0.85" }],
  cost: [{ label: "Today", value: "$1.80" }, { label: "7 days", value: "$12.40" }, { label: "30 days", value: "$48.20" }, { label: "Avg/query", value: "$0.30" }],
  err: [{ label: "Total errors", value: "0" }, { label: "Timeouts", value: "0" }, { label: "Rate limits", value: "0" }, { label: "Success rate", value: "100%" }],
  tok: [{ label: "Avg input", value: "980" }, { label: "Avg output", value: "265" }, { label: "Avg total", value: "1,245" }, { label: "Max", value: "3,820" }],
};

/* ── WidgetCard (matches real widget-grid.tsx WidgetCard) ── */
function WidgetCard({ widget, onRemove }: { widget: WidgetDef; onRemove: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [sizeClass, setSizeClass] = useState<"tiny" | "small" | "normal" | "large">("normal");
  const [narrow, setNarrow] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [colors, setColors] = useState<[string, string]>([...PAIR_PRESETS[0].colors]);

  const cycleMode = () => {
    const idx = VIEW_ORDER.indexOf(viewMode);
    setViewMode(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]);
  };

  useEffect(() => {
    let el: HTMLElement | null = containerRef.current;
    while (el && !el.classList.contains("react-grid-item")) el = el.parentElement;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width < 150 || height < 100) setSizeClass("tiny");
      else if (width < 250 || height < 160) setSizeClass("small");
      else if (width > 450 && height > 300) setSizeClass("large");
      else setSizeClass("normal");
      setNarrow(width < 240);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!optionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [optionsOpen]);

  const styles = {
    tiny: { value: "text-lg", label: "text-[9px]", gap: "gap-0.5" },
    small: { value: "text-2xl", label: "text-[11px]", gap: "gap-1" },
    normal: { value: "text-5xl", label: "text-sm", gap: "gap-2" },
    large: { value: "text-7xl", label: "text-lg", gap: "gap-3" },
  };
  const s = styles[sizeClass];

  return (
    <div
      ref={containerRef}
      className="group relative h-full overflow-visible rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Header (drag handle) — matches real widget-grid.tsx */}
      <div className={`widget-drag-handle relative flex cursor-grab items-center gap-1.5 border-b border-border/40 ${narrow ? "px-2 py-1.5" : "px-4 py-2.5"}`}>
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className={`${narrow ? "text-xs" : "text-sm"} font-semibold tracking-tight truncate`}>
          {widget.title}
        </span>
        <button
          onClick={cycleMode}
          className={`shrink-0 rounded-md border border-border/50 bg-muted/50 ${narrow ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"} font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
        >
          {narrow ? VIEW_LABELS[viewMode][0] : VIEW_LABELS[viewMode]}
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {/* Settings dropdown — matches real widget-grid.tsx */}
          <div className="relative" ref={optionsRef}>
            <button
              onClick={() => setOptionsOpen(!optionsOpen)}
              className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            {optionsOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border bg-popover p-1 shadow-xl">
                {/* View mode selector */}
                {VIEW_ORDER.map((vm) => (
                  <button
                    key={vm}
                    onClick={() => { setViewMode(vm); setOptionsOpen(false); }}
                    className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                      viewMode === vm ? "bg-accent text-accent-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {VIEW_LABELS[vm]} View
                  </button>
                ))}
                <div className="my-1 border-t border-border/40" />

                {/* Color presets */}
                <div className="px-2.5 py-1.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Colors
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PAIR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        title={preset.name}
                        onClick={() => setColors([...preset.colors])}
                        className={`flex items-center gap-1 rounded-md border p-1 transition-colors ${
                          colors[0] === preset.colors[0] && colors[1] === preset.colors[1]
                            ? "border-foreground bg-accent"
                            : "border-transparent hover:bg-muted"
                        }`}
                      >
                        <span className="h-3.5 w-3.5 rounded-full" style={{ background: preset.colors[0] }} />
                        <span className="h-3.5 w-3.5 rounded-full" style={{ background: preset.colors[1] }} />
                      </button>
                    ))}
                  </div>

                  {/* Individual color pickers */}
                  <div className="flex flex-wrap items-center gap-2">
                    {colors.map((c, i) => (
                      <label key={i} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="font-medium">C{i + 1}</span>
                        <div className="relative">
                          <span className="block h-5 w-5 rounded-full border border-border/60" style={{ background: c }} />
                          <input
                            type="color"
                            value={c.startsWith("#") ? c : "#888888"}
                            onChange={(e) => {
                              const next: [string, string] = [...colors];
                              next[i] = e.target.value;
                              setColors(next);
                            }}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="my-1 border-t border-border/40" />
                <button
                  onClick={() => { onRemove(); setOptionsOpen(false); }}
                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  Remove Widget
                </button>
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded-lg p-1 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content — switches by viewMode */}
      <div className="h-[calc(100%-2.75rem)] w-full overflow-hidden">
        {viewMode === "summary" && (
          <div className={`flex h-full w-full flex-col items-center justify-center ${s.gap} px-2 py-1`}>
            <span
              className={`${s.value} font-black tabular-nums tracking-tighter truncate max-w-full`}
              style={{ fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', monospace" }}
            >
              {widget.value}
            </span>
            <div className="flex flex-col items-center gap-0.5 max-w-full overflow-hidden">
              <span className={`${s.label} font-semibold uppercase tracking-widest text-muted-foreground/70 truncate max-w-full`}>
                {widget.label}
              </span>
              {widget.trend && sizeClass !== "tiny" && (
                <span className="text-xs px-2.5 py-0.5 rounded-full border border-border/50 bg-muted/50 font-medium tabular-nums text-muted-foreground truncate max-w-full">
                  {widget.trend}
                </span>
              )}
            </div>
          </div>
        )}
        {viewMode === "trend" && (() => {
          const data = TREND_DATA[widget.id] ?? [50, 60, 55, 70, 65, 72, 68, 75];
          const max = Math.max(...data);
          return (
            <div className="flex h-full flex-col px-3 py-2">
              <div className="flex items-end gap-[3px] flex-1">
                {data.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t"
                    style={{ height: `${(v / max) * 100}%`, backgroundColor: colors[0], opacity: 0.5 + (i / data.length) * 0.5 }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[8px] text-muted-foreground">7d ago</span>
                <span className="text-[8px] text-muted-foreground">now</span>
              </div>
            </div>
          );
        })()}
        {viewMode === "detail" && (
          <div className="flex h-full flex-col justify-center px-3 py-2">
            <div className="space-y-1.5">
              {(DETAIL_DATA[widget.id] ?? []).map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{row.label}</span>
                  <span className="text-xs font-semibold tabular-nums">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard with react-grid-layout ── */
function DashboardPreview() {
  const [widgets, setWidgets] = useState<WidgetDef[]>(INITIAL_WIDGETS);
  const [layout, setLayout] = useState<LayoutItem[]>(INITIAL_LAYOUT);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const available = EXTRA_WIDGETS.filter(
    (ew) => !widgets.some((w) => w.id === ew.id)
  );

  const handleRemove = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setLayout((prev) => prev.filter((l) => l.i !== id));
  }, []);

  const handleAdd = useCallback((ew: WidgetDef) => {
    setWidgets((prev) => [...prev, ew]);
    const maxY = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    setLayout((prev) => [...prev, { i: ew.id, x: 0, y: maxY, w: 1, h: 1, minW: 1, minH: 1 }]);
    setMenuOpen(false);
  }, [layout]);

  return (
    <div className="rounded-xl border overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-5 py-3">
        <h2 className="text-sm font-bold tracking-tight">Dashboard</h2>
        {["Today", "7 Days", "30 Days"].map((label, i) => (
          <button
            key={label}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              i === 1
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="relative ml-2">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Plus className="h-3 w-3" />
            Add Widget
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-xl border bg-popover p-1.5 shadow-xl">
              {available.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">
                  All widgets added
                </div>
              ) : (
                available.map((ew) => (
                  <button
                    key={ew.id}
                    onClick={() => handleAdd(ew)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    {ew.title}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid area */}
      <div
        ref={containerRef}
        className="p-5"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--border) / 0.3) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {containerWidth > 0 && widgets.length > 0 ? (
          <GridLayout
            className="layout"
            layout={layout}
            width={containerWidth - 40}
            gridConfig={{ cols: 4, rowHeight: Math.floor((containerWidth - 40) / 4) }}
            dragConfig={{ handle: ".widget-drag-handle" }}
            onLayoutChange={(newLayout) => setLayout([...newLayout] as LayoutItem[])}
            onDragStop={(newLayout) => setLayout([...newLayout] as LayoutItem[])}
            onResizeStop={(newLayout) => setLayout([...newLayout] as LayoutItem[])}
          >
            {widgets.map((w) => (
              <div key={w.id}>
                <WidgetCard widget={w} onRemove={() => handleRemove(w.id)} />
              </div>
            ))}
          </GridLayout>
        ) : widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/30">
            <span className="text-sm">
              No widgets — click + Add Widget to get started
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── MEASURE framework cards ── */
const FRAMEWORK_CARDS = [
  { label: "GOVERN", subtitle: "Governance", score: "90%", desc: "AI policy, eval coverage, ethics principles, guardrail configuration" },
  { label: "MAP", subtitle: "Risk Identification", score: "100%", desc: "Risk category coverage, eval type diversity, impact analysis" },
  { label: "MEASURE", subtitle: "Risk Measurement", score: "90%", desc: "12 performance metrics — all normalized 0-100%, higher is better" },
  { label: "MANAGE", subtitle: "Risk Response", score: "0%", desc: "Risk mitigation rate, incident response, remediation actions" },
];

/* ── All 12 MEASURE metrics ── */
const MEASURE_METRICS = [
  { name: "Hallucination Eval", score: "100.0%", metric: "factual_rate", desc: "Rate of factually accurate responses. 100% = no hallucinations." },
  { name: "Toxicity Eval", score: "100.0%", metric: "safety_rate", desc: "Rate of safe, non-toxic responses. 100% = no banned words detected." },
  { name: "QA Eval", score: "100.0%", metric: "qa_accuracy", desc: "Rate of correct answers. Label-based (correct/incorrect)." },
  { name: "Relevance Eval", score: "85.0%", metric: "retrieval_relevance", desc: "How well retrieved documents support the query. 70%+ = at least 1 relevant doc." },
  { name: "Span Duration", score: "72.5%", metric: "latency_score", desc: "Response speed. 100% = p95 under 15s, 0% = over 60s." },
  { name: "status_code", score: "98.0%", metric: "success_rate", desc: "API call success rate. 100% = no errors." },
  { name: "token_count", score: "65.0%", metric: "token_score", desc: "Token efficiency. 100% = avg under 2K, 0% = over 10K." },
  { name: "llm.cost.total", score: "55.0%", metric: "cost_score", desc: "Cost efficiency. 100% = under $10/day, 0% = over $200/day." },
  { name: "Feedback Eval", score: "90.0%", metric: "user_satisfaction", desc: "Rate of positive user feedback. Based on thumbs up/down." },
  { name: "Tool Calling Eval", score: "78.0%", metric: "tool_calling_accuracy", desc: "Average tool/retrieval appropriateness score." },
  { name: "Guardrail Eval", score: "97.0%", metric: "guardrail_pass", desc: "Rate of responses passing safety guardrails (PII, tone, harmful advice)." },
  { name: "Citation Eval", score: "82.0%", metric: "citation_accuracy", desc: "Average context faithfulness score. 100% = fully grounded." },
];

/* ── Main ── */

export function Dashboard() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Features
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Customizable widget-based dashboard. Add, remove, drag to reorder,
        and resize widgets to monitor your agent&apos;s performance. Layout
        is saved per user per project.
      </p>

      <div className="space-y-10">
        {/* Interactive widget dashboard */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Widget dashboard</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Try it: drag the grip icon to move widgets, drag the bottom-right
            corner to resize. Hover to see X (remove) and + Add Widget to add
            new ones.
          </p>
          <DashboardPreview />
        </div>

        {/* MEASURE framework */}
        <div>
          <h3 className="text-sm font-semibold mb-4">NIST AI RMF framework</h3>
          <p className="text-xs text-muted-foreground mb-4">
            The dashboard includes an AI risk monitoring framework with 4
            pillars: Govern, Map, Measure, Manage. Each pillar aggregates
            relevant metrics into a single percentage score.
          </p>
          <div className="grid grid-cols-4 gap-3">
            {FRAMEWORK_CARDS.map((card) => (
              <div key={card.label} className="rounded-xl border overflow-hidden">
                <div className="p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {card.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</div>
                  <div className="text-2xl font-bold mt-2">{card.score}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{card.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All 12 MEASURE metrics */}
        <div>
          <h3 className="text-sm font-semibold mb-4">MEASURE metrics (12 total)</h3>
          <p className="text-xs text-muted-foreground mb-4">
            All metrics normalized to 0-100% (higher is better). Green dot
            indicates healthy, yellow is warning, red is critical.
          </p>
          <div className="grid grid-cols-4 gap-4">
            {MEASURE_METRICS.map((card) => {
              const scoreNum = parseFloat(card.score);
              const dotColor = scoreNum > 90 ? "#10b981" : scoreNum > 60 ? "#f59e0b" : "#ef4444";
              return (
                <div key={card.metric} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
                  {/* Header: status dot + label */}
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block shrink-0 rounded-full"
                      style={{ width: "0.625rem", height: "0.625rem", backgroundColor: dotColor }}
                    />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {card.name}
                    </span>
                  </div>
                  {/* Large value */}
                  <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                    {card.score}
                  </span>
                  {/* Metric ID */}
                  <span className="text-xs text-muted-foreground font-mono">
                    {card.metric}
                  </span>
                  {/* Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <Callout title="Customization">
          Every widget supports 3 view modes (Summary, Trend, Detail),
          custom color palettes, and drag-and-drop reordering. Layout is
          persisted per user per project — each team member sees their own
          arrangement.
        </Callout>
      </div>
    </div>
  );
}
