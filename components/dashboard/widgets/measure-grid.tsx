"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { MEASURE_METRICS, MetricValue, STATUS_COLORS } from "@/lib/rmf-utils";

interface MeasureGridProps {
  metrics: MetricValue[];
  className?: string;
}

const METRIC_LABEL_KEYS: Record<string, string> = {
  factual_rate: "hallucinationEval",
  safety_rate: "toxicityEval",
  qa_accuracy: "qaEval",
  retrieval_relevance: "relevanceEval",
  latency_score: "spanDuration",
  success_rate: "statusCode",
  token_score: "tokenCount",
  cost_score: "llmCost",
  user_satisfaction: "feedbackEval",
  tool_calling_accuracy: "toolCallingEval",
  guardrail_pass: "guardrailEval",
  citation_accuracy: "citationEval",
};

const METRIC_DESC_KEYS: Record<string, string> = {
  factual_rate: "factualRateDesc",
  safety_rate: "safetyRateDesc",
  qa_accuracy: "qaAccuracyDesc",
  retrieval_relevance: "retrievalRelevanceDesc",
  latency_score: "latencyScoreDesc",
  success_rate: "successRateDesc",
  token_score: "tokenScoreDesc",
  cost_score: "costScoreDesc",
  user_satisfaction: "userSatisfactionDesc",
  tool_calling_accuracy: "toolCallingDesc",
  guardrail_pass: "guardrailPassDesc",
  citation_accuracy: "citationAccuracyDesc",
};

export function MeasureGrid({ metrics, className }: MeasureGridProps) {
  const t = useT();

  return (
    <div className={cn("grid grid-cols-4 gap-4 p-4", className)}>
      {metrics.map((metric) => {
        const def = MEASURE_METRICS.find((m) => m.id === metric.id);
        if (!def) return null;

        const dotColor = STATUS_COLORS[metric.status];
        const labelKey = METRIC_LABEL_KEYS[metric.id];
        const descKey = METRIC_DESC_KEYS[metric.id];
        const measureT = t.measure as Record<string, string>;
        const label = labelKey ? measureT[labelKey] : def.engLabel;
        const description = descKey ? measureT[descKey] : def.description;

        return (
          <div
            key={metric.id}
            className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
          >
            {/* Header: status dot + label */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block shrink-0 rounded-full"
                style={{
                  width: "0.625rem",
                  height: "0.625rem",
                  backgroundColor: dotColor,
                }}
              />
              <span className="text-sm font-semibold text-foreground truncate">
                {label}
              </span>
            </div>

            {/* Large value */}
            <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {metric.formatted}
            </span>

            {/* Metric ID */}
            <span className="text-xs text-muted-foreground font-medium">
              {def.id}
            </span>

            {/* Description */}
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
