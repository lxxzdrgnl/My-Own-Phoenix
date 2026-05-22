"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { apiFetch } from "@/lib/api-client";
import { useT } from "@/lib/i18n";

interface BackfillResult {
  evaluated: number;
  skipped: number;
  total: number;
}

interface EvalBackfillPanelProps {
  selectedEval: string | null;
  projectId: string | undefined;
  editTemplate: string;
  editEvalType?: string;
  hasRules?: boolean;
}

export function EvalBackfillPanel({
  selectedEval,
  projectId,
  editTemplate,
  editEvalType = "llm_prompt",
  hasRules = false,
}: EvalBackfillPanelProps) {
  const t = useT();
  const [backfillRange, setBackfillRange] = useState<DateRange>(() => getPresetRange(7));
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  const isCodeRule = editEvalType === "code_rule";
  const isRunnable = isCodeRule ? hasRules : !!editTemplate;

  async function handleBackfill() {
    if (!selectedEval || !projectId) return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await apiFetch("/api/eval-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          evalName: selectedEval,
          startDate: backfillRange.from.toISOString().split("T")[0],
          endDate: backfillRange.to.toISOString().split("T")[0],
        }),
      });
      const data = await res.json();
      setBackfillResult(data);
    } catch {
      setBackfillResult({ evaluated: 0, skipped: 0, total: 0 });
    }
    setBackfilling(false);
  }

  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border bg-muted/10 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw
            className={cn(
              "size-3.5 text-muted-foreground shrink-0",
              backfilling && "animate-spin"
            )}
          />
          <span className="text-xs font-semibold">{t.evaluations.runOnExistingTraces}</span>
          {backfillResult && (
            <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
              {backfillResult.evaluated} {t.evaluations.evaluated}, {backfillResult.skipped} {t.evaluations.skipped} /{" "}
              {backfillResult.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={backfillRange} onChange={setBackfillRange} />
          <Button
            size="sm"
            variant="outline"
            onClick={handleBackfill}
            disabled={backfilling || !isRunnable}
            className="gap-1.5 text-xs h-8 shrink-0"
          >
            {backfilling ? t.common.running : t.common.run}
          </Button>
        </div>
      </div>
    </div>
  );
}
