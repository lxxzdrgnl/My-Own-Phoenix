"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ScoreRange, EvalFormConfig } from "./types";

interface ScoreRangesSectionProps {
  config: EvalFormConfig;
  onAddRange: () => void;
  onUpdateRange: (id: string, partial: Partial<ScoreRange>) => void;
  onRemoveRange: (id: string) => void;
}

export function ScoreRangesSection({
  config,
  onAddRange,
  onUpdateRange,
  onRemoveRange,
}: ScoreRangesSectionProps) {
  const t = useT();

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t.promptBuilder.scoreRanges}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={onAddRange}
          className="h-6 text-[11px] gap-1"
        >
          <Plus className="size-3" /> {t.promptBuilder.addRange}
        </Button>
      </div>

      {/* Visual score bar */}
      <div className="mb-4 h-3 flex rounded-full overflow-hidden border">
        {[...config.scoreRanges]
          .sort((a, b) => a.min - b.min)
          .map((range, i) => {
            const width = ((range.max - range.min + 0.1) / 1.1) * 100;
            const shades = [
              "bg-neutral-900 dark:bg-neutral-100",
              "bg-neutral-700 dark:bg-neutral-300",
              "bg-neutral-500",
              "bg-neutral-300 dark:bg-neutral-700",
              "bg-neutral-100 dark:bg-neutral-900",
            ];
            return (
              <div
                key={range.id}
                className={cn("h-full", shades[i % shades.length])}
                style={{ width: `${Math.max(width, 5)}%` }}
                title={`${range.min.toFixed(1)}-${range.max.toFixed(1)}: ${range.label}`}
              />
            );
          })}
      </div>

      {/* Range rows */}
      <div className="space-y-2">
        {[...config.scoreRanges]
          .sort((a, b) => b.max - a.max)
          .map((range) => (
            <div
              key={range.id}
              className="flex items-center gap-2 rounded-md border bg-muted/10 px-3 py-2"
            >
              <GripVertical className="size-3 text-muted-foreground/30 shrink-0" />
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={range.min}
                onChange={(e) =>
                  onUpdateRange(range.id, { min: parseFloat(e.target.value) || 0 })
                }
                className="h-7 w-16 text-xs text-center tabular-nums"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={range.max}
                onChange={(e) =>
                  onUpdateRange(range.id, { max: parseFloat(e.target.value) || 0 })
                }
                className="h-7 w-16 text-xs text-center tabular-nums"
              />
              <Input
                value={range.label}
                onChange={(e) => onUpdateRange(range.id, { label: e.target.value })}
                placeholder={t.promptBuilder.label}
                className="h-7 w-28 text-xs"
              />
              <Input
                value={range.meaning}
                onChange={(e) => onUpdateRange(range.id, { meaning: e.target.value })}
                placeholder="Description..."
                className="h-7 flex-1 text-xs"
              />
              <button
                onClick={() => onRemoveRange(range.id)}
                disabled={config.scoreRanges.length <= 2}
                className={cn(
                  "shrink-0 rounded p-1 transition-colors",
                  config.scoreRanges.length <= 2
                    ? "opacity-20 cursor-not-allowed"
                    : "hover:bg-muted",
                )}
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
