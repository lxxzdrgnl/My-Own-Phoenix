"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, Download, Settings2 } from "lucide-react";

interface DatasetToolbarProps {
  datasetName: string;
  totalRows: number;
  headerCount: number;
  currentRunId: string | null;
  configOpen: boolean;
  onToggleConfig: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function DatasetToolbar({
  datasetName,
  totalRows,
  headerCount,
  currentRunId,
  configOpen,
  onToggleConfig,
  onImport,
  onExport,
}: DatasetToolbarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{datasetName}</h1>
        <p className="text-[10px] text-muted-foreground">
          {totalRows.toLocaleString()} prompts · {headerCount} columns
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {currentRunId && (
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            className="h-7 gap-1.5 text-xs"
          >
            <Download className="size-3" /> Export
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onImport}
          className="h-7 gap-1.5 text-xs"
        >
          <Upload className="size-3" /> Import
        </Button>
        <button
          onClick={onToggleConfig}
          title="Configure"
          className={cn(
            "rounded-md border p-1.5 transition-colors hover:bg-accent",
            configOpen && "bg-accent"
          )}
        >
          <Settings2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
