"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  getGapStatus,
  GAP_STATUS_COLORS,
  GapStatus,
} from "@/lib/rmf-utils";
import { HighchartWidget } from "@/components/dashboard/widgets/highchart-widget";

export interface GapDataItem {
  system: string;
  govScore: number;
  evalScore: number;
}

interface GapAnalysisProps {
  data: GapDataItem[];
  className?: string;
}

function getTranslatedAction(status: GapStatus, t: ReturnType<typeof useT>): string {
  switch (status) {
    case "NORMAL":
      return t.measure.actionNormal;
    case "WARNING":
      return t.measure.actionWarning;
    case "CRITICAL":
      return t.measure.actionCritical;
  }
}

export function GapAnalysis({ data, className }: GapAnalysisProps) {
  const t = useT();

  // Sort worst-first: largest negative gap (evalScore - govScore) first
  const sorted = [...data].sort(
    (a, b) => (a.evalScore - a.govScore) - (b.evalScore - b.govScore)
  );

  const categories = sorted.map((d) => d.system);
  const govSeries = sorted.map((d) => d.govScore);
  const evalSeries = sorted.map((d) => d.evalScore);

  const chartOptions: Highcharts.Options = {
    chart: { type: "column" },
    title: { text: t.measure.chartTitle },
    xAxis: {
      categories,
      labels: { rotation: -45 },
    },
    yAxis: {
      min: 0,
      max: 100,
      title: { text: t.measure.score },
    },
    colors: ["#3b82f6", "#a1a1aa"],
    series: [
      {
        type: "column",
        name: t.measure.govScoreLegend,
        data: govSeries,
        color: "#3b82f6",
      },
      {
        type: "column",
        name: t.measure.evalScoreLegend,
        data: evalSeries,
        color: "#a1a1aa",
      },
    ],
    legend: { enabled: true },
  };

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Chart */}
      <div className="h-64 w-full">
        <HighchartWidget options={chartOptions} />
      </div>

      {/* Risk table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                {t.measure.risk}
              </th>
              <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide" style={{ color: "#3b82f6" }}>
                {t.measure.govScore}
              </th>
              <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide" style={{ color: "#a1a1aa" }}>
                {t.measure.evalScore}
              </th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                {t.measure.gap}
              </th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                {t.measure.status}
              </th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                {t.measure.recommendedAction}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => {
              const noEvalData = item.evalScore === 0;
              const gap = noEvalData ? 0 : item.evalScore - item.govScore;
              const status: GapStatus = noEvalData ? "NORMAL" : getGapStatus(gap);
              const badgeColor = noEvalData ? "#a1a1aa" : GAP_STATUS_COLORS[status];
              const statusLabel = noEvalData ? "N/A" : status;
              const action = noEvalData ? t.measure.noEvalData : getTranslatedAction(status, t);

              return (
                <tr
                  key={item.system}
                  className={cn(
                    "border-b border-border last:border-0",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {item.system}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "#3b82f6" }}>
                    {item.govScore.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "#a1a1aa" }}>
                    {noEvalData ? "N/A" : item.evalScore.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {noEvalData ? "\u2014" : `${gap >= 0 ? "+" : ""}${gap.toFixed(1)}`}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: badgeColor }}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">
                    {action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
