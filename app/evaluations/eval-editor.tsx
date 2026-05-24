"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  RotateCcw,
  FlaskConical,
  FileText,
  PenLine,
  ArrowLeft,
} from "lucide-react";
import { RuleBuilder, DEFAULT_RULE_CONFIG, type RuleConfig } from "@/components/rule-builder";
import { PromptBuilder } from "@/components/prompt-builder";
import { refreshBadgeLabels } from "@/components/annotation-badge";
import { ModelSelector } from "@/components/model-selector";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";
import { NEW_EVAL_TEMPLATE } from "./eval-constants";
import { EvalTestPanel } from "./eval-test-panel";
import { EvalBackfillPanel } from "./eval-backfill-panel";
import type { EvalPrompt, ProjectEvalConfig } from "./eval-list";
import type { Project } from "@/lib/phoenix";

// ─── Types ─────────────────────────────────────────────────────────────────

interface EvalEditorProps {
  selectedEval: string | null;
  selectedProject: string | null;
  creating: boolean;
  projects: Project[];
  globalPrompts: EvalPrompt[];
  projectConfigs: ProjectEvalConfig[];
  defaultEvalModel: string;
  projectId?: string;
  globalMode?: boolean;
  onCreated: (name: string, evalType: string, template: string, ruleConfig: RuleConfig, model: string) => void;
  onCancelCreate: () => void;
  onDeleted: () => void;
  onProjectConfigReload: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EvalEditor({
  selectedEval,
  selectedProject,
  creating,
  projects,
  projectId,
  globalMode,
  globalPrompts,
  projectConfigs,
  defaultEvalModel,
  onCreated,
  onCancelCreate,
  onDeleted,
  onProjectConfigReload,
}: EvalEditorProps) {
  const t = useT();
  const confirm = useConfirm();

  // New eval form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("llm_prompt");
  const [newEvalModel, setNewEvalModel] = useState(defaultEvalModel);
  const [createMode, setCreateMode] = useState<"custom" | "template" | null>(null);
  const [templates, setTemplates] = useState<EvalPrompt[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Editor state (for selected eval) — initialized from props when selectedEval changes
  const [editTemplate, setEditTemplate] = useState("");
  const [editEvalType, setEditEvalType] = useState<string>("llm_prompt");
  const [editRuleConfig, setEditRuleConfig] = useState<RuleConfig>(DEFAULT_RULE_CONFIG);
  const [editBadgeLabel, setEditBadgeLabel] = useState("");
  const [editModel, setEditModel] = useState(defaultEvalModel);

  const [dirty, setDirty] = useState(false);

  const saveGlobalHook = useFormSubmit("/api/eval-prompts", "PUT");
  const saveProjectHook = useFormSubmit("/api/eval-config", "PUT");

  // ── Initialize editor state when selectedEval changes ──
  useEffect(() => {
    if (!selectedEval) return;
    setDirty(false);

    const projectConfig = projectConfigs.find((c) => c.evalName === selectedEval);
    const globalCustom = globalPrompts.find((p) => p.name === selectedEval);

    const evalType = globalCustom?.evalType ?? "llm_prompt";
    setEditEvalType(evalType);
    setEditBadgeLabel(globalCustom?.badgeLabel ?? "");
    setEditModel(globalCustom?.model || defaultEvalModel);

    if (evalType === "code_rule") {
      try {
        const saved = globalCustom?.ruleConfig ? JSON.parse(globalCustom.ruleConfig) : null;
        setEditRuleConfig(saved?.rules ? saved : DEFAULT_RULE_CONFIG);
      } catch {
        setEditRuleConfig(DEFAULT_RULE_CONFIG);
      }
    }

    if (projectConfig?.template) {
      setEditTemplate(projectConfig.template);
    } else {
      setEditTemplate(globalCustom?.template ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEval]);

  // ── Derived ──
  const isBuiltIn = selectedEval ? globalPrompts.some((p) => p.name === selectedEval && !p.isCustom) : false;

  // ── Save ──

  const saving = saveGlobalHook.saving || saveProjectHook.saving;

  async function handleSaveProject() {
    if (!selectedEval || !selectedProject) return;
    const isCustom = !globalPrompts.some((p) => p.name === selectedEval && !p.isCustom);

    // Save global prompt data (type, model, badge, rule config)
    const globalResult = await saveGlobalHook.submit({
      name: selectedEval,
      projectId: null,
      evalType: editEvalType,
      outputMode: /"score":\s*0\.0-1\.0/.test(editTemplate) ? "score" : "binary",
      template: editTemplate,
      ruleConfig: editEvalType === "code_rule" ? editRuleConfig : undefined,
      badgeLabel: editBadgeLabel,
      model: editModel,
      isCustom,
    });
    if (globalResult === null) return;

    // Save project-scoped template override (skip in globalMode)
    if (!globalMode && projectId) {
      const projectResult = await saveProjectHook.submit({
        projectId,
        evalName: selectedEval,
        template: editTemplate,
      });
      if (projectResult === null) return;
    }

    setDirty(false);
    onProjectConfigReload();
    refreshBadgeLabels();
  }


  async function handleResetDefault() {
    if (!selectedEval) return;
    if (globalMode) {
      // In global mode: delete user's override from DB so built-in default shows
      try {
        await apiFetch(`/api/eval-prompts?name=${encodeURIComponent(selectedEval)}&reset=true`, { method: "DELETE" });
        onDeleted(); // reload list
      } catch (e) { console.error(e); }
      return;
    }
    const globalCustom = globalPrompts.find((p) => p.name === selectedEval);
    if (globalCustom?.template) {
      setEditTemplate(globalCustom.template);
      setDirty(false);
    }
  }

  async function handleDelete() {
    if (!selectedEval || !selectedProject) return;
    const ok = await confirm({
      title: `Delete "${selectedEval}"`,
      description: "This will remove the evaluation configuration from this project.",
      confirmText: "Delete",
    });
    if (!ok) return;

    const deleteAnnotations = await confirm({
      title: "Delete annotations?",
      description: "Also delete existing annotations from Phoenix? Choose Cancel to keep annotations and only remove the eval config.",
      confirmText: "Delete annotations",
      variant: "destructive",
    });

    try {
      await apiFetch(`/api/eval-prompts?name=${encodeURIComponent(selectedEval)}`, { method: "DELETE" });
      if (deleteAnnotations) {
        for (const p of projects) {
          try {
            await apiFetch(`/api/v1/projects/${encodeURIComponent(p.name)}/span_annotations`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: selectedEval }),
            });
          } catch (e) { console.error(e); }
        }
      }
      onDeleted();
    } catch (e) { console.error(e); }
  }

  async function handleCreate() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name || !selectedProject) return;
    try {
      await apiFetch("/api/eval-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          projectId: null,
          evalType: newType,
          template: newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "",
          ruleConfig: newType === "code_rule" ? DEFAULT_RULE_CONFIG : undefined,
          model: newEvalModel,
          isCustom: true,
        }),
      });
      if (!globalMode && projectId) {
        await apiFetch("/api/eval-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, evalName: name, enabled: true }),
        });
      }
      const createdTemplate = newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "";
      const createdRuleConfig: RuleConfig = DEFAULT_RULE_CONFIG;
      setNewName("");
      setNewType("llm_prompt");
      setNewEvalModel(defaultEvalModel);
      onCreated(name, newType, createdTemplate, createdRuleConfig, newEvalModel);
    } catch (e) { console.error(e); }
  }

  // ── Load global templates when switching to template mode ──
  useEffect(() => {
    if (createMode === "template" && creating && templates.length === 0) {
      setLoadingTemplates(true);
      apiFetch("/api/eval-prompts?includeGlobalTemplates=true")
        .then((r) => r.json())
        .then((data) => {
          setTemplates(
            (data.prompts || []).filter(
              (p: EvalPrompt) => p.isCustom && !(p as any).projectId
            )
          );
        })
        .catch(console.error)
        .finally(() => setLoadingTemplates(false));
    }
  }, [createMode, creating, templates.length, globalPrompts]);

  async function handleImportTemplate(templateName: string) {
    if (!projectId) return;
    try {
      const res = await apiFetch("/api/eval-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: [templateName], projectId }),
      });
      const data = await res.json();
      const createdName = data.names?.[0] || templateName;
      onCreated(createdName, "llm_prompt", "", DEFAULT_RULE_CONFIG, defaultEvalModel);
    } catch (e) { console.error(e); }
  }

  // ── Render: Create form ──

  // When globalMode, skip mode selection and go directly to custom form
  const effectiveCreateMode = globalMode ? "custom" : createMode;

  if (creating && !selectedEval) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold tracking-tight mb-1">{t.evaluations.newEvaluation}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t.evaluations.newEvalDesc}</p>

        {/* Step 1: Mode selection (only for project-level, not globalMode) */}
        {effectiveCreateMode === null && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setCreateMode("template")}
                className="rounded-lg border p-6 text-left transition-colors hover:bg-accent/50"
              >
                <FileText className="size-5 mb-3 text-muted-foreground" />
                <p className="text-sm font-semibold">{t.evaluations.fromTemplate}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t.evaluations.fromTemplateDesc}
                </p>
              </button>
              <button
                onClick={() => setCreateMode("custom")}
                className="rounded-lg border p-6 text-left transition-colors hover:bg-accent/50"
              >
                <PenLine className="size-5 mb-3 text-muted-foreground" />
                <p className="text-sm font-semibold">{t.evaluations.customCreate}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t.evaluations.customCreateDesc}
                </p>
              </button>
            </div>
            <Button variant="ghost" onClick={onCancelCreate}>{t.common.cancel}</Button>
          </div>
        )}

        {/* Step 2a: Template list */}
        {effectiveCreateMode === "template" && (
          <div className="space-y-3">
            <button
              onClick={() => setCreateMode(null)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="size-3.5" />
              {t.common.back}
            </button>
            {loadingTemplates ? (
              <p className="text-sm text-muted-foreground py-4">{t.evaluations.loadingTemplates}</p>
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-dashed px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">{t.evaluations.noTemplates}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t.evaluations.noTemplatesDesc}</p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.name}
                  onClick={() => handleImportTemplate(t.name)}
                  className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    {t.badgeLabel && <p className="text-[10px] text-muted-foreground mt-0.5">{t.badgeLabel}</p>}
                  </div>
                  <span className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                    t.evalType === "llm_prompt" ? "bg-foreground text-background"
                      : t.evalType === "api" ? "bg-foreground/10 text-foreground/70"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {t.evalType === "llm_prompt" ? "LLM" : t.evalType === "code_rule" ? "RULE" : "API"}
                  </span>
                </button>
              ))
            )}
            <Button variant="ghost" onClick={onCancelCreate} className="mt-2">{t.common.cancel}</Button>
          </div>
        )}

        {/* Step 2b: Custom create form */}
        {effectiveCreateMode === "custom" && (
        <div className="space-y-5">
          {!globalMode && (
            <button
              onClick={() => setCreateMode(null)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="size-3.5" />
              {t.common.back}
            </button>
          )}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">{t.evaluations.name}</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. pii_detection, tone_check, format_validation"
              className="text-sm"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground mt-1">{t.evaluations.nameHelp}</p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">{t.evaluations.type}</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setNewType("llm_prompt")}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  newType === "llm_prompt" ? "border-foreground bg-accent" : "hover:bg-accent/50"
                )}
              >
                <p className="text-sm font-semibold">{t.evaluations.llmPrompt}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t.evaluations.llmPromptDesc}
                </p>
              </button>
              <button
                onClick={() => setNewType("code_rule")}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  newType === "code_rule" ? "border-foreground bg-accent" : "hover:bg-accent/50"
                )}
              >
                <p className="text-sm font-semibold">{t.evaluations.codeRule}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t.evaluations.codeRuleDesc}
                </p>
              </button>
              <button
                onClick={() => setNewType("api")}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  newType === "api" ? "border-foreground bg-accent" : "hover:bg-accent/50"
                )}
              >
                <p className="text-sm font-semibold">{t.evaluations.externalApi}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t.evaluations.externalApiDesc}
                </p>
              </button>
            </div>
          </div>

          {newType === "llm_prompt" && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">{t.evaluations.evalModel}</label>
              <div className="w-64">
                <ModelSelector value={newEvalModel} onChange={setNewEvalModel} />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex-1"
            >
              {t.evaluations.createEvaluation}
            </Button>
            <Button variant="ghost" onClick={onCancelCreate}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
        )}
      </div>
    );
  }

  // ── Render: Empty state ──

  if (!selectedEval) {
    return (
      <EmptyState
        icon={FlaskConical}
        title={t.evaluations.selectEval}
        description={t.evaluations.selectEvalDesc}
        className="h-full"
      />
    );
  }

  // ── Render: Edit panel ──

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{selectedEval}</h1>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-foreground/8 text-foreground/60">
                {editEvalType === "llm_prompt" ? "LLM" : editEvalType === "code_rule" ? "Rule" : editEvalType === "api" ? "API" : "Built-in"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {dirty && (
                <RoleGate>
                  <Button
                    size="sm"
                    onClick={handleSaveProject}
                    disabled={saving}
                    className="gap-1 text-xs h-7"
                  >
                    {saving ? t.evaluations.saving : t.common.save}
                  </Button>
                </RoleGate>
              )}
              {isBuiltIn && (
                <RoleGate>
                  <Button size="sm" variant="ghost" onClick={handleResetDefault} className="gap-1 text-xs h-7">
                    <RotateCcw className="size-3" /> {t.common.reset}
                  </Button>
                </RoleGate>
              )}
              {!isBuiltIn && (
                <RoleGate>
                  <Button size="sm" variant="outline" onClick={handleDelete} className="text-xs h-7">
                    {t.common.delete}
                  </Button>
                </RoleGate>
              )}
            </div>
          </div>
          {(saveGlobalHook.error || saveProjectHook.error) && (
            <p className="text-xs text-[#ef4444] mt-1">
              {saveGlobalHook.error ?? saveProjectHook.error}
            </p>
          )}
        </div>

        {/* Backfill */}
        {!globalMode && (
          <EvalBackfillPanel
            selectedEval={selectedEval}
            projectId={projectId}
            editTemplate={editTemplate}
            editEvalType={editEvalType}
            hasRules={
              editEvalType === "code_rule" &&
              Array.isArray((editRuleConfig as { rules?: unknown[] })?.rules) &&
              ((editRuleConfig as { rules: unknown[] }).rules.length ?? 0) > 0
            }
          />
        )}

        {/* Editor — changes by eval type */}
        {editEvalType === "api" ? (
          <div className="mb-5 space-y-4">
            <div className="rounded-lg border p-4 bg-blue-50/50 dark:bg-blue-950/20">
              <p className="text-xs font-semibold mb-2">{t.evaluations.externalApiEvaluator}</p>
              <p className="text-[11px] text-muted-foreground mb-3">
                {t.evaluations.externalApiEvaluatorDesc}
              </p>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.evaluations.endpoint}</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                  value={(() => { try { return JSON.parse(editRuleConfig as any)?.endpoint ?? ''; } catch { return ''; } })()}
                  onChange={(e) => {
                    setEditRuleConfig({ ...editRuleConfig, endpoint: e.target.value } as any);
                    setDirty(true);
                  }}
                  placeholder="http://localhost:2024/evaluate"
                />
              </div>
              <div className="mt-3 text-[10px] text-muted-foreground space-y-1">
                <p><strong>Request:</strong> POST {`{endpoint}`} {`{ evalName, query, response, context }`}</p>
                <p><strong>Response:</strong> {`{ score, label, explanation }`}</p>
              </div>
            </div>
          </div>
        ) : editEvalType === "code_rule" ? (
          <div className="mb-5">
            <RuleBuilder
              config={editRuleConfig}
              onChange={(cfg) => { setEditRuleConfig(cfg); setDirty(true); }}
            />
          </div>
        ) : editEvalType === "builtin" && !editTemplate ? (
          <div className="mb-5">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                {t.evaluations.usingBuiltinEvaluator}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditTemplate(`You are an expert evaluator for ${selectedEval}.

CONTEXT:
{context}

QUERY:
{query}

RESPONSE:
{response}

Evaluate and respond with JSON only: {{"label": "pass" or "fail", "score": 0.0-1.0, "explanation": "one line"}}`);
                  setEditEvalType("llm_prompt");
                  setDirty(true);
                }}
                className="text-xs"
              >
                {t.evaluations.overrideWithCustomPrompt}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <div className="mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.evaluations.evalModel}</span>
              <div className="mt-1 w-64">
                <ModelSelector value={editModel} onChange={(m) => { setEditModel(m); setDirty(true); }} />
              </div>
            </div>
            <PromptBuilder
              template={editTemplate}
              evalName={selectedEval}
              badgeLabel={editBadgeLabel}
              onChange={(t) => { setEditTemplate(t); setDirty(true); }}
              onBadgeLabelChange={(l) => { setEditBadgeLabel(l); setDirty(true); }}
            />
          </div>
        )}

        {/* Test */}
        {!globalMode && (
          <EvalTestPanel editTemplate={editTemplate} projectId={projectId} />
        )}
      </div>
    </div>
  );
}
