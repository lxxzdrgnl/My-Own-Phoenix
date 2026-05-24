// components/modals/add-diff-to-dataset-dialog.tsx
"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { ModalShell, ModalHeader, ModalBody } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface DiffRowInput {
  spanId: string;
  traceId?: string;
  query: string;
  response: string;
  context?: string;
  evalName: string;
  aiLabel: string;
  aiScore: number;
  humanLabel: string;
  humanScore: number;
}

interface DatasetOpt {
  id: string;
  name: string;
  rowCount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  evalName: string;
  rows: DiffRowInput[];
  onSaved?: (added: number) => void;
}

export function AddDiffToDatasetDialog({
  open,
  onClose,
  projectId,
  evalName,
  rows,
  onSaved,
}: Props) {
  const t = useT();
  const [datasets, setDatasets] = useState<DatasetOpt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    setNewName(`${evalName || "diff"}-diff-${today}`);
    const url = projectId
      ? `/api/datasets?projectId=${encodeURIComponent(projectId)}`
      : "/api/datasets";
    apiFetch(url)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.datasets ?? []) as DatasetOpt[];
        setDatasets(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch(() => {});
  }, [open, projectId, evalName]);

  async function insertRows(datasetId: string): Promise<number> {
    const res = await apiFetch(`/api/datasets/${datasetId}/rows-from-traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message ?? d.error ?? "Failed to insert rows");
    }
    const d = await res.json();
    return d.added as number;
  }

  async function handleAddExisting() {
    if (!selectedId) return;
    setSaving(true);
    setErr(null);
    try {
      const added = await insertRows(selectedId);
      onSaved?.(added);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

  async function handleCreateAndAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          headers: [
            "query",
            "context",
            "response",
            "expected",
            "ai_predicted",
            "ai_score",
            "human_score",
            "eval_name",
            "source_trace_id",
            "source_span_id",
          ],
          queryCol: "query",
          contextCol: "context",
          rows: [],
          projectId: projectId ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create dataset");
      const data = await res.json();
      const dsId = data.dataset?.id as string | undefined;
      if (!dsId) throw new Error("Missing dataset id");
      const added = await insertRows(dsId);
      onSaved?.(added);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <ModalShell open={open} onClose={onClose} size="sm">
      <ModalHeader
        title={t.humanReview.addToDataset}
      />
      <ModalBody>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t.humanReview.selectedCount.replace("{n}", String(rows.length))}
          </p>
          {!creating ? (
            <div className="space-y-3">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.rowCount})
                  </option>
                ))}
                {datasets.length === 0 && <option value="">No datasets</option>}
              </select>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddExisting}
                  disabled={saving || !selectedId}
                  className="flex-1 text-xs"
                >
                  {saving ? "..." : t.humanReview.addToDataset}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCreating(true)}
                  className="gap-1 text-xs"
                >
                  <Plus className="size-3" /> New
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateAndAdd}
                  disabled={saving || !newName.trim()}
                  className="flex-1 text-xs"
                >
                  {saving ? "..." : "Create & add"}
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)} className="text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {err && <p className="text-xs text-[#ef4444]">{err}</p>}
        </div>
      </ModalBody>
    </ModalShell>
  );
}
