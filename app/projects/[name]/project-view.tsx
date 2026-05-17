"use client";
import { apiFetch } from "@/lib/api-client";
import { useT } from "@/lib/i18n";

import { useEffect, useState, useCallback, useMemo } from "react";
import { FAIL_LABELS } from "@/lib/constants";
import { fetchTraces, fetchTraceTrees, type Trace, type TraceTree } from "@/lib/phoenix";
import { SpanTreeView } from "@/components/span-tree-view";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";
import { MeasureGrid } from "@/components/dashboard/widgets/measure-grid";
import { RmfFunctionCards } from "@/components/dashboard/widgets/rmf-function-card";
import { GapAnalysis, type GapDataItem } from "@/components/dashboard/widgets/gap-analysis";
import { ManageView } from "@/components/dashboard/widgets/manage-view";
import { computeMetrics, computeGovernScore, computeMapScore, computeMeasureScore, computeManageScore, type FeedbackStats, type RmfScores } from "@/lib/rmf-utils";
import type { AnnotationData, SpanData } from "@/lib/dashboard-utils";
import { cn } from "@/lib/utils";
import { Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";


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
      { name: "Latency", type: "area", data: sorted.map((t) => Math.round(t.latency)) },
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
    series: [{ name: "Avg Score", type: "column", data: avgScores }],
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
      { name: "Pass", type: "bar", data: categories.map((n) => byName[n].pass), color: "#d4d4d4" },
      { name: "Fail", type: "bar", data: categories.map((n) => byName[n].fail), color: "#171717" },
    ],
  };
}

export function ProjectView({ projectName, defaultTab = "traces", hideTabBar = false }: { projectName: string; defaultTab?: "traces" | "measure" | "risk"; hideTabBar?: boolean }) {
  const t = useT();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [traceTrees, setTraceTrees] = useState<TraceTree[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [annotationFilter, setAnnotationFilter] = useState<"all" | "pass" | "fail" | "none">("all");
  const [latencyFilter, setLatencyFilter] = useState<"all" | "fast" | "medium" | "slow">("all");
  const [activeTab, setActiveTab] = useState<"traces" | "measure" | "risk">(defaultTab);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(7));

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
    } catch (e) {
      console.error(e);
    }
    setTracesLoading(false);
  }, [projectName, dateRange]);

  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  // ── Filtering ──
  const GOOD_LABELS = ["factual", "correct", "clean", "relevant"];

  const filteredTraces = traces.filter((tr) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!tr.query.toLowerCase().includes(q) && !tr.response.toLowerCase().includes(q)) return false;
    }
    if (annotationFilter === "none") {
      if (tr.annotations.length > 0) return false;
    } else if (annotationFilter === "pass") {
      if (tr.annotations.length === 0) return false;
      if (!tr.annotations.every((a) => GOOD_LABELS.includes(a.label) || a.score >= 0.8)) return false;
    } else if (annotationFilter === "fail") {
      if (tr.annotations.length === 0) return false;
      if (!tr.annotations.some((a) => !GOOD_LABELS.includes(a.label) && a.score < 0.8)) return false;
    }
    if (latencyFilter === "fast" && tr.latency >= 1000) return false;
    if (latencyFilter === "medium" && (tr.latency < 1000 || tr.latency >= 3000)) return false;
    if (latencyFilter === "slow" && tr.latency < 3000) return false;
    return true;
  });

  const hasActiveFilters = searchQuery !== "" || annotationFilter !== "all" || latencyFilter !== "all";

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
    } catch (e) { console.error(e); }
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

  // Risk stats
  const [riskStats, setRiskStats] = useState({ total: 0, mitigated: 0, openIncidents: 0 });
  const loadRiskStats = useCallback(async () => {
    try {
      const [risksRes, incidentsRes] = await Promise.all([
        apiFetch(`/api/risks?projectId=${encodeURIComponent(projectName)}`).then((r) => r.json()).catch(() => ({ risks: [] })),
        apiFetch(`/api/incidents?projectId=${encodeURIComponent(projectName)}`).then((r) => r.json()).catch(() => ({ incidents: [] })),
      ]);
      const risks = risksRes.risks ?? [];
      const incidents = incidentsRes.incidents ?? [];
      setRiskStats({
        total: risks.length,
        mitigated: risks.filter((r: any) => r.status === "MITIGATED").length,
        openIncidents: incidents.filter((i: any) => i.status !== "RESOLVED").length,
      });
    } catch (e) { console.error(e); }
  }, [projectName]);
  useEffect(() => { loadRiskStats(); }, [loadRiskStats]);

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
      manage: computeManageScore(riskStats.total, riskStats.mitigated, riskStats.openIncidents),
    };
  }, [rmfMetrics, traceTrees, riskStats]);

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

  if (tracesLoading) {
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
                <h1 className="text-xl font-semibold tracking-tight">{projectName}</h1>
                <p className="text-sm text-muted-foreground">{t.projects.projectOverview}</p>
              </div>
            )}
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          {!hideTabBar && (
          <div className="flex gap-1 border-b">
          {(["traces", "measure", "risk"] as const).map((tab) => (
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
              {{ traces: t.projects.traces, measure: t.projects.measure, risk: t.projects.riskManagement }[tab]}
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{t.projects.traces}</h2>
                  <p className="text-sm text-muted-foreground">
                    {hasActiveFilters
                      ? `${filteredTraces.length} / ${traces.length} ${t.projects.tracesCount}`
                      : t.projects.recentRequests}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t.projects.searchTraces}
                      className="h-8 w-48 pl-8 text-xs"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>
                  {/* Filter toggle */}
                  <button
                    onClick={() => setFilterOpen(!filterOpen)}
                    className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                      filterOpen || hasActiveFilters ? "border-primary bg-accent" : "hover:bg-muted"
                    }`}
                  >
                    <Filter className="h-3 w-3" />
                    {t.common.filter}
                    {hasActiveFilters && (
                      <span className="rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {[annotationFilter !== "all", latencyFilter !== "all"].filter(Boolean).length}
                      </span>
                    )}
                  </button>
                  {hasActiveFilters && (
                    <button
                      onClick={() => { setSearchQuery(""); setAnnotationFilter("all"); setLatencyFilter("all"); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t.projects.clear}
                    </button>
                  )}
                </div>
              </div>

              {/* Filter panel */}
              {filterOpen && (
                <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 px-4 py-3">
                  {/* Annotation */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.projects.annotation}</p>
                    <div className="flex gap-1">
                      {(["all", "pass", "fail", "none"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setAnnotationFilter(v)}
                          className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                            annotationFilter === v
                              ? "border-foreground bg-foreground text-background"
                              : "hover:bg-muted"
                          }`}
                        >
                          {v === "all" ? t.projects.all : v === "pass" ? t.projects.pass : v === "fail" ? t.projects.fail : t.projects.noAnnotation}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Latency */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.projects.latency}</p>
                    <div className="flex gap-1">
                      {([
                        { v: "all", l: t.projects.all },
                        { v: "fast", l: "<1s" },
                        { v: "medium", l: "1-3s" },
                        { v: "slow", l: ">3s" },
                      ] as const).map(({ v, l }) => (
                        <button
                          key={v}
                          onClick={() => setLatencyFilter(v)}
                          className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                            latencyFilter === v
                              ? "border-foreground bg-foreground text-background"
                              : "hover:bg-muted"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {traceTrees.length === 0 ? (
              <EmptyState
                icon={Search}
                title={traces.length === 0 ? t.projects.noTracesFound : t.projects.noTracesMatch}
                description={traces.length === 0 ? t.projects.noTracesYet : t.projects.adjustFilters}
                className="py-12"
              />
            ) : (
              <SpanTreeView traces={traceTrees} projectName={projectName} onRefresh={loadTraces} />
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

        {/* Risk tab */}
        {activeTab === "risk" && (
          <ManageView projectId={projectName} />
        )}
      </div>
    </div>
  );
}
