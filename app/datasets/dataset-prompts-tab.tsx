"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Upload, Trash2,
  Database, Pencil, Check, X,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatasetRow { [key: string]: string; }

export interface DatasetPromptsTabProps {
  rows: DatasetRow[];
  headers: string[];
  queryCol: string;
  contextCol: string;
  page: number;
  pageSize: number;
  totalRows: number;
  selectedId: string | null;
  selectedRowIndices: Set<number>;
  editingRowIndex: number | null;
  editRowData: Record<string, string>;
  onSelectRow: (rowIndex: number) => void;
  onSelectAll: () => void;
  onStartEdit: (index: number) => void;
  onEditRowDataChange: (data: Record<string, string>) => void;
  onSaveRow: (index: number) => void;
  onCancelEdit: () => void;
  onDeleteRow: (index: number) => void;
  onLoadPage: (id: string, page: number) => void;
  onOpenImport: () => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DatasetPromptsTab({
  rows,
  headers,
  queryCol,
  contextCol,
  page,
  pageSize,
  totalRows,
  selectedId,
  selectedRowIndices,
  editingRowIndex,
  editRowData,
  onSelectRow,
  onSelectAll,
  onStartEdit,
  onEditRowDataChange,
  onSaveRow,
  onCancelEdit,
  onDeleteRow,
  onLoadPage,
  onOpenImport,
  onBulkDelete,
  onClearSelection,
}: DatasetPromptsTabProps) {
  const t = useT();

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <EmptyState icon={Database} title={t.datasets.noPrompts} description={t.datasets.noPromptsDesc} className="h-auto" />
        <RoleGate>
          <Button variant="outline" size="sm" onClick={onOpenImport} className="mt-1 gap-1.5 text-xs">
            <Upload className="size-3" /> {t.common.import}
          </Button>
        </RoleGate>
      </div>
    );
  }

  return (
    <>
      {/* Selection bar */}
      <div className="mb-2 flex items-center gap-3">
        <button
          onClick={onSelectAll}
          className={cn(
            "flex size-4 items-center justify-center rounded border transition-colors",
            selectedRowIndices.size > 0 ? "border-foreground bg-foreground" : "border-muted-foreground/30"
          )}
        >
          {selectedRowIndices.size > 0 && <Check className="size-2.5 text-background" />}
        </button>
        {selectedRowIndices.size > 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{selectedRowIndices.size.toLocaleString()} selected</span>
            <RoleGate>
              <button
                onClick={onBulkDelete}
                className="flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-muted hover:text-destructive transition-colors"
              >
                <Trash2 className="size-2.5" /> Delete
              </button>
            </RoleGate>
            <button onClick={onClearSelection} className="text-muted-foreground/60 hover:text-foreground">Clear</button>
          </div>
        ) : (
          <Text variant="caption" className="text-muted-foreground/50">{t.datasets.selectRows}</Text>
        )}
      </div>

      {/* Row list */}
      <div className="overflow-hidden rounded-lg border">
        {rows.map((row, i) => {
          const query = queryCol ? row[queryCol] ?? "" : "";
          const context = contextCol ? row[contextCol] ?? "" : "";
          const isEditing = editingRowIndex === i;

          return (
            <div key={i} className={cn("border-b last:border-b-0", isEditing && "bg-muted/20")}>
              {isEditing ? (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Text variant="caption" className="font-bold uppercase tracking-wide">Editing #{i + 1}</Text>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onSaveRow(i)}
                        className="flex items-center gap-1 rounded bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:bg-foreground/80"
                      >
                        <Check className="size-3" /> Save
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                      >
                        <X className="size-3" /> Cancel
                      </button>
                    </div>
                  </div>
                  {headers.map(h => (
                    <div key={h}>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {h}
                        {h === queryCol && <span className="ml-1.5 text-muted-foreground normal-case">· query</span>}
                        {h === contextCol && <span className="ml-1.5 text-muted-foreground normal-case">· context</span>}
                      </label>
                      <Textarea
                        value={editRowData[h] ?? ""}
                        onChange={e => onEditRowDataChange({ ...editRowData, [h]: e.target.value })}
                        rows={h === contextCol ? 5 : 2}
                        className="text-xs"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={cn("flex items-start gap-0 hover:bg-muted/20 transition-colors", selectedRowIndices.has((row as any)._rowIndex) && "bg-accent/40")}>
                  {/* Checkbox + Row number */}
                  <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-3.5 pb-3">
                    <button
                      onClick={() => onSelectRow((row as any)._rowIndex)}
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        selectedRowIndices.has((row as any)._rowIndex)
                          ? "border-foreground bg-foreground"
                          : "border-muted-foreground/30 hover:border-muted-foreground"
                      )}
                    >
                      {selectedRowIndices.has((row as any)._rowIndex) && <Check className="size-2.5 text-background" />}
                    </button>
                    <span className="text-[9px] tabular-nums text-muted-foreground/30">{(row as any)._rowIndex != null ? (row as any)._rowIndex + 1 : page * pageSize + i + 1}</span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 py-3 pr-2">
                    {query && (
                      <p className="text-sm text-foreground line-clamp-2 leading-relaxed">{query}</p>
                    )}
                    {context && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{context}</p>
                    )}
                    {!query && !context && (
                      <p className="text-xs text-muted-foreground/40 italic">No query or context</p>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1 px-3 py-3">
                    <RoleGate>
                      <button
                        onClick={() => onStartEdit(i)}
                        className="rounded p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </RoleGate>
                    <RoleGate>
                      <button
                        onClick={() => onDeleteRow(i)}
                        className="rounded p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </RoleGate>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalRows > pageSize && (
        <div className="flex items-center justify-between rounded-lg border px-4 py-2.5 mt-4">
          <Text variant="caption">
            {(page * pageSize + 1).toLocaleString()}–{Math.min((page + 1) * pageSize, totalRows).toLocaleString()} of {totalRows.toLocaleString()}
          </Text>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline" size="sm"
              disabled={page === 0}
              onClick={() => selectedId && onLoadPage(selectedId, page - 1)}
              className="h-7 px-2.5 text-xs"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <Input
                type="number"
                min={1}
                max={Math.ceil(totalRows / pageSize)}
                value={page + 1}
                onChange={e => {
                  const p = Math.max(0, Math.min(Math.ceil(totalRows / pageSize) - 1, parseInt(e.target.value || "1") - 1));
                  if (selectedId) onLoadPage(selectedId, p);
                }}
                className="h-7 w-14 text-center text-xs tabular-nums px-1"
              />
              <span>/ {Math.ceil(totalRows / pageSize)}</span>
            </div>
            <Button
              variant="outline" size="sm"
              disabled={(page + 1) * pageSize >= totalRows}
              onClick={() => selectedId && onLoadPage(selectedId, page + 1)}
              className="h-7 px-2.5 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
