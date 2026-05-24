"use client";
import { apiFetch } from "@/lib/api-client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CSVImportModal } from "@/components/modals/csv-import-modal";
import { EvalSelectorModal, type EvalOverrides } from "@/components/modals/eval-selector-modal";
import { DatasetFormModal } from "@/components/modals/dataset-form-modal";
import { cn } from "@/lib/utils";
import {
  Upload, Trash2,
  Database, Pencil, Check, X,
  List, FlaskConical,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";

import { useDatasetGeneration } from "./hooks/use-dataset-generation";
import { useDatasetEvaluation } from "./hooks/use-dataset-evaluation";
import { DatasetConfigPanel } from "./dataset-config-panel";
import { DatasetResults } from "./dataset-results";
import { DatasetSidebar } from "./dataset-sidebar";
import { DatasetToolbar } from "./dataset-toolbar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatasetMeta {
  id: string; name: string; fileName: string;
  headers: string; queryCol: string; contextCol: string; rowCount: number;
}
interface DatasetRow { [key: string]: string; }
interface RunMeta {
  id: string; agentSource: string; evalNames: string; status: string; createdAt: string;
}
interface RowResult {
  rowIdx: number; response: string; query?: string;
  evals: Record<string, { label: string; score: number; explanation: string }>;
}
interface AgentConfigOption {
  id: string; projectName: string; alias: string | null;
  agentType: string; endpoint: string; assistantId: string;
  template?: { name: string; description?: string } | null;
}
interface EvalOption {
  name: string; evalType: string; template: string;
  outputMode: string; isCustom: boolean; badgeLabel: string; ruleConfig: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DatasetManager({ projectId }: { projectId?: string } = {}) {
  const t = useT();
  const confirm = useConfirm();
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [queryCol, setQueryCol] = useState("");
  const [contextCol, setContextCol] = useState("");

  const [datasetFormOpen, setDatasetFormOpen] = useState(false);
  const [importModal, setImportModal] = useState<{ open: boolean; target: { id: string; name: string } | null }>({ open: false, target: null });
  const [dragOver, setDragOver] = useState(false);

  const [agentConfigs, setAgentConfigs] = useState<AgentConfigOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");

  const [evalOptions, setEvalOptions] = useState<EvalOption[]>([]);
  const [checkedEvals, setCheckedEvals] = useState<Set<string>>(new Set());
  const [evalOverrides, setEvalOverrides] = useState<EvalOverrides>({});

  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RowResult[]>([]);
  const [runEvalNames, setRunEvalNames] = useState<string[]>([]);

  const [liveResults, setLiveResults] = useState<RowResult[]>([]);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [evalModalOpen, setEvalModalOpen] = useState(false);

  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"prompts" | "results">("prompts");
  const [configOpen, setConfigOpen] = useState(true);

  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [totalRows, setTotalRows] = useState(0);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const cancelRef = useRef(false);

  // ── Hooks ──
  const { generating, genProgress, handleGenerate } = useDatasetGeneration({
    selectedId, selectedAgent, agentConfigs, queryCol, selectedRowIndices, pageSize,
    projectId, cancelRef,
    setLiveRunId,
    setSelectedRunId,
    setLiveResults,
    setActiveTab,
    setRuns: (updater) => setRuns(prev => updater(prev)),
  });

  const { evaluating, evalProgress, handleEvaluate } = useDatasetEvaluation({
    selectedId, liveRunId, selectedRunId, liveResults, runResults,
    checkedEvals, evalOptions, evalOverrides, queryCol, contextCol,
    selectedRowIndices, projectId, cancelRef,
    setLiveResults,
    setRunResults,
    setRunEvalNames,
    setRuns: (updater) => setRuns(prev => updater(prev)),
  });

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    if (!projectId) {
      setDatasets([]);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch(`/api/datasets?projectId=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      setDatasets(data.datasets ?? []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [projectId]);
  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  useEffect(() => {
    apiFetch("/api/agent-config").then(r => r.json()).then(d => setAgentConfigs(d.configs ?? [])).catch(() => {});
  }, []);

  const loadEvals = useCallback(async () => {
    try {
      const res = await apiFetch("/api/eval-prompts");
      const data = await res.json();
      setEvalOptions(data.prompts ?? []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { loadEvals(); }, [loadEvals]);

  // ── Load a page of rows ──
  async function loadPage(id: string, p: number) {
    try {
      const res = await apiFetch(`/api/datasets/rows?id=${id}&page=${p}&pageSize=${pageSize}`);
      const data = await res.json();
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
      setTotalRows(data.total ?? 0);
      setQueryCol(data.queryCol ?? "");
      setContextCol(data.contextCol ?? "");
      setCheckedEvals(new Set(data.evalNames ?? []));
      setEvalOverrides(data.evalOverrides ?? {});
      setPage(p);
    } catch (e) { console.error(e); }
  }

  // ── Select dataset ──
  async function selectDataset(id: string) {
    setSelectedId(id);
    setLiveResults([]); setLiveRunId(null);
    setSelectedRunId(null); setRunResults([]); setRunEvalNames([]);
    setActiveTab("prompts"); setPage(0); setSelectedRowIndices(new Set());
    try {
      const [_, runsRes] = await Promise.all([
        loadPage(id, 0),
        apiFetch(`/api/datasets/runs?datasetId=${id}`),
      ]);
      const runsData = await runsRes.json();
      setRuns(runsData.runs ?? []);
    } catch (e) { console.error(e); }
  }

  async function loadRun(runId: string) {
    if (!runId) { setSelectedRunId(null); return; }
    setSelectedRunId(runId); setLiveResults([]); setLiveRunId(null);
    try {
      const res = await apiFetch(`/api/datasets/runs/${runId}`);
      const data = await res.json();
      setRunResults(data.rowResults ?? []);
      setRunEvalNames(data.evalNames ?? []);
      setActiveTab("results");
    } catch (e) { console.error(e); }
  }

  async function handleDatasetSaved(saved: DatasetMeta) {
    await loadDatasets();
    if (saved?.id) selectDataset(saved.id);
  }

  async function handleImport(data: {
    name: string; fileName: string; headers: string[];
    rows: Record<string, string>[]; queryCol: string; contextCol: string;
  }) {
    const target = importModal.target;
    if (target) {
      await apiFetch("/api/datasets/rows", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id, rows: data.rows }),
      });
      await loadDatasets(); selectDataset(target.id);
    } else {
      const res = await apiFetch("/api/datasets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, fileName: data.fileName, headers: data.headers, rows: data.rows, queryCol: data.queryCol, contextCol: data.contextCol }),
      });
      let result: any = {};
      try { result = await res.json(); } catch (e) { console.error(e); }
      await loadDatasets();
      if (result.dataset?.id) selectDataset(result.dataset.id);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Delete dataset",
      description: "This dataset and all its data will be permanently deleted.",
      confirmText: "Delete",
    });
    if (!ok) return;
    await apiFetch("/api/datasets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (selectedId === id) { setSelectedId(null); setRows([]); setHeaders([]); }
    loadDatasets();
  }

  function handleCancel() {
    cancelRef.current = true;
  }

  async function handleDeleteRun(runId: string) {
    await apiFetch(`/api/datasets/runs/${runId}`, { method: "DELETE" });
    if (selectedRunId === runId) { setSelectedRunId(null); setRunResults([]); setRunEvalNames([]); }
    if (liveRunId === runId) { setLiveRunId(null); setLiveResults([]); }
    setRuns(prev => prev.filter(r => r.id !== runId));
    if (activeTab === "results") setActiveTab("prompts");
  }

  function startEditRow(index: number) {
    const row = rows[index];
    const { _rowIndex, ...data } = row;
    setEditingRowIndex(index);
    setEditRowData(data);
  }

  async function handleSaveRow(index: number) {
    const row = rows[index];
    const rowIndex = (row as any)._rowIndex ?? index;
    setRows(prev => prev.map((r, i) => (i === index ? { ...editRowData, _rowIndex: rowIndex } : r)));
    setEditingRowIndex(null);
    if (selectedId) {
      await apiFetch("/api/datasets/rows", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, rowIndex, data: editRowData }),
      });
    }
  }

  async function handleDeleteRow(index: number) {
    const ok = await confirm({
      title: "Delete prompt",
      description: "This prompt row will be permanently removed from the dataset.",
      confirmText: "Delete",
    });
    if (!ok) return;
    const row = rows[index];
    const rowIndex = (row as any)._rowIndex ?? index;
    if (editingRowIndex === index) setEditingRowIndex(null);
    if (selectedId) {
      await apiFetch("/api/datasets/rows", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, rowIndex }),
      });
      setTotalRows(prev => prev - 1);
      loadDatasets();
      loadPage(selectedId, page);
    }
  }

  // ── Derived state ──
  const selected = datasets.find(d => d.id === selectedId);
  const displayResults = liveRunId ? liveResults : runResults;
  const displayEvalNames = liveRunId ? [...checkedEvals] : runEvalNames;
  const hasResults = displayResults.length > 0;
  const hasResponses = displayResults.some(r => r.response);
  const currentRunId = liveRunId || selectedRunId;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* ── Left sidebar ── */}
      <DatasetSidebar
        datasets={datasets}
        selectedId={selectedId}
        onSelect={selectDataset}
        onOpenCreate={() => setDatasetFormOpen(true)}
        onDelete={handleDelete}
        loading={loading}
      />

      {/* ── Right panel ── */}
      <div
        className={cn("flex min-w-0 flex-1 flex-col", dragOver && "ring-2 ring-inset ring-foreground/20")}
        onDragOver={e => { e.preventDefault(); if (selectedId) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          if (!selectedId || !selected) return;
          setImportModal({ open: true, target: { id: selected.id, name: selected.name } });
        }}
      >
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <EmptyState icon={Database} title={t.datasets.selectDataset} description={t.datasets.selectDatasetDesc} className="h-auto" />
            <RoleGate>
              <Button variant="outline" size="sm" onClick={() => setImportModal({ open: true, target: null })} className="gap-1.5 text-xs">
                <Upload className="size-3" /> {t.common.import}
              </Button>
            </RoleGate>
          </div>
        ) : (
          <div className="flex h-full flex-col">

            {/* ── Top bar ── */}
            <DatasetToolbar
              datasetName={selected?.name ?? ""}
              totalRows={totalRows}
              headerCount={headers.length}
              currentRunId={currentRunId}
              configOpen={configOpen}
              onToggleConfig={() => setConfigOpen(!configOpen)}
              onImport={() => setImportModal({ open: true, target: selected ? { id: selected.id, name: selected.name } : null })}
              onExport={() => currentRunId && window.open(`/api/datasets/runs/${currentRunId}/export`, "_blank")}
            />

            {/* ── Config panel ── */}
            {configOpen && (
              <DatasetConfigPanel
                selectedAgent={selectedAgent}
                onAgentChange={setSelectedAgent}
                generating={generating}
                genProgress={genProgress}
                totalRows={totalRows}
                selectedRowIndices={selectedRowIndices}
                onGenerate={() => handleGenerate(totalRows)}
                onCancel={handleCancel}
                checkedEvals={checkedEvals}
                evalOptions={evalOptions}
                evaluating={evaluating}
                evalProgress={evalProgress}
                displayResultsLength={displayResults.length}
                onEvaluate={handleEvaluate}
                onOpenEvalModal={() => setEvalModalOpen(true)}
              />
            )}

            {/* ── Tabs ── */}
            <div className="flex shrink-0 items-center gap-0 border-b px-5">
              {(["prompts", "results"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab === "results" && runs.length > 0 && !selectedRunId && !liveRunId) {
                      loadRun(runs[0].id);
                    } else {
                      setActiveTab(tab);
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
                  {tab === "prompts" && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{totalRows}</span>}
                  {tab === "results" && runs.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{runs.length}</span>}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div className="min-h-0 flex-1 overflow-y-auto">

              {/* Prompts tab */}
              {activeTab === "prompts" && (
                <div className="px-5 py-4">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                      <EmptyState icon={Database} title={t.datasets.noPrompts} description={t.datasets.noPromptsDesc} className="h-auto" />
                      <RoleGate>
                        <Button variant="outline" size="sm" onClick={() => setImportModal({ open: true, target: selected ? { id: selected.id, name: selected.name } : null })} className="mt-1 gap-1.5 text-xs">
                          <Upload className="size-3" /> {t.common.import}
                        </Button>
                      </RoleGate>
                    </div>
                  ) : (
                    <>
                    {/* Selection bar */}
                    <div className="mb-2 flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (selectedRowIndices.size === rows.length) {
                            setSelectedRowIndices(new Set());
                          } else {
                            setSelectedRowIndices(new Set(rows.map(r => (r as any)._rowIndex)));
                          }
                        }}
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
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Delete selected prompts",
                                  description: `${selectedRowIndices.size} selected prompt(s) will be permanently deleted.`,
                                  confirmText: "Delete",
                                });
                                if (!ok) return;
                                if (selectedId) {
                                  await apiFetch("/api/datasets/rows", {
                                    method: "DELETE", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: selectedId, rowIndices: [...selectedRowIndices] }),
                                  });
                                  setSelectedRowIndices(new Set());
                                  loadDatasets();
                                  loadPage(selectedId, 0);
                                }
                              }}
                              className="flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-muted hover:text-destructive transition-colors"
                            >
                              <Trash2 className="size-2.5" /> Delete
                            </button>
                          </RoleGate>
                          <button onClick={() => setSelectedRowIndices(new Set())} className="text-muted-foreground/60 hover:text-foreground">Clear</button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">{t.datasets.selectRows}</span>
                      )}
                    </div>

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
                                  <span className="text-[10px] font-bold text-muted-foreground">Editing #{i + 1}</span>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => handleSaveRow(i)}
                                      className="flex items-center gap-1 rounded bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:bg-foreground/80"
                                    >
                                      <Check className="size-3" /> Save
                                    </button>
                                    <button
                                      onClick={() => setEditingRowIndex(null)}
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
                                      onChange={e => setEditRowData(prev => ({ ...prev, [h]: e.target.value }))}
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
                                    onClick={() => {
                                      const idx = (row as any)._rowIndex;
                                      setSelectedRowIndices(prev => {
                                        const next = new Set(prev);
                                        if (next.has(idx)) next.delete(idx); else next.add(idx);
                                        return next;
                                      });
                                    }}
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
                                      onClick={() => startEditRow(i)}
                                      className="rounded p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors"
                                      title="Edit"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                  </RoleGate>
                                  <RoleGate>
                                    <button
                                      onClick={() => handleDeleteRow(i)}
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
                        <p className="text-xs text-muted-foreground">
                          {(page * pageSize + 1).toLocaleString()}–{Math.min((page + 1) * pageSize, totalRows).toLocaleString()} of {totalRows.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline" size="sm"
                            disabled={page === 0}
                            onClick={() => selectedId && loadPage(selectedId, page - 1)}
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
                                if (selectedId) loadPage(selectedId, p);
                              }}
                              className="h-7 w-14 text-center text-xs tabular-nums px-1"
                            />
                            <span>/ {Math.ceil(totalRows / pageSize)}</span>
                          </div>
                          <Button
                            variant="outline" size="sm"
                            disabled={(page + 1) * pageSize >= totalRows}
                            onClick={() => selectedId && loadPage(selectedId, page + 1)}
                            className="h-7 px-2.5 text-xs"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                    </>
                  )}
                </div>
              )}

              {/* Results tab */}
              {activeTab === "results" && (
                <DatasetResults
                  runs={runs}
                  liveRunId={liveRunId}
                  liveResults={liveResults}
                  selectedRunId={selectedRunId}
                  displayResults={displayResults}
                  displayEvalNames={displayEvalNames}
                  hasResults={hasResults}
                  hasResponses={hasResponses}
                  onLoadRun={loadRun}
                  onDeleteRun={handleDeleteRun}
                  onBackToPrompts={() => setActiveTab("prompts")}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <DatasetFormModal
        open={datasetFormOpen}
        onClose={() => setDatasetFormOpen(false)}
        onSaved={handleDatasetSaved}
      />
      <CSVImportModal
        open={importModal.open}
        onClose={() => setImportModal({ open: false, target: null })}
        targetDataset={importModal.target}
        onImport={handleImport}
      />
      <EvalSelectorModal
        open={evalModalOpen}
        onClose={() => setEvalModalOpen(false)}
        datasetName={selected?.name ?? ""}
        checkedEvals={checkedEvals}
        evalOverrides={evalOverrides}
        onConfirm={(sel, ovr) => {
          setCheckedEvals(sel); setEvalOverrides(ovr); loadEvals();
          if (selectedId) {
            apiFetch("/api/datasets", {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: selectedId, evalNames: [...sel], evalOverrides: ovr }),
            });
          }
        }}
      />
    </div>
  );
}
