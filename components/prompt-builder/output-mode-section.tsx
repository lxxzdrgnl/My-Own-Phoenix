"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { EvalFormConfig } from "./types";

interface OutputModeSectionProps {
  config: EvalFormConfig;
  onUpdate: (partial: Partial<EvalFormConfig>) => void;
}

export function OutputModeSection({ config, onUpdate }: OutputModeSectionProps) {
  const t = useT();

  return (
    <div className="rounded-lg border p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
        {t.promptBuilder.outputMode}
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => onUpdate({ outputMode: "score" })}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            config.outputMode === "score" ? "border-foreground bg-accent" : "hover:bg-accent/50",
          )}
        >
          <p className="text-sm font-semibold">{t.promptBuilder.scoreModeTitle}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t.promptBuilder.scoreModeDesc}
          </p>
        </button>
        <button
          onClick={() => onUpdate({ outputMode: "binary" })}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            config.outputMode === "binary" ? "border-foreground bg-accent" : "hover:bg-accent/50",
          )}
        >
          <p className="text-sm font-semibold">{t.promptBuilder.binaryModeTitle}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t.promptBuilder.binaryModeDesc}
          </p>
        </button>
      </div>

      {/* Labels */}
      <div className={cn("grid gap-3", config.outputMode === "score" ? "grid-cols-3" : "grid-cols-2")}>
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">
            {config.outputMode === "binary" ? t.promptBuilder.trueLabel : t.promptBuilder.passLabel}
          </label>
          <Input
            value={config.passLabel}
            onChange={(e) => onUpdate({ passLabel: e.target.value })}
            className="h-8 text-xs"
            placeholder={config.outputMode === "binary" ? "true" : "pass"}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">
            {config.outputMode === "binary" ? t.promptBuilder.falseLabel : t.promptBuilder.failLabel}
          </label>
          <Input
            value={config.failLabel}
            onChange={(e) => onUpdate({ failLabel: e.target.value })}
            className="h-8 text-xs"
            placeholder={config.outputMode === "binary" ? "false" : "fail"}
          />
        </div>
        {config.outputMode === "score" && (
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">{t.promptBuilder.passThreshold}</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={config.passThreshold}
              onChange={(e) =>
                onUpdate({ passThreshold: parseFloat(e.target.value) || 0.5 })
              }
              className="h-8 text-xs tabular-nums"
            />
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {config.outputMode === "score"
          ? `Returns score 0.0-1.0. Scores above ${config.passThreshold} → "${config.passLabel}", below → "${config.failLabel}".`
          : `Returns "${config.passLabel}" or "${config.failLabel}" with explanation.`}
      </p>
    </div>
  );
}
