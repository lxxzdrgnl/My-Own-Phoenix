"use client";

import { cn } from "@/lib/utils";
import { FileSpreadsheet, Plus, Trash2, Database } from "lucide-react";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Sidebar, SidebarHeader, SidebarItemDiv } from "@/components/ui/sidebar";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";

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
  onOpenCreate: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
}

export function DatasetSidebar({
  datasets,
  selectedId,
  onSelect,
  onOpenCreate,
  onDelete,
  loading,
}: DatasetSidebarProps) {
  const t = useT();

  return (
    <Sidebar>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <SidebarHeader>{t.datasets.title}</SidebarHeader>
        <RoleGate>
          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t.datasets.dataset}
          >
            <Plus className="size-3" />
            {t.datasets.dataset}
          </button>
        </RoleGate>
      </div>

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
            <RoleGate>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(d.id);
                }}
                className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </button>
            </RoleGate>
          </SidebarItemDiv>
        ))}
        {datasets.length === 0 && !loading && (
          <EmptyState icon={Database} title={t.datasets.noDatasets} className="py-8" />
        )}
      </div>
    </Sidebar>
  );
}
