import {
  SpanData,
  AnnotationData,
  avg,
  pct,
  percentile,
  errorCount,
  llmFilter,
  calcCost,
  sum,
} from "@/lib/dashboard-utils";

// ─── Types ───

export type StatusLevel = "green" | "yellow" | "red";
export type GapStatus = "NORMAL" | "WARNING" | "CRITICAL";

export interface MeasureMetricDef {
  id: string;
  label: string;
  engLabel: string;
  description: string;
  unit: string;
  lowerIsBetter: boolean;
  threshold: {
    green: (v: number) => boolean;
    yellow: (v: number) => boolean;
  };
}

export interface MetricValue {
  id: string;
  value: number;
  noData?: boolean;
  formatted: string;
  status: StatusLevel;
}

// ─── Metric definitions ───

// All metrics unified: higher = better (0-100%)
export const MEASURE_METRICS: MeasureMetricDef[] = [
  {
    id: "factual_rate",
    label: "Factual Rate",
    engLabel: "Hallucination Eval",
    description: "Rate of factually accurate responses. 100% = no hallucinations.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 90, yellow: (v) => v > 75 },
  },
  {
    id: "safety_rate",
    label: "Safety Rate",
    engLabel: "Toxicity Eval",
    description: "Rate of safe, non-toxic responses. 100% = no banned words detected.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 95, yellow: (v) => v > 85 },
  },
  {
    id: "qa_accuracy",
    label: "QA Accuracy",
    engLabel: "QA Eval",
    description: "Rate of correct answers. Label-based (correct/incorrect).",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 80, yellow: (v) => v > 60 },
  },
  {
    id: "retrieval_relevance",
    label: "Retrieval Relevance",
    engLabel: "Relevance Eval",
    description: "How well retrieved documents support the query. 70%+ = at least 1 relevant doc.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 35, yellow: (v) => v > 20 },
  },
  {
    id: "latency_score",
    label: "Latency Score",
    engLabel: "Span Duration",
    description: "Response speed. 100% = p95 under 15s, 0% = over 60s.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 70, yellow: (v) => v > 40 },
  },
  {
    id: "success_rate",
    label: "Success Rate",
    engLabel: "status_code",
    description: "API call success rate. 100% = no errors.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 95, yellow: (v) => v > 85 },
  },
  {
    id: "token_score",
    label: "Token Score",
    engLabel: "token_count",
    description: "Token efficiency. 100% = avg under 2K, 0% = over 10K.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 60, yellow: (v) => v > 30 },
  },
  {
    id: "cost_score",
    label: "Cost Score",
    engLabel: "llm.cost.total",
    description: "Cost efficiency. 100% = under $10/day, 0% = over $200/day.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 50, yellow: (v) => v > 20 },
  },
  {
    id: "user_satisfaction",
    label: "User Satisfaction",
    engLabel: "Feedback Eval",
    description: "Rate of positive user feedback. Based on thumbs up/down.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 85, yellow: (v) => v > 70 },
  },
  {
    id: "tool_calling_accuracy",
    label: "Tool Accuracy",
    engLabel: "Tool Calling Eval",
    description: "Average tool/retrieval appropriateness score.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 60, yellow: (v) => v > 40 },
  },
  {
    id: "guardrail_pass",
    label: "Guardrail Pass",
    engLabel: "Guardrail Eval",
    description: "Rate of responses passing safety guardrails (PII, tone, harmful advice).",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 95, yellow: (v) => v > 85 },
  },
  {
    id: "citation_accuracy",
    label: "Citation Accuracy",
    engLabel: "Citation Eval",
    description: "Average context faithfulness score. 100% = fully grounded.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 70, yellow: (v) => v > 50 },
  },
  // ── 금융 AI RMF 전용 eval 지표 (score 1=양호) ──
  {
    id: "bias_rate",
    label: "Bias-Free Rate",
    engLabel: "Bias Eval",
    description: "편향 없는 응답 비율 (신뢰성·편향성). 100% = 편향 없음.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 90, yellow: (v) => v > 75 },
  },
  {
    id: "fairness_rate",
    label: "Fairness Rate",
    engLabel: "Fairness Eval",
    description: "공정한 응답 비율 (신뢰성·공정성). 100% = 차별 없음.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 90, yellow: (v) => v > 75 },
  },
  {
    id: "explainability_rate",
    label: "Explainability Rate",
    engLabel: "Explainability Eval",
    description: "근거를 이해가능하게 설명하는 비율 (신뢰성·설명가능성).",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 80, yellow: (v) => v > 60 },
  },
  {
    id: "consumer_protection_rate",
    label: "Consumer Protection Rate",
    engLabel: "Consumer Protection Eval",
    description: "소비자보호 적정 응답 비율 (신의성실). 100% = 오인·불완전판매 없음.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 90, yellow: (v) => v > 75 },
  },
  {
    id: "legal_compliance_rate",
    label: "Legal Compliance Rate",
    engLabel: "Legal Compliance Eval",
    description: "법규 위반 신호 없는 응답 비율 (합법성). 100% = red flag 없음.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 95, yellow: (v) => v > 85 },
  },
  {
    id: "transparency_rate",
    label: "Transparency Rate",
    engLabel: "Transparency Eval",
    description: "투명성·책임 적정 응답 비율 (신의성실). 100% = 권한·책임 오인 없음.",
    unit: "%",
    lowerIsBetter: false,
    threshold: { green: (v) => v > 85, yellow: (v) => v > 70 },
  },
];

// ─── Status helpers ───

export function getStatus(metric: MeasureMetricDef, value: number): StatusLevel {
  if (metric.threshold.green(value)) return "green";
  if (metric.threshold.yellow(value)) return "yellow";
  return "red";
}

export const STATUS_COLORS: Record<StatusLevel, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
};

// ─── Format helpers ───

function formatValue(value: number, _unit: string): string {
  return `${value.toFixed(1)}%`;
}

// ─── Annotation rate helper ───

function annotationRate(
  annotations: AnnotationData[],
  name: string,
  label: string,
): number {
  const matching = annotations.filter((a) => a.name === name);
  if (matching.length === 0) return 0;
  const triggered = matching.filter((a) => a.label === label).length;
  return pct(triggered, matching.length);
}

function annotationAvgScore(annotations: AnnotationData[], name: string): number {
  const matching = annotations.filter((a) => a.name === name);
  return avg(matching.map((a) => a.score));
}

// ─── Compute metrics ───

export interface FeedbackStats {
  downCount: number;
  total: number;
}

export function computeMetrics(
  spans: SpanData[],
  annotations: AnnotationData[],
  feedbackStats?: FeedbackStats,
): MetricValue[] {
  const llmSpans = llmFilter(spans);

  // Helper: clamp 0-100
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  // All values normalized to 0-100, higher = better. -1 = no data.
  // Helper: annotation pass rate (label-based) — returns -1 if no data, excludes cancelled
  const annotationPassRate = (name: string, failLabel: string): number => {
    const matching = annotations.filter((a) => a.name === name && a.label !== "cancelled");
    if (matching.length === 0) return -1;
    return clamp(100 - pct(matching.filter((a) => a.label === failLabel).length, matching.length));
  };
  // Helper: annotation avg score — returns -1 if no data, excludes cancelled
  const annotationScorePercent = (name: string): number => {
    const matching = annotations.filter((a) => a.name === name && a.label !== "cancelled");
    if (matching.length === 0) return -1;
    return clamp(avg(matching.map((a) => a.score)) * 100);
  };

  const rawValues: Record<string, number> = {
    // 100 - hallucination rate (label-based)
    factual_rate: annotationPassRate("hallucination", "hallucinated"),
    // 100 - toxicity rate (label-based)
    safety_rate: annotationPassRate("banned_word", "detected"),
    // QA: label-based pass rate (correct/incorrect)
    qa_accuracy: annotationPassRate("qa_correctness", "incorrect"),
    // RAG relevance: score-based average
    retrieval_relevance: annotationScorePercent("rag_relevance"),
    // Latency: 100% if p95 ≤ 15s, 0% if ≥ 60s
    latency_score: llmSpans.length === 0 ? -1 : clamp((() => {
      const p95 = percentile(llmSpans, 0.95) / 1000;
      if (p95 <= 0) return 100;
      return 100 - ((p95 - 15) / 45) * 100;
    })()),
    // 100 - error rate
    success_rate: spans.length === 0 ? -1 : clamp(100 - pct(errorCount(spans), spans.length)),
    // Token: 100% if avg ≤ 2000, 0% if ≥ 10000
    token_score: llmSpans.length === 0 ? -1 : clamp((() => {
      const avgTokens = avg(llmSpans.map((s) => s.totalTokens));
      if (avgTokens <= 0) return 100;
      if (avgTokens <= 2000) return 100;
      return 100 - ((avgTokens - 2000) / 8000) * 100;
    })()),
    // Cost: 100% if ≤ $10/day, 0% if ≥ $200/day
    cost_score: llmSpans.length === 0 ? -1 : clamp((() => {
      const totalCost = sum(llmSpans.map((s) => calcCost(s)));
      if (totalCost <= 10) return 100;
      return 100 - ((totalCost - 10) / 190) * 100;
    })()),
    // User satisfaction: -1 if no feedback data
    user_satisfaction: feedbackStats && feedbackStats.total > 0
      ? clamp(100 - pct(feedbackStats.downCount, feedbackStats.total))
      : -1,
    // Tool calling: score-based average
    tool_calling_accuracy: annotationScorePercent("tool_calling"),
    // Guardrail: dedicated eval, fallback to banned_word+hallucination combo
    guardrail_pass: (() => {
      const grd = annotations.filter((a) => a.name === "guardrail");
      if (grd.length > 0) {
        const passed = grd.filter((a) => a.label === "passed").length;
        return clamp(pct(passed, grd.length));
      }
      const bw = annotations.filter((a) => a.name === "banned_word");
      const hal = annotations.filter((a) => a.name === "hallucination");
      if (bw.length === 0 && hal.length === 0) return -1;
      const total = Math.max(bw.length, hal.length);
      const triggered = new Set<string>();
      for (const a of bw) if (a.label === "detected") triggered.add(a.time);
      for (const a of hal) if (a.score > 0.5) triggered.add(a.time);
      return clamp(100 - pct(triggered.size, total));
    })(),
    // Citation: score-based average
    citation_accuracy: annotationScorePercent("citation"),
    // ── 금융 AI RMF 전용 eval (score-based average, 1=양호) ──
    bias_rate: annotationScorePercent("bias"),
    fairness_rate: annotationScorePercent("fairness"),
    explainability_rate: annotationScorePercent("explainability"),
    consumer_protection_rate: annotationScorePercent("consumer_protection"),
    legal_compliance_rate: annotationScorePercent("legal_compliance"),
    transparency_rate: annotationScorePercent("transparency"),
  };

  return MEASURE_METRICS.map((metric) => {
    const raw = rawValues[metric.id] ?? 0;
    const noData = raw === -1;
    const value = noData ? 0 : raw;
    return {
      id: metric.id,
      value,
      noData,
      formatted: noData ? "N/A" : formatValue(value, metric.unit),
      status: noData ? "green" as StatusLevel : getStatus(metric, value),
    };
  });
}

// ─── RMF Function Scores ───

export interface RmfScores {
  govern: number;  // 0-100
  map: number;     // 0-100
  measure: number; // 0-100
}

/** GOVERN: How well is AI governance configured for this project? */
export function computeGovernScore(enabledEvalCount: number, totalEvalCount: number, hasCustomEvals: boolean): number {
  if (totalEvalCount === 0) return 0;
  // Built-in only = baseline 40%, need custom evals + more coverage to go higher
  let score = 20;
  // Each enabled eval adds points (max 40 from evals)
  score += Math.min(40, (enabledEvalCount / totalEvalCount) * 40);
  // Custom evals show proactive governance (+20)
  if (hasCustomEvals) score += 20;
  // Having 5+ evals shows comprehensive coverage (+20)
  if (enabledEvalCount >= 5) score += 10;
  if (enabledEvalCount >= 8) score += 10;
  return Math.min(100, Math.round(score));
}

/** MAP: How well are risks identified? Only count categories with green/yellow status */
export function computeMapScore(metrics: MetricValue[]): number {
  if (metrics.length === 0) return 0;
  const categories = [
    { ids: ["factual_rate"], name: "Accuracy" },
    { ids: ["safety_rate", "guardrail_pass"], name: "Safety" },
    { ids: ["qa_accuracy"], name: "Quality" },
    { ids: ["retrieval_relevance"], name: "Retrieval" },
    { ids: ["citation_accuracy"], name: "Citation" },
    { ids: ["latency_score", "success_rate"], name: "Performance" },
    { ids: ["token_score", "cost_score"], name: "Cost" },
    { ids: ["tool_calling_accuracy"], name: "Tool Usage" },
  ];
  // Only count categories where at least one metric is green
  const covered = categories.filter((cat) =>
    cat.ids.some((id) => {
      const m = metrics.find((met) => met.id === id);
      return m && m.status === "green";
    })
  ).length;
  return Math.round((covered / categories.length) * 100);
}

/** MEASURE: Average of all metric values (0-100) */
export function computeMeasureScore(metrics: MetricValue[]): number {
  if (metrics.length === 0) return 0;
  const total = metrics.reduce((sum, m) => sum + m.value, 0);
  return Math.round(total / metrics.length);
}

// ─── Gap status ───

export function getGapStatus(gap: number): GapStatus {
  if (gap > -5) return "NORMAL";
  if (gap >= -15) return "WARNING";
  return "CRITICAL";
}

export const GAP_STATUS_COLORS: Record<GapStatus, string> = {
  NORMAL: "#10b981",
  WARNING: "#f59e0b",
  CRITICAL: "#ef4444",
};

export function getRecommendedAction(status: GapStatus): string {
  switch (status) {
    case "NORMAL":
      return "Maintain current level. Continue regular monitoring.";
    case "WARNING":
      return "Metrics are drifting from target. Identify root cause and establish an improvement plan.";
    case "CRITICAL":
      return "Immediate action required. Escalate to relevant teams and initiate emergency response process.";
  }
}
