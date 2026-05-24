"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ModalShell, ModalHeader, ModalBody } from "@/components/ui/modal-shell";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";

interface DatasetOption {
  id: string;
  name: string;
  rowCount: number;
  headers: string;
}

interface AddToDatasetModalProps {
  open: boolean;
  onClose: () => void;
  query?: string;
  context?: string;
  response?: string;
}

export function AddToDatasetModal({ open, onClose, query = "", context = "", response = "" }: AddToDatasetModalProps) {
  const t = useT();
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editQuery, setEditQuery] = useState(query);
  const [editContext, setEditContext] = useState(context);
  const [editResponse, setEditResponse] = useState(response);

  useEffect(() => {
    if (!open) return;
    setEditQuery(query);
    setEditContext(context);
    setEditResponse(response);
    apiFetch("/api/datasets").then((r) => r.json()).then((data) => {
      const ds = data.datasets ?? [];
      setDatasets(ds);
      if (ds.length > 0 && !selectedId) setSelectedId(ds[0].id);
    }).catch(() => {});
  }, [open, query, context]);

  async function handleCreateAndAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const headers = ["query", "context", "response"];
      const row = { query: editQuery, context: editContext, response: editResponse };
      const res = await apiFetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          headers,
          queryCol: "query",
          contextCol: "context",
          rows: [row],
        }),
      });
      if (res.ok) {
        setNewName("");
        setCreating(false);
        onClose();
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function handleAddToExisting() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const ds = datasets.find((d) => d.id === selectedId);
      const dsHeaders = ds ? JSON.parse(ds.headers) : [];

      if (dsHeaders.length === 0) {
        await apiFetch("/api/datasets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedId,
            headers: ["query", "context", "response"],
            queryCol: "query",
            contextCol: "context",
            rows: [{ query: editQuery, context: editContext, response: editResponse }],
          }),
        });
      } else {
        const row: Record<string, string> = {};
        for (const h of dsHeaders) {
          const lower = h.toLowerCase();
          if (lower.includes("query") || lower.includes("question") || lower.includes("prompt") || lower.includes("input")) row[h] = editQuery;
          else if (lower.includes("context") || lower.includes("document") || lower.includes("reference")) row[h] = editContext;
          else if (lower.includes("response") || lower.includes("answer") || lower.includes("output") || lower.includes("expected")) row[h] = editResponse;
          else row[h] = "";
        }
        await apiFetch("/api/datasets/rows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selectedId, rows: [row] }),
        });
      }
      onClose();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  return (
    <ModalShell open={open} onClose={onClose} size="md">
      <ModalHeader title={t.addToDataset.title} />
      <ModalBody>
        <div className="space-y-4">
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">{t.addToDataset.query}</label>
              <Textarea value={editQuery} onChange={(e) => setEditQuery(e.target.value)} rows={2} className="text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">{t.addToDataset.context}</label>
              <Textarea value={editContext} onChange={(e) => setEditContext(e.target.value)} rows={4} className="text-xs max-h-[200px]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Response</label>
              <Textarea value={editResponse} onChange={(e) => setEditResponse(e.target.value)} rows={4} className="text-xs max-h-[200px]" />
            </div>
          </div>

          <div className="border-t pt-4">
            {!creating ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">{t.addToDataset.addTo}</label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.rowCount} rows)</option>
                    ))}
                    {datasets.length === 0 && <option value="">{t.addToDataset.noDatasets}</option>}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddToExisting} disabled={saving || !selectedId} className="flex-1 text-xs">
                    {saving ? t.addToDataset.saving : t.addToDataset.addToDataset}
                  </Button>
                  <Button variant="outline" onClick={() => setCreating(true)} className="gap-1 text-xs">
                    <Plus className="size-3" /> {t.addToDataset.new}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">{t.addToDataset.newDatasetName}</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. jailbreak-tests, quality-samples"
                    className="text-sm"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateAndAdd} disabled={saving || !newName.trim()} className="flex-1 text-xs">
                    {saving ? t.addToDataset.creating : t.addToDataset.createAndAdd}
                  </Button>
                  <Button variant="ghost" onClick={() => setCreating(false)} className="text-xs">{t.common.cancel}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalBody>
    </ModalShell>
  );
}
