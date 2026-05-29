"use client";
import { apiFetch } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { logger } from "@/lib/logger";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Heading, Text } from "@/components/ui/typography";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FAIL_LABELS } from "@/lib/constants";
import { fetchTraces, fetchTraceTrees, deleteTrace, type Trace, type TraceTree } from "@/lib/phoenix";
import { SpanTreeView } from "@/components/trace-tree";
import { RoleGate } from "@/components/ui/role-gate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTraceSelection } from "@/lib/hooks/use-trace-selection";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { MeasureGrid } from "@/components/dashboard/widgets/measure-grid";
import { RmfFunctionCards } from "@/components/dashboard/widgets/rmf-function-card";
import { GapAnalysis, type GapDataItem } from "@/components/dashboard/widgets/gap-analysis";
import { computeMetrics, computeGovernScore, computeMapScore, computeMeasureScore, type FeedbackStats, type RmfScores } from "@/lib/rmf-utils";
import type { AnnotationData, SpanData } from "@/lib/dashboard-utils";
import { cn } from "@/lib/utils";
import { Search, Filter, Trash2 } from "lucide-react";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { QueryBar, ChipRow } from "@/components/query-bar";
import { parseQuery, serializeQuery, applyFilters } from "@/lib/query";
import type { QueryAST } from "@/lib/query";
import { useProjectSse } from "@/lib/hooks/use-project-sse";
import { useProjectOptional } from "@/lib/project-context";
import { useDisclosure } from "@/lib/hooks/use-disclosure";


function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function buildLatencyChartOptions(traces: Trace[]): Highcharts.Options {
  const sorted = [...traces].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
  return {
    chart: { type: "area" },
    title: { text: "Latency Over Time", style: { fontSize: "14px" } },
    xAxis: {
      categories: sorted.map((t) =>
        new Date(t.time).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      ),
    },
    yAxis: { title: { text: "ms" } },
    series: [
      { name: "Latency", type: "area", data: sorted.map((t) => Math.round(t.latency)), color: "#3b82f6", fillOpacity: 0.15 },
    ],
  };
}

function buildScoreChartOptions(traces: Trace[]): Highcharts.Options {
  const annotations = traces.flatMap((t) => t.annotations);
  const byName: Record<string, number[]> = {};
  for (const a of annotations) {
    if (!byName[a.name]) byName[a.name] = [];
    byName[a.name].push(a.score);
  }
  const categories = Object.keys(byName);
  const avgScores = categories.map((name) => {
    const scores = byName[name];
    return +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
  });
  return {
    chart: { type: "column" },
    title: { text: "Avg Score by Annotation", style: { fontSize: "14px" } },
    xAxis: { categories },
    yAxis: { title: { text: "Score" }, min: 0, max: 1 },
    series: [{ name: "Avg Score", type: "column", data: avgScores, color: "#3b82f6" }],
  };
}

function buildPassFailChartOptions(traces: Trace[]): Highcharts.Options {
  // FAIL_LABELS imported from lib/constants
  const byName: Record<string, { pass: number; fail: number }> = {};
  for (const t of traces) {
    for (const a of t.annotations) {
      if (!byName[a.name]) byName[a.name] = { pass: 0, fail: 0 };
      if (FAIL_LABELS.has(a.label)) byName[a.name].fail++;
      else byName[a.name].pass++;
    }
  }
  const categories = Object.keys(byName);
  return {
    chart: { type: "bar" },
    title: { text: "Pass / Fail by Eval", style: { fontSize: "14px" } },
    xAxis: { categories },
    yAxis: { title: { text: "Count" } },
    plotOptions: { bar: { stacking: "normal" } },
    series: [
      { name: "Pass", type: "bar", data: categories.map((n) => byName[n].pass), color: "#3b82f6" },
      { name: "Fail", type: "bar", data: categories.map((n) => byName[n].fail), color: "#a1a1aa" },
    ],
  };
}

export function ProjectView({ projectName, defaultTab = "traces", hideTabBar = false }: { projectName: string; defaultTab?: "traces" | "measure"; hideTabBar?: boolean }) {
  const t = useT();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [traceTrees, setTraceTrees] = useState<TraceTree[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"traces" | "measure">(defaultTab);
  const filterDropdown = useDisclosure();
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(7));

  // ── Query AST (single source of truth for filters) ──
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Derive known annotation names from loaded traces so the parser can
  // distinguish annotation tokens from typos.
  const knownAnnotations = useMemo(() => {
    const s = new Set<string>();
    for (const tr of traces) {
      for (const a of tr.annotations) s.add(a.name);
    }
    return s;
  }, [traces]);

  const [queryAST, setQueryAST] = useState<QueryAST>({ tokens: [], annotationCombinator: "AND" });
  // Track the last URL `?q=` value we processed so we only re-hydrate from URL
  // when it actually changes externally (not on every router.replace we issue).
  const initialQRef = useRef<string | null>(null);
  useEffect(() => {
    const q = searchParams?.get("q") ?? "";
    if (initialQRef.current === q) return;
    initialQRef.current = q;
    const { ast } = parseQuery(q, knownAnnotations);
    setQueryAST(ast);
  }, [searchParams, knownAnnotations]);

  const syncUrl = useCallback(
    (ast: QueryAST) => {
      const text = serializeQuery(ast);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (text) params.set("q", text);
      else params.delete("q");
      const qs = params.toString();
      initialQRef.current = text;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const handleQueryChange = useCallback(
    (ast: QueryAST) => {
      setQueryAST(ast);
      syncUrl(ast);
    },
    [syncUrl],
  );

  const loadTraces = useCallback(async () => {
    setTracesLoading(true);
    try {
      const [t, trees] = await Promise.all([
        fetchTraces(projectName, undefined, undefined, dateRange.from?.toISOString(), dateRange.to?.toISOString()),
        fetchTraceTrees(projectName, dateRange.from?.toISOString(), dateRange.to?.toISOString()),
      ]);
      t.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setTraces(t);
      setTraceTrees(trees);
      setInitialLoaded(true);
    } catch (e) {
      logger.error("project view load traces failed", e);
    }
    setTracesLoading(false);
  }, [projectName, dateRange]);

  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  // Live updates via SSE — re-fetch traces when an eval completes for this project
  const projectCtx = useProjectOptional();
  useProjectSse(projectCtx?.id, (msg) => {
    if (msg.type === "eval-completed") loadTraces();
  });

  // ── Multi-select delete ──
  const confirm = useConfirm();
  const sel = useTraceSelection();
  const [deleting, setDeleting] = useState(false);

  // Optimistic removal — Phoenix deletes asynchronously, so a refetch can still
  // return a just-deleted trace; drop it from local state immediately.
  const removeTraces = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setTraces((prev) => prev.filter((tr) => !idSet.has(tr.traceId)));
    setTraceTrees((prev) => prev.filter((tr) => !idSet.has(tr.traceId)));
  }, []);

  async function handleDeleteSelected() {
    if (sel.selectedIds.size === 0) return;
    const ok = await confirm({
      title: t.tracing.deleteTraces,
      description: `${sel.selectedIds.size} trace(s) will be permanently deleted.`,
      confirmText: t.common.delete,
    });
    if (!ok) return;
    setDeleting(true);
    const ids = [...sel.selectedIds];
    for (const id of ids) {
      try {
        await deleteTrace(id);
      } catch (e) {
        logger.error("project view bulk delete failed", e, { traceId: id });
      }
    }
    removeTraces(ids);
    sel.reset();
    setDeleting(false);
  }

  // ── Filtering ──
  const filteredTraces = useMemo(
    () => applyFilters(traces, queryAST),
    [traces, queryAST],
  );

  const filteredTraceIds = useMemo(
    () => new Set(filteredTraces.map((t) => t.traceId)),
    [filteredTraces],
  );

  const filteredTraceTrees = useMemo(
    () => traceTrees.filter((t) => filteredTraceIds.has(t.traceId)),
    [traceTrees, filteredTraceIds],
  );

  const hasActiveFilters = queryAST.tokens.length > 0;

  // Metrics computation
  const traceCount = traceTrees.length || traces.length;
  const latencies = (traceTrees.length > 0
    ? traceTrees.map((t) => t.latency)
    : traces.map((t) => t.latency)
  ).filter((l) => l > 0);
  const avgLatency = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;
  const allAnnotations = traceTrees.length > 0
    ? traceTrees.flatMap((t) => t.rootSpan.annotations)
    : traces.flatMap((t) => t.annotations);
  const scores = allAnnotations.map((a) => a.score).filter((s) => s > 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const hasAnnotations = allAnnotations.length > 0;

  // Feedback stats
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | undefined>();
  const loadFeedbackStats = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/feedback/stats?project=${encodeURIComponent(projectName)}`);
      if (res.ok) {
        const data = await res.json();
        setFeedbackStats({ total: data.totalResponses, downCount: data.downCount });
      }
    } catch (e) { logger.error("project view load feedback stats failed", e); }
  }, [projectName]);
  useEffect(() => { loadFeedbackStats(); }, [loadFeedbackStats]);

  // RMF metrics
  const rmfMetrics = useMemo(() => {
    if (!traceTrees.length && !traces.length) return computeMetrics([], [], feedbackStats);

    function collectSpans(node: import("@/lib/phoenix").RawSpan): SpanData[] {
      const result: SpanData[] = [{
        latency: node.latency,
        status: node.status || "OK",
        time: "",
        promptTokens: node.promptTokens || 0,
        completionTokens: node.completionTokens || 0,
        totalTokens: node.totalTokens || 0,
        model: node.model || "",
        spanKind: node.spanKind || "",
      }];
      for (const child of node.children) result.push(...collectSpans(child));
      return result;
    }

    const spanData: SpanData[] = traceTrees.length > 0
      ? traceTrees.flatMap((t) => {
          const spans = collectSpans(t.rootSpan);
          spans[0].time = t.time;
          return spans;
        })
      : traces.map((t) => ({
          latency: t.latency, status: t.status || "OK", time: t.time,
          promptTokens: t.promptTokens || 0, completionTokens: t.completionTokens || 0,
          totalTokens: t.totalTokens || 0, model: t.model || "", spanKind: t.spanKind || "LLM",
        }));

    const annData: AnnotationData[] = traceTrees.length > 0
      ? traceTrees.flatMap((t) => t.rootSpan.annotations.map((a) => ({ ...a, time: t.time })))
      : traces.flatMap((t) => (t.annotations || []).map((a) => ({ ...a, time: t.time })));

    return computeMetrics(spanData, annData, feedbackStats);
  }, [traceTrees, traces, feedbackStats]);

  // RMF scores
  const rmfScores: RmfScores = useMemo(() => {
    const builtInCount = 6;
    const customEvalCount = traceTrees.length > 0
      ? new Set(traceTrees.flatMap((t) => t.rootSpan.annotations.map((a) => a.name))).size - builtInCount
      : 0;
    const enabledEvalCount = new Set(
      traceTrees.flatMap((t) => t.rootSpan.annotations.map((a) => a.name))
    ).size;

    return {
      govern: computeGovernScore(enabledEvalCount, builtInCount + Math.max(0, customEvalCount), customEvalCount > 0),
      map: computeMapScore(rmfMetrics),
      measure: computeMeasureScore(rmfMetrics),
    };
  }, [rmfMetrics, traceTrees]);

  // Gap analysis data
  const gapData: GapDataItem[] = useMemo(() => {
    if (!rmfMetrics.length) return [];
    const categories: { system: string; metricIds: string[]; govScore: number }[] = [
      { system: "Factual Accuracy", metricIds: ["factual_rate"], govScore: 95 },
      { system: "QA Accuracy", metricIds: ["qa_accuracy"], govScore: 90 },
      { system: "Retrieval Relevance", metricIds: ["retrieval_relevance"], govScore: 20 },
      { system: "Safety", metricIds: ["safety_rate", "guardrail_pass"], govScore: 97 },
      { system: "Citation Accuracy", metricIds: ["citation_accuracy"], govScore: 85 },
      { system: "Performance", metricIds: ["latency_score", "success_rate"], govScore: 95 },
      { system: "Cost Efficiency", metricIds: ["token_score", "cost_score"], govScore: 80 },
      { system: "Tool Calling", metricIds: ["tool_calling_accuracy"], govScore: 60 },
    ];
    return categories.map((cat) => {
      const metrics = cat.metricIds.map((id) => rmfMetrics.find((m) => m.id === id)).filter(Boolean);
      const evalScore = metrics.length > 0
        ? Math.round(metrics.reduce((sum, m) => sum + m!.value, 0) / metrics.length)
        : 0;
      return { system: cat.system, govScore: cat.govScore, evalScore };
    });
  }, [rmfMetrics]);

  if (tracesLoading && !initialLoaded) {
    return <LoadingState className="h-full" />;
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header + Tab bar + Date picker */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            {!hideTabBar && (
              <div>
                <Heading level="page">{projectName}</Heading>
                <Text variant="body" className="text-muted-foreground">{t.projects.projectOverview}</Text>
              </div>
            )}
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          {!hideTabBar && (
          <div className="flex gap-1 border-b">
          {(["traces", "measure"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {{ traces: t.projects.traces, measure: t.projects.measure }[tab]}
            </button>
          ))}
          </div>
          )}
        </div>

        {/* Traces tab */}
        {activeTab === "traces" && (
        <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={traceCount.toLocaleString()}
                  label={t.projects.totalTraces}
                  trend={latencies.length > 0 ? `${latencies.length} ${t.projects.withLatency}` : undefined}
                />
              </div>
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={formatMs(avgLatency)}
                  label={t.projects.avgLatency}
                  trend={latencies.length > 0 ? `max ${formatMs(Math.max(...latencies))}` : undefined}
                />
              </div>
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={hasAnnotations ? avgScore.toFixed(2) : "-"}
                  label={t.projects.avgScore}
                  trend={hasAnnotations ? `${scores.length} ${t.projects.annotations}` : undefined}
                />
              </div>
              <div className="rounded-xl border bg-card h-28">
                <StatCard
                  value={(() => {
                    const withAnns = traceTrees.filter((t) => t.rootSpan.annotations.length > 0);
                    if (withAnns.length === 0) return "-";
                    const passed = withAnns.filter((t) => !t.rootSpan.annotations.some((a) => FAIL_LABELS.has(a.label))).length;
                    return `${Math.round((passed / withAnns.length) * 100)}%`;
                  })()}
                  label={t.projects.passRate}
                  trend={(() => {
                    const withAnns = traceTrees.filter((t) => t.rootSpan.annotations.length > 0);
                    if (withAnns.length === 0) return undefined;
                    const passed = withAnns.filter((t) => !t.rootSpan.annotations.some((a) => FAIL_LABELS.has(a.label))).length;
                    return `${passed} / ${withAnns.length} ${t.projects.tracesCount}`;
                  })()}
                />
              </div>
            </div>

            {/* Charts */}
            {traces.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
                <div className="rounded-xl border bg-card h-64">
                  <HighchartWidget options={buildLatencyChartOptions(traces)} />
                </div>
                {hasAnnotations && (
                  <div className="rounded-xl border bg-card h-64">
                    <HighchartWidget options={buildScoreChartOptions(traces)} />
                  </div>
                )}
                {hasAnnotations && (
                  <div className="rounded-xl border bg-card h-64">
                    <HighchartWidget options={buildPassFailChartOptions(traces)} />
                  </div>
                )}
              </div>
            )}

            {/* Trace list */}
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Heading level="section">{t.projects.traces}</Heading>
                  <Text variant="body" className="text-muted-foreground">
                    {hasActiveFilters
                      ? `${filteredTraceTrees.length} / ${traceTrees.length} ${t.projects.tracesCount}`
                      : t.projects.recentRequests}
                  </Text>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleGate>
                    <button
                      onClick={sel.toggleDeleteMode}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${sel.deleteMode ? "border-primary bg-accent" : "hover:bg-muted"}`}
                      title={t.tracing.deleteTraces}
                    >
                      <Trash2 className={`h-3.5 w-3.5 ${sel.deleteMode ? "text-foreground" : "text-muted-foreground"}`} />
                    </button>
                  </RoleGate>
                  <button
                    onClick={filterDropdown.toggle}
                    className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                      filterDropdown.isOpen || hasActiveFilters ? "border-primary bg-accent" : "hover:bg-muted"
                    }`}
                  >
                    <Filter className="h-3 w-3" />
                    {t.common.filter}
                    {hasActiveFilters && (
                      <span className="rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {queryAST.tokens.filter((tk) => tk.kind !== "error").length}
                      </span>
                    )}
                  </button>
                  {hasActiveFilters && (
                    <button
                      onClick={() =>
                        handleQueryChange({ tokens: [], annotationCombinator: "AND" })
                      }
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t.projects.clear}
                    </button>
                  )}
                </div>
              </div>

              {/* Query bar — full width, two-way synced with chips */}
              <div className="mt-3">
                <QueryBar
                  ast={queryAST}
                  onChange={handleQueryChange}
                  knownAnnotations={knownAnnotations}
                />
              </div>

              {/* Chip row — same AST, click-to-toggle */}
              {filterDropdown.isOpen && (
                <ChipRow
                  ast={queryAST}
                  knownAnnotations={knownAnnotations}
                  onChange={handleQueryChange}
                />
              )}
            </div>

            {sel.deleteMode && (
              <div
                className={`mb-2 flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2 ${sel.deleteModeVisible ? "animate-slide-down" : "animate-slide-up"}`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={sel.selectedIds.size === filteredTraceTrees.length && filteredTraceTrees.length > 0}
                    onChange={() => sel.toggleSelectAll(filteredTraceTrees.map((tr) => tr.traceId))}
                    className="rounded"
                  />
                  {t.common.selectAll}
                </label>
                <button
                  onClick={handleDeleteSelected}
                  disabled={sel.selectedIds.size === 0 || deleting}
                  className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1 text-xs font-medium text-background transition hover:bg-foreground/80 disabled:opacity-30"
                >
                  <Trash2 className="h-3 w-3" />
                  {deleting ? t.tracing.deleting : `${t.common.delete} ${sel.selectedIds.size}`}
                </button>
              </div>
            )}

            {filteredTraceTrees.length === 0 ? (
              <EmptyState
                icon={Search}
                title={traces.length === 0 ? t.projects.noTracesFound : t.projects.noTracesMatch}
                description={traces.length === 0 ? t.projects.noTracesYet : t.projects.adjustFilters}
                className="py-12"
              />
            ) : (
              <SpanTreeView
                traces={filteredTraceTrees}
                projectName={projectName}
                onRefresh={loadTraces}
                onDeleted={(traceId) => removeTraces([traceId])}
                deleteMode={sel.deleteMode}
                deleteModeVisible={sel.deleteModeVisible}
                selectedIds={sel.selectedIds}
                onToggleSelect={sel.toggleSelect}
              />
            )}
          </>
        )}

        {/* MEASURE tab */}
        {activeTab === "measure" && (
          <div className="space-y-6">
            <RmfFunctionCards scores={rmfScores} />
            <MeasureGrid metrics={rmfMetrics} />
            <GapAnalysis data={gapData} />
          </div>
        )}
      </div>
    </div>
  );
}
