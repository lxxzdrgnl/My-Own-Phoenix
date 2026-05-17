"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  GridLayout,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, Settings2, X, Plus } from "lucide-react";
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
  { i: "hal", x: 0, y: 0, w: 1, h: 2 },
  { i: "qa", x: 1, y: 0, w: 1, h: 2 },
  { i: "total", x: 0, y: 2, w: 1, h: 1 },
  { i: "latency", x: 1, y: 2, w: 1, h: 1 },
];

const EXTRA_WIDGETS: WidgetDef[] = [
  { id: "rag", title: "RAG Relevance", value: "85.0%", label: "RETRIEVAL RELEVANCE" },
  { id: "cost", title: "Cost Tracking", value: "$12.40", label: "TOTAL COST" },
  { id: "err", title: "Error Rate", value: "0.0%", label: "ERROR RATE" },
  { id: "tok", title: "Token Efficiency", value: "1,245", label: "AVG TOKENS/CALL" },
];

/* ── WidgetCard (real UI replica) ── */
function WidgetCard({ widget, onRemove }: { widget: WidgetDef; onRemove: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizeClass, setSizeClass] = useState<"tiny" | "small" | "normal" | "large">("normal");

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
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
      {/* Header (drag handle) */}
      <div className="widget-drag-handle relative flex cursor-grab items-center gap-1.5 border-b border-border/40 px-4 py-2.5">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="text-sm font-semibold tracking-tight truncate">
          {widget.title}
        </span>
        <button className="shrink-0 rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          Summary
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded-lg p-1 text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content: StatCard */}
      <div className={`flex h-[calc(100%-2.75rem)] w-full flex-col items-center justify-center ${s.gap} overflow-hidden px-2 py-1`}>
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
    setLayout((prev) => [...prev, { i: ew.id, x: 0, y: maxY, w: 1, h: 1 }]);
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
            gridConfig={{ cols: 2, rowHeight: 160 }}
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
          <h3 className="text-sm font-semibold mb-3">Widget dashboard</h3>
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
