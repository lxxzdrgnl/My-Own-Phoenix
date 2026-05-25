"use client";

import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { EvalFormConfig } from "./types";

interface BadgePreviewSectionProps {
  config: EvalFormConfig;
  evalName: string;
  badgeLabel: string;
  onBadgeLabelChange?: (label: string) => void;
}

export function BadgePreviewSection({
  config,
  evalName,
  badgeLabel,
  onBadgeLabelChange,
}: BadgePreviewSectionProps) {
  const t = useT();

  return (
    <div className="rounded-lg border p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
        {t.promptBuilder.badgePreview}
      </p>
      <div className="flex items-center gap-4 mb-3">
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">{t.promptBuilder.shortName}</label>
          <Input
            value={badgeLabel}
            onChange={(e) => {
              const v = e.target.value.toUpperCase().slice(0, 4);
              onBadgeLabelChange?.(v);
            }}
            placeholder={evalName.slice(0, 3).toUpperCase()}
            className="h-8 w-24 text-xs font-mono uppercase"
            maxLength={4}
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground mb-1 block">{t.promptBuilder.preview}</label>
          <div className="flex items-center gap-3">
            {/* Pass example */}
            <span className="inline-flex items-center overflow-hidden rounded text-[9px] font-mono tabular-nums leading-none border border-foreground/15">
              <span className="px-1.5 py-1 bg-foreground/5 text-foreground/50">
                {badgeLabel || evalName.slice(0, 3).toUpperCase()}
              </span>
              {config.outputMode === "score" ? (
                <span className="px-1.5 py-1 font-bold bg-foreground/10 text-foreground/70">85%</span>
              ) : (
                <span className="px-1.5 py-1 font-bold bg-foreground/10 text-foreground/70">PASS</span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">vs</span>
            {/* Fail example */}
            <span className="inline-flex items-center overflow-hidden rounded text-[9px] font-mono tabular-nums leading-none border-2 border-foreground">
              <span className="px-1.5 py-1 bg-foreground/10 text-foreground font-semibold">
                {badgeLabel || evalName.slice(0, 3).toUpperCase()}
              </span>
              {config.outputMode === "score" ? (
                <span className="px-1.5 py-1 font-bold bg-foreground text-background">0%</span>
              ) : (
                <span className="px-1.5 py-1 font-bold bg-foreground text-background">FAIL</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
