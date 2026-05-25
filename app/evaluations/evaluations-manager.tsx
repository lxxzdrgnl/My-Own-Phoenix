"use client";
import { apiFetch } from "@/lib/api-client";

import { useEffect, useState, useCallback } from "react";
import type { Project } from "@/lib/phoenix";
import { LoadingState } from "@/components/ui/empty-state";
import { type RuleConfig } from "@/components/rule-builder";
import { EvalList, type EvalPrompt, type ProjectEvalConfig } from "./eval-list";
import { EvalEditor } from "./eval-editor";
import { EvalSettingsPanel } from "./eval-settings-panel";

// ─── Component ─────────────────────────────────────────────────────────────

export function EvaluationsManager({ fixedProject, projectId, globalMode }: { fixedProject?: string; projectId?: string; globalMode?: boolean } = {}) {
  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [globalPrompts, setGlobalPrompts] = useState<EvalPrompt[]>([]);
  const [projectConfigs, setProjectConfigs] = useState<ProjectEvalConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedEval, setSelectedEval] = useState<string | null>(null);

  // New eval panel
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Default model from settings
  const [defaultEvalModel, setDefaultEvalModel] = useState("gpt-4o-mini");

  // ── Load ──

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (globalMode) {
        setProjects([]);
        setSelectedProject("__global__");
      } else if (fixedProject !== undefined) {
        setProjects([{ id: fixedProject, name: fixedProject }]);
        setSelectedProject(fixedProject);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjectConfig = useCallback(async (pid: string) => {
    try {
      if (pid === "__global__") {
        // Global mode: load all global evals (built-in + custom templates)
        const promptsRes = await apiFetch("/api/eval-prompts?includeGlobalTemplates=true").then((r) => r.json());
        setProjectConfigs([]);
        setGlobalPrompts(promptsRes.items ?? []);
      } else if (projectId) {
        // Both eval-config and eval-prompts are keyed by DB project id (cuid).
        const [configRes, promptsRes] = await Promise.all([
          apiFetch(`/api/eval-config?projectId=${encodeURIComponent(projectId)}`).then((r) => r.json()),
          apiFetch(`/api/eval-prompts?projectId=${encodeURIComponent(projectId)}`).then((r) => r.json()),
        ]);
        setProjectConfigs(configRes.items ?? []);
        setGlobalPrompts(promptsRes.items ?? []);
      }
    } catch (e) { console.error(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (selectedProject) loadProjectConfig(selectedProject); }, [selectedProject, loadProjectConfig]);
  useEffect(() => {
    apiFetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data.defaultEvalModel) setDefaultEvalModel(data.defaultEvalModel);
    }).catch(() => {});
  }, []);

  // ── Toggle ──

  async function toggleEval(evalName: string) {
    if (!selectedProject || !projectId) return;
    const config = projectConfigs.find((c) => c.evalName === evalName);
    const currentEnabled = config ? config.enabled : true;
    const newEnabled = !currentEnabled;

    // Optimistic update
    setProjectConfigs((prev) => {
      const exists = prev.some((c) => c.evalName === evalName);
      if (exists) {
        return prev.map((c) => (c.evalName === evalName ? { ...c, enabled: newEnabled } : c));
      }
      return [...prev, { id: `temp-${evalName}`, projectId, evalName, enabled: newEnabled, template: null }];
    });

    try {
      await apiFetch("/api/eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, evalName, enabled: newEnabled }),
      });
    } catch (e) { console.error(e); }
    loadProjectConfig(selectedProject);
  }

  // ── Handlers for EvalEditor callbacks ──

  function handleCreated(name: string, evalType: string, template: string, ruleConfig: RuleConfig, model: string) {
    if (selectedProject) loadProjectConfig(selectedProject);
    setCreating(false);
    setSelectedEval(name);
  }

  function handleDeleted() {
    setSelectedEval(null);
    if (selectedProject) loadProjectConfig(selectedProject);
  }

  function handleProjectConfigReload() {
    if (selectedProject) loadProjectConfig(selectedProject);
  }

  if (loading) return <LoadingState className="flex-1" />;

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Center: Eval list ── */}
      <EvalList
        selectedProject={selectedProject}
        selectedEval={selectedEval}
        globalPrompts={globalPrompts}
        projectConfigs={projectConfigs}
        onSelectEval={(name) => { setSelectedEval(name); setCreating(false); setShowSettings(false); }}
        onToggleEval={toggleEval}
        onStartCreating={() => { setCreating(true); setSelectedEval(null); setShowSettings(false); }}
        onShowSettings={() => { setShowSettings(true); setSelectedEval(null); setCreating(false); }}
        globalMode={globalMode}
        projectId={projectId}
      />

      {/* ── Right: Editor or Settings panel ── */}
      <div className="flex-1 overflow-y-auto">
        {showSettings && projectId ? (
          <EvalSettingsPanel projectId={projectId} />
        ) : (
        <EvalEditor
          key={selectedEval ?? (creating ? "__creating__" : "__empty__")}
          selectedEval={selectedEval}
          selectedProject={selectedProject}
          creating={creating}
          projects={projects}
          globalPrompts={globalPrompts}
          projectConfigs={projectConfigs}
          defaultEvalModel={defaultEvalModel}
          projectId={projectId}
          globalMode={globalMode}
          onCreated={handleCreated}
          onCancelCreate={() => setCreating(false)}
          onDeleted={handleDeleted}
          onProjectConfigReload={handleProjectConfigReload}
        />
        )}
      </div>
    </div>
  );
}
