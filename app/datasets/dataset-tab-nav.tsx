"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { List, FlaskConical } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface DatasetTabNavProps {
  activeTab: "prompts" | "results";
  runs: { id: string }[];
  totalRows: number;
  hasResults: boolean;
  liveRunId: string | null;
  selectedRunId: string | null;
  onTabChange: (tab: "prompts" | "results") => void;
  onLoadFirstRun: (runId: string) => void;
}

export function DatasetTabNav({
  activeTab,
  runs,
  totalRows,
  hasResults,
  liveRunId,
  selectedRunId,
  onTabChange,
  onLoadFirstRun,
}: DatasetTabNavProps) {
  const t = useT();

  return (
    <div className="flex shrink-0 items-center gap-0 border-b px-5">
      {(["prompts", "results"] as const).map(tab => (
        <button
          key={tab}
          onClick={() => {
            if (tab === "results" && runs.length > 0 && !selectedRunId && !liveRunId) {
              onLoadFirstRun(runs[0].id);
            } else {
              onTabChange(tab);
            }
          }}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-1 py-2.5 mr-4 text-xs font-medium transition-colors",
            activeTab === tab
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
            tab === "results" && !hasResults && runs.length === 0 && "cursor-not-allowed opacity-40"
          )}
          disabled={tab === "results" && !hasResults && runs.length === 0}
        >
          {tab === "prompts" ? <List className="size-3" /> : <FlaskConical className="size-3" />}
          {tab === "prompts" ? t.datasets.prompts : t.datasets.results}
          {tab === "prompts" && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{totalRows}</span>
          )}
          {tab === "results" && runs.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{runs.length}</span>
          )}
        </button>
      ))}
    </div>
  );
}
