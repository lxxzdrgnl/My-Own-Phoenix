"use client";
import { apiFetch } from "@/lib/api-client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CSVImportModal } from "@/components/modals/csv-import-modal";
import { EvalSelectorModal, type EvalOverrides } from "@/components/modals/eval-selector-modal";
import { DatasetFormModal } from "@/components/modals/dataset-form-modal";
import { cn } from "@/lib/utils";
import { Upload, Database } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useResourceList } from "@/lib/hooks/use-resource-list";

import { useDatasetGeneration } from "./hooks/use-dataset-generation";
import { useDatasetEvaluation } from "./hooks/use-dataset-evaluation";
import { DatasetConfigPanel } from "./dataset-config-panel";
import { DatasetResults } from "./dataset-results";
import { DatasetSidebar } from "./dataset-sidebar";
import { DatasetToolbar } from "./dataset-toolbar";
import { DatasetPromptsTab } from "./dataset-prompts-tab";
import { DatasetTabNav } from "./dataset-tab-nav";

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
  const datasetsEndpoint = projectId
    ? `/api/datasets?projectId=${encodeURIComponent(projectId)}`
    : null;
  const {
    items: datasets,
    loading,
    reload: reloadDatasets,
  } = useResourceList<DatasetMeta>(
    datasetsEndpoint ?? "/api/datasets",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  useEffect(() => {
    apiFetch("/api/agent-config").then(r => r.json()).then(d => setAgentConfigs(d.items ?? [])).catch(() => {});
  }, []);

  const loadEvals = useCallback(async () => {
    try {
      const res = await apiFetch("/api/eval-prompts");
      const data = await res.json();
      setEvalOptions(data.items ?? []);
    } catch { /* silent */ }
  }, []);
  useEffect(() => { loadEvals(); }, [loadEvals]);

  // ── Data loading ──
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
    } catch { /* silent */ }
  }

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
      setRuns(runsData.items ?? []);
    } catch { /* silent */ }
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
    } catch { /* silent */ }
  }

  // ── Handlers ──
  async function handleDatasetSaved(saved: DatasetMeta) {
    await reloadDatasets();
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
      await reloadDatasets(); selectDataset(target.id);
    } else {
      const res = await apiFetch("/api/datasets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, fileName: data.fileName, headers: data.headers, rows: data.rows, queryCol: data.queryCol, contextCol: data.contextCol }),
      });
      let result: any = {};
      try { result = await res.json(); } catch { /* silent */ }
      await reloadDatasets();
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
    reloadDatasets();
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
      reloadDatasets();
      loadPage(selectedId, page);
    }
  }

  async function handleBulkDelete() {
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
      reloadDatasets();
      loadPage(selectedId, 0);
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

            {/* ── Tabs nav ── */}
            <DatasetTabNav
              activeTab={activeTab}
              runs={runs}
              totalRows={totalRows}
              hasResults={hasResults}
              liveRunId={liveRunId}
              selectedRunId={selectedRunId}
              onTabChange={setActiveTab}
              onLoadFirstRun={loadRun}
            />

            {/* ── Tab content ── */}
            <div className="min-h-0 flex-1 overflow-y-auto">

              {/* Prompts tab */}
              {activeTab === "prompts" && (
                <div className="px-5 py-4">
                  <DatasetPromptsTab
                    rows={rows}
                    headers={headers}
                    queryCol={queryCol}
                    contextCol={contextCol}
                    page={page}
                    pageSize={pageSize}
                    totalRows={totalRows}
                    selectedId={selectedId}
                    selectedRowIndices={selectedRowIndices}
                    editingRowIndex={editingRowIndex}
                    editRowData={editRowData}
                    onSelectRow={rowIndex => {
                      setSelectedRowIndices(prev => {
                        const next = new Set(prev);
                        if (next.has(rowIndex)) next.delete(rowIndex); else next.add(rowIndex);
                        return next;
                      });
                    }}
                    onSelectAll={() => {
                      if (selectedRowIndices.size === rows.length) {
                        setSelectedRowIndices(new Set());
                      } else {
                        setSelectedRowIndices(new Set(rows.map(r => (r as any)._rowIndex)));
                      }
                    }}
                    onStartEdit={startEditRow}
                    onEditRowDataChange={setEditRowData}
                    onSaveRow={handleSaveRow}
                    onCancelEdit={() => setEditingRowIndex(null)}
                    onDeleteRow={handleDeleteRow}
                    onLoadPage={loadPage}
                    onOpenImport={() => setImportModal({ open: true, target: selected ? { id: selected.id, name: selected.name } : null })}
                    onBulkDelete={handleBulkDelete}
                    onClearSelection={() => setSelectedRowIndices(new Set())}
                  />
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
