"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Plus, Trash2, Database } from "lucide-react";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Sidebar, SidebarHeader, SidebarItemDiv } from "@/components/ui/sidebar";

interface DatasetMeta {
  id: string;
  name: string;
  fileName: string;
  headers: string;
  queryCol: string;
  contextCol: string;
  rowCount: number;
}

interface DatasetSidebarProps {
  datasets: DatasetMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}

export function DatasetSidebar({
  datasets,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  loading,
}: DatasetSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  function handleCreate() {
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName("");
    setCreating(false);
  }

  return (
    <Sidebar>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <SidebarHeader>Datasets</SidebarHeader>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="New dataset"
        >
          <Plus className="size-3" />
          Dataset
        </button>
      </div>

      {creating && (
        <div className="mx-2 mb-2 flex gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Dataset name..."
            className="h-7 text-xs"
            autoFocus
          />
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="h-7 px-2 text-xs"
          >
            OK
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2">
        {loading && <LoadingState className="py-6" />}
        {datasets.map((d) => (
          <SidebarItemDiv
            key={d.id}
            active={selectedId === d.id}
            onClick={() => onSelect(d.id)}
          >
            <FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm",
                  selectedId === d.id ? "text-foreground" : ""
                )}
              >
                {d.name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {d.rowCount} prompts
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(d.id);
              }}
              className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
            >
              <Trash2 className="size-3 text-muted-foreground" />
            </button>
          </SidebarItemDiv>
        ))}
        {datasets.length === 0 && !loading && (
          <EmptyState icon={Database} title="No datasets yet" className="py-8" />
        )}
      </div>
    </Sidebar>
  );
}
