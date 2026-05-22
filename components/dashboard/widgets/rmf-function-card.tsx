"use client";

import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import type { RmfScores } from "@/lib/rmf-utils";

interface RmfFunctionCardsProps {
  scores: RmfScores;
  /** @deprecated use scores instead */
  measureScore?: number;
  className?: string;
}

interface FunctionDef {
  key: keyof RmfScores;
  nameKey: "govern" | "map" | "measureName";
  labelKey: "governLabel" | "mapLabel" | "measureLabel";
  descKey: "governDesc" | "mapDesc" | "measureDesc";
  formulaKey: "governFormula" | "mapFormula" | "measureFormula";
  color: string;
}

const RMF_FUNCTIONS: FunctionDef[] = [
  {
    key: "govern",
    nameKey: "govern",
    labelKey: "governLabel",
    descKey: "governDesc",
    formulaKey: "governFormula",
    color: "#3b82f6",
  },
  {
    key: "map",
    nameKey: "map",
    labelKey: "mapLabel",
    descKey: "mapDesc",
    formulaKey: "mapFormula",
    color: "#7c3aed",
  },
  {
    key: "measure",
    nameKey: "measureName",
    labelKey: "measureLabel",
    descKey: "measureDesc",
    formulaKey: "measureFormula",
    color: "#10b981",
  },
];

export function RmfFunctionCards({ scores, measureScore, className }: RmfFunctionCardsProps) {
  const t = useT();

  return (
    <div className={cn("grid grid-cols-3 gap-4 p-4", className)}>
      {RMF_FUNCTIONS.map((fn) => {
        const score = scores[fn.key] ?? (fn.key === "measure" ? measureScore : undefined);
        const display = score !== undefined ? `${score}%` : "\u2014";

        return (
          <div
            key={fn.key}
            className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
          >
            <div
              className="h-1.5 w-full shrink-0"
              style={{ backgroundColor: fn.color }}
            />
            <div className="flex flex-col gap-2 p-4 flex-1">
              <div className="flex items-center justify-between">
                <span
                  className="text-base font-bold tracking-wide"
                  style={{ color: fn.color }}
                >
                  {t.measure[fn.nameKey]}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-left">
                    <p className="font-semibold mb-1">{t.measure[fn.labelKey]}</p>
                    <p className="text-[11px] leading-relaxed opacity-80">{t.measure[fn.formulaKey]}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-sm font-medium text-foreground">
                {t.measure[fn.labelKey]}
              </span>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {display}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t.measure[fn.descKey]}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
