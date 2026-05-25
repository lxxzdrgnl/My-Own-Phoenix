"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useEffect } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { type RawSpan, type TraceTree, type Annotation } from "@/lib/phoenix";
import { AnnotationBadges } from "@/components/annotation-badge";
import { AnnotationForm } from "@/components/modals/annotation-form";
import { AddToDatasetModal } from "@/components/modals/add-to-dataset-modal";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  Clock,
  Cpu,
  Coins,
  Timer,
  Plus,
  Trash2,
  Shield,
} from "lucide-react";
import { GuardrailDetail } from "@/components/span-detail/guardrail-detail";
import { TraceDetailTabs } from "@/components/trace-detail";
import { useProjectOptional } from "@/lib/project-context";
import { useT } from "@/lib/i18n";
import { extractInputPreview } from "@/lib/span-extraction";
import { SpanGraph } from "@/components/span-graph";
import { RoleGate } from "@/components/ui/role-gate";

import { getSpanStyle, StatusIcon, getSpanBarColor } from "./span-style";
import { formatSec, formatJson } from "./span-tree-helpers";
import { SpanNode } from "./span-tree-node";

// ─── Span Timeline bar ────────────────────────────────────────────────────────

function SpanTimeline({ rootSpan }: { rootSpan: RawSpan }) {
  const totalMs = rootSpan.latency;
  if (!totalMs || totalMs <= 0) return null;

  const children = (rootSpan.children ?? []).filter((c) => c.latency > 0);
  if (children.length === 0) return null;

  return (
    <div className="px-3 py-2 border-t">
      {/* Bar */}
      <div className="h-2.5 flex rounded-full overflow-hidden bg-white dark:bg-white/10">
        {children.map((child) => {
          const pct = Math.max(1, (child.latency / totalMs) * 100);
          const color = getSpanBarColor(child);
          return (
            <div
              key={child.spanId}
              title={`${child.name} — ${formatSec(child.latency)}`}
              className="h-full transition-all hover:opacity-80"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
        {children.map((child) => {
          const color = getSpanBarColor(child);
          return (
            <div key={child.spanId} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-muted-foreground">{child.name}</span>
              <span className="text-[10px] font-medium tabular-nums">{formatSec(child.latency)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Root Span Header ────────────────────────────────────────────────────────

function RootHeader({ span, onDeleteAnnotation, onAnnotate }: {
  span: RawSpan;
  onDeleteAnnotation?: (spanId: string, name: string) => void;
  onAnnotate?: (spanId: string, annotations: Annotation[]) => void;
}) {
  const style = getSpanStyle(span);
  const Icon = style.icon;

  function sumTree(node: RawSpan): { prompt: number; completion: number; total: number; cost: number } {
    let p = node.promptTokens, c = node.completionTokens, t = node.totalTokens, cost = node.cost;
    for (const child of node.children) {
      const sub = sumTree(child);
      p += sub.prompt; c += sub.completion; t += sub.total; cost += sub.cost;
    }
    return { prompt: p, completion: c, total: t, cost };
  }
  const tokens = sumTree(span);

  return (
    <div className="px-3 py-3 border-b">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", style.bg)}>
          <Icon className={cn("size-3.5", style.fg)} />
        </span>
        <h3 className="text-sm font-semibold truncate">{span.name}</h3>
        <StatusIcon status={span.status} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Timer className="size-3" />
          {formatSec(span.latency)}
        </span>
        {tokens.total > 0 && (
          <span className="flex items-center gap-1">
            <Coins className="size-3" />
            {tokens.total.toLocaleString()}
          </span>
        )}
        {tokens.cost > 0 && (
          <span className="flex items-center gap-1">
            ${tokens.cost.toFixed(4)}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {span.annotations.length > 0 && (
          <AnnotationBadges
            annotations={span.annotations}
            onDelete={onDeleteAnnotation ? (name) => onDeleteAnnotation(span.spanId, name) : undefined}
          />
        )}
        {onAnnotate && (
          <RoleGate>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnnotate(span.spanId, span.annotations);
              }}
              className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
              title="Add annotation"
            >
              <Plus className="h-3 w-3" />
            </button>
          </RoleGate>
        )}
      </div>
    </div>
  );
}

// ─── Span Detail Panel ───────────────────────────────────────────────────────

function SpanDetail({ span, onDeleteAnnotation, onAnnotate }: {
  span: RawSpan;
  onDeleteAnnotation?: (spanId: string, name: string) => void;
  onAnnotate?: (spanId: string, annotations: Annotation[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<"input" | "output">("input");
  const style = getSpanStyle(span);
  const Icon = style.icon;

  if (span.spanKind?.toUpperCase() === "GUARDRAIL") {
    return <GuardrailDetail span={span} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded", style.bg)}>
            <Icon className={cn("size-3", style.fg)} />
          </span>
          <h3 className="text-sm font-semibold truncate">{span.name}</h3>
          <StatusIcon status={span.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatSec(span.latency)}
          </span>
          {span.model && (
            <span className="flex items-center gap-1">
              <Cpu className="size-3" />
              {span.model}
            </span>
          )}
          {span.totalTokens > 0 && (
            <span className="flex items-center gap-1">
              <Coins className="size-3" />
              {span.totalTokens.toLocaleString()} tokens
              <span className="text-muted-foreground/60">
                ({span.promptTokens} + {span.completionTokens})
              </span>
            </span>
          )}
          {span.cost > 0 && (
            <span className="flex items-center gap-1">
              ${span.cost.toFixed(4)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {span.annotations.length > 0 && (
            <AnnotationBadges
              annotations={span.annotations}
              onDelete={onDeleteAnnotation ? (name) => onDeleteAnnotation(span.spanId, name) : undefined}
            />
          )}
          {onAnnotate && (
            <RoleGate>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAnnotate(span.spanId, span.annotations);
                }}
                className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                title="Add annotation"
              >
                <Plus className="h-3 w-3" />
              </button>
            </RoleGate>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(["input", "output"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 transition-colors capitalize",
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono text-foreground/80">
          {formatJson(activeTab === "input" ? span.input : span.output) || (
            <span className="text-muted-foreground italic">No {activeTab} data</span>
          )}
        </pre>
      </div>
    </div>
  );
}

// ─── Trace Accordion Item ─────────────────────────────────────────────────────

function TraceAccordionItem({ trace, enabledEvals, projectName, onDeleteAnnotation, onDeleteTrace, onRefresh }: {
  trace: TraceTree;
  enabledEvals: string[];
  projectName?: string;
  onDeleteAnnotation?: (spanId: string, name: string) => void;
  onDeleteTrace?: (traceId: string) => void;
  onRefresh?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedSpan, setSelectedSpan] = useState<RawSpan | null>(null);
  const [annotateSpanId, setAnnotateSpanId] = useState<string | null>(null);
  const [annotateAnnotations, setAnnotateAnnotations] = useState<Annotation[]>([]);
  const [datasetModalOpen, setDatasetModalOpen] = useState(false);
  const projectCtx = useProjectOptional();

  function handleAnnotate(spanId: string, annotations: Annotation[]) {
    setAnnotateSpanId(spanId);
    setAnnotateAnnotations(annotations);
  }
  const t = useT();
  const style = getSpanStyle(trace.rootSpan);
  const Icon = style.icon;

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header row */}
      <div
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) setSelectedSpan(trace.rootSpan);
        }}
        className={cn(
          "group flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 cursor-pointer",
          expanded && "bg-accent/20"
        )}
      >
        {expanded
          ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        }
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", style.bg)}>
          <Icon className={cn("size-3.5", style.fg)} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium shrink-0">{trace.rootSpan.name}</span>
            {(() => {
              const preview = extractInputPreview(trace.rootSpan.input);
              return preview ? (
                <span className="text-[12px] text-muted-foreground truncate">
                  — {preview}
                </span>
              ) : null;
            })()}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(trace.time).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {trace.rootSpan.annotations.length > 0 && (
              <AnnotationBadges annotations={trace.rootSpan.annotations} />
            )}
            {(() => {
              const have = new Set(trace.rootSpan.annotations.map((a) => a.name));
              const pending = enabledEvals.filter((n) => !have.has(n));
              return pending.map((name) => (
                <span
                  key={`pending-${name}`}
                  title={t.traceTabs?.pending ?? "평가 대기"}
                  className="inline-flex items-center gap-1 rounded border border-dashed border-foreground/20 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  {name} <span className="font-bold">−</span>
                </span>
              ));
            })()}
            <RoleGate>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnnotate(trace.rootSpan.spanId, trace.rootSpan.annotations);
                }}
                className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                title="Add annotation"
              >
                <Plus className="h-3 w-3" />
              </button>
            </RoleGate>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <StatusIcon status={trace.rootSpan.status} />
          {expanded && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{formatSec(trace.latency)}</span>
          )}
          {trace.hasGuardrailTriggered && (
            <span
              title={t.projects.guardrailTriggered}
              className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400"
            >
              <Shield className="size-2.5" />
              {t.projects.guardBadge}
            </span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {trace.spanCount} span{trace.spanCount !== 1 && "s"}
          </span>
          <RoleGate>
            <button
              onClick={(e) => { e.stopPropagation(); setDatasetModalOpen(true); }}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Add to dataset"
            >
              <Database className="size-3" />
              Dataset
            </button>
          </RoleGate>
          {onDeleteTrace && (
            <RoleGate>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteTrace(trace.traceId); }}
                className="rounded p-1 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent hover:text-foreground"
                title="Delete trace"
              >
                <Trash2 className="size-3.5" />
              </button>
            </RoleGate>
          )}
        </div>
      </div>

      {/* Span timeline bar — only when expanded */}
      {expanded && <SpanTimeline rootSpan={trace.rootSpan} />}

      {/* Evaluations / Annotations / Raw tabs */}
      {expanded && (
        <div className="border-t">
          <TraceDetailTabs trace={trace} projectId={projectCtx?.id} projectName={projectName} onRefresh={onRefresh} />
        </div>
      )}

      {/* Expanded: tree + detail + graph */}
      {expanded && (
        <div>
          <div className="flex border-t" style={{ minHeight: "300px" }}>
            {/* Left: span tree */}
            <div className="w-[400px] shrink-0 border-r bg-card">
              <RootHeader span={trace.rootSpan} onDeleteAnnotation={onDeleteAnnotation} onAnnotate={handleAnnotate} />
              <div className="py-1">
                {trace.rootSpan.children.map((child, i) => (
                  <SpanNode
                    key={child.spanId}
                    span={child}
                    depth={1}
                    isLast={i === trace.rootSpan.children.length - 1}
                    selectedId={selectedSpan?.spanId ?? null}
                    onSelect={setSelectedSpan}
                  />
                ))}
              </div>
            </div>

            {/* Right: detail */}
            <div className="flex-1 min-w-0 overflow-y-auto max-h-[600px]">
              {selectedSpan ? (
                <SpanDetail span={selectedSpan} onDeleteAnnotation={onDeleteAnnotation} onAnnotate={handleAnnotate} />
              ) : (
                <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground">
                  Select a span
                </div>
              )}
            </div>
          </div>

          {/* Graph — full width below. pii_guard spans excluded (too noisy) */}
          {trace.rootSpan.children.length > 0 && (
            <div className="border-t p-3">
              <SpanGraph
                rootSpan={trace.rootSpan}
                selectedId={selectedSpan?.spanId}
                onSelect={setSelectedSpan}
                excludeSpanKinds={["GUARDRAIL"]}
              />
            </div>
          )}
        </div>
      )}
      <AnnotationForm
        open={!!annotateSpanId}
        onClose={() => setAnnotateSpanId(null)}
        spanId={annotateSpanId ?? ""}
        existingAnnotations={annotateAnnotations}
        onSaved={() => {
          setAnnotateSpanId(null);
          onRefresh?.();
        }}
      />
      <AddToDatasetModal
        open={datasetModalOpen}
        onClose={() => setDatasetModalOpen(false)}
        query={extractInputPreview(trace.rootSpan.input) || trace.rootSpan.name}
        context={(() => {
          const parts: string[] = [];
          function collectContext(span: RawSpan) {
            if ((span.spanKind === "TOOL" || span.spanKind === "RETRIEVER") && span.output) {
              const out = typeof span.output === "string" ? span.output : JSON.stringify(span.output);
              if (out.length > 10) parts.push(out);
            }
            span.children?.forEach(collectContext);
          }
          collectContext(trace.rootSpan);
          return parts.join("\n---\n");
        })()}
        response={(() => {
          const out = trace.rootSpan.output;
          if (!out) return "";
          try {
            const parsed = JSON.parse(out);
            if (Array.isArray(parsed?.messages)) {
              const ai = parsed.messages.find((m: any) => m.type === "ai" || m.role === "assistant");
              if (ai?.content) return String(ai.content);
            }
            return parsed?.content || parsed?.output || out;
          } catch { return out; }
        })()}
      />
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function SpanTreeView({
  traces,
  projectName,
  onRefresh,
}: {
  traces: TraceTree[];
  projectName?: string;
  onRefresh?: () => void;
}) {
  const confirm = useConfirm();
  const projectCtx = useProjectOptional();
  const [enabledEvals, setEnabledEvals] = useState<string[]>([]);

  useEffect(() => {
    if (!projectCtx?.id) return;
    apiFetch(`/api/eval-config?projectId=${encodeURIComponent(projectCtx.id)}`)
      .then((r) => r.json())
      .then((d: { items?: { evalName: string; enabled: boolean }[] }) => {
        const configs = (d as any).items ?? [];
        setEnabledEvals(configs.filter((c: any) => c.enabled).map((c: any) => c.evalName));
      })
      .catch(() => {});
  }, [projectCtx?.id]);

  async function handleDeleteTrace(traceId: string) {
    const ok = await confirm({
      title: "Delete trace",
      description: "This trace and all its spans will be permanently removed.",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/traces/${encodeURIComponent(traceId)}`, { method: "DELETE" });
      onRefresh?.();
    } catch (e) { console.error(e); }
  }

  async function handleDeleteAnnotation(spanId: string, annotationName: string) {
    if (!projectName) return;
    const ok = await confirm({
      title: "Delete annotation",
      description: `The "${annotationName}" annotation will be permanently removed.`,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/projects/${encodeURIComponent(projectName)}/span_annotations`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: annotationName, span_id: spanId }),
      });
      onRefresh?.();
    } catch (e) { console.error(e); }
  }

  return (
    <div className="space-y-1.5">
      {traces.map((t) => (
        <TraceAccordionItem
          key={t.traceId}
          trace={t}
          enabledEvals={enabledEvals}
          projectName={projectName}
          onDeleteAnnotation={projectName ? handleDeleteAnnotation : undefined}
          onDeleteTrace={handleDeleteTrace}
          onRefresh={onRefresh}
        />
      ))}
      {traces.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No traces found
        </p>
      )}
    </div>
  );
}
