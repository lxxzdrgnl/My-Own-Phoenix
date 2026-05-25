"use client";
import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";

import { useState, useEffect, useCallback } from "react";
import { ModalShell, ModalHeader } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, ChevronRight, Check, RotateCcw } from "lucide-react";
import { PromptBuilder } from "@/components/prompt-builder";
import { RuleBuilder, DEFAULT_RULE_CONFIG, type RuleConfig } from "@/components/rule-builder";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────

interface EvalItem {
  name: string;
  evalType: string;
  outputMode: string;
  template: string;
  ruleConfig: string;
  badgeLabel: string;
  isCustom: boolean;
  description?: string;
}

/** Per-eval override stored on dataset: { template?, ruleConfig? } */
export type EvalOverrides = Record<string, { template?: string; ruleConfig?: string }>;

const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  hallucination: "Detects fabricated or factually wrong information",
  citation: "Checks if response is grounded in context",
  tool_calling: "Evaluates tool/retrieval usage appropriateness",
  qa_correctness: "Evaluates answer accuracy (Phoenix built-in)",
  rag_relevance: "Measures retrieved document relevance (Phoenix built-in)",
  banned_word: "Detects toxic or banned content (keyword matching)",
};

import { NEW_EVAL_TEMPLATE } from "@/app/evaluations/eval-constants";

// ─── Props ────────────────────────────────────────────────────────────────

interface EvalSelectorModalProps {
  open: boolean;
  onClose: () => void;
  datasetName: string;
  checkedEvals: Set<string>;
  evalOverrides: EvalOverrides;
  onConfirm: (selected: Set<string>, overrides: EvalOverrides) => void;
}

export function EvalSelectorModal({ open, onClose, datasetName, checkedEvals, evalOverrides, onConfirm }: EvalSelectorModalProps) {
  const t = useT();
  const confirmDialog = useConfirm();
  const [evals, setEvals] = useState<EvalItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<EvalOverrides>({});
  const [activeEval, setActiveEval] = useState<string | null>(null);

  // Scope: "global" or "dataset"
  const [scope, setScope] = useState<"global" | "dataset">("global");

  // Edit state
  const [editTemplate, setEditTemplate] = useState("");
  const [editRuleConfig, setEditRuleConfig] = useState<RuleConfig>(DEFAULT_RULE_CONFIG);
  const [editBadgeLabel, setEditBadgeLabel] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"llm_prompt" | "code_rule" | "api">("llm_prompt");
  const [newApiEndpoint, setNewApiEndpoint] = useState("http://localhost:2024/evaluate");

  const loadEvals = useCallback(async () => {
    try {
      const res = await apiFetch("/api/eval-prompts");
      const data = await res.json();
      setEvals(data.items ?? []);
    } catch (e) { logger.error("eval-selector-modal load evals failed", e); }
  }, []);

  useEffect(() => {
    if (open) {
      loadEvals();
      setSelected(new Set(checkedEvals));
      setOverrides({ ...evalOverrides });
      setActiveEval(null);
      setDirty(false);
      setCreating(false);
      setScope("global");
    }
  }, [open, checkedEvals, evalOverrides, loadEvals]);

  // Get effective template/ruleConfig for the active eval based on scope

  async function selectEval(name: string) {
    if (dirty) {
      const ok = await confirmDialog({
        title: "Discard changes",
        description: "You have unsaved changes that will be lost.",
        confirmText: "Discard",
      });
      if (!ok) return;
    }
    const ev = evals.find((e) => e.name === name);
    if (!ev) return;
    setActiveEval(name);
    const eff = getEffectiveForEval(ev);
    setEditTemplate(eff.template);
    try { setEditRuleConfig(JSON.parse(eff.ruleConfig || "{}")); } catch { setEditRuleConfig(DEFAULT_RULE_CONFIG); }
    setEditBadgeLabel(ev.badgeLabel);
    setDirty(false);
    setCreating(false);
  }

  // Helper that uses current scope state
  function getEffectiveForEval(ev: EvalItem) {
    if (scope === "dataset") {
      const ov = overrides[ev.name];
      if (ov) {
        return {
          template: ov.template ?? ev.template,
          ruleConfig: ov.ruleConfig ?? ev.ruleConfig,
        };
      }
    }
    return { template: ev.template, ruleConfig: ev.ruleConfig };
  }

  // When scope changes, reload the active eval's template
  useEffect(() => {
    if (!activeEval) return;
    const ev = evals.find((e) => e.name === activeEval);
    if (!ev) return;
    const eff = scope === "dataset" && overrides[ev.name]
      ? { template: overrides[ev.name].template ?? ev.template, ruleConfig: overrides[ev.name].ruleConfig ?? ev.ruleConfig }
      : { template: ev.template, ruleConfig: ev.ruleConfig };
    setEditTemplate(eff.template);
    try { setEditRuleConfig(JSON.parse(eff.ruleConfig || "{}")); } catch { setEditRuleConfig(DEFAULT_RULE_CONFIG); }
    setDirty(false);
  }, [scope]);

  function toggleCheck(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function handleSave() {
    if (!activeEval) return;
    const ev = evals.find((e) => e.name === activeEval);
    if (!ev) return;
    setSaving(true);

    if (scope === "dataset") {
      // Save as dataset override (in-memory, persisted on confirm)
      setOverrides((prev) => ({
        ...prev,
        [activeEval]: {
          ...(ev.evalType === "llm_prompt" ? { template: editTemplate } : {}),
          ...(ev.evalType === "code_rule" ? { ruleConfig: JSON.stringify(editRuleConfig) } : {}),
        },
      }));
      setDirty(false);
    } else {
      // Save globally
      try {
        await apiFetch("/api/eval-prompts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: ev.name,
            projectId: null,
            evalType: ev.evalType,
            outputMode: ev.outputMode,
            template: ev.evalType === "llm_prompt" ? editTemplate : "",
            ruleConfig: ev.evalType === "code_rule" ? editRuleConfig : undefined,
            badgeLabel: editBadgeLabel || ev.badgeLabel,
            isCustom: ev.isCustom,
          }),
        });
        await loadEvals();
      } catch (e) { logger.error("eval-selector-modal save eval failed", e); }
      setDirty(false);
    }
    setSaving(false);
  }

  function handleResetOverride() {
    if (!activeEval) return;
    const ev = evals.find((e) => e.name === activeEval);
    if (!ev) return;
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[activeEval];
      return next;
    });
    setEditTemplate(ev.template);
    try { setEditRuleConfig(JSON.parse(ev.ruleConfig || "{}")); } catch { setEditRuleConfig(DEFAULT_RULE_CONFIG); }
    setDirty(false);
  }

  async function handleCreate() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    setSaving(true);
    try {
      await apiFetch("/api/eval-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          projectId: null,
          evalType: newType,
          outputMode: newType === "code_rule" ? "binary" : "score",
          template: newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "",
          ruleConfig: newType === "api" ? { endpoint: newApiEndpoint } : newType === "code_rule" ? DEFAULT_RULE_CONFIG : undefined,
          badgeLabel: name.slice(0, 3).toUpperCase(),
          isCustom: true,
        }),
      });
      await loadEvals();
      setCreating(false);
      setNewName("");
      setSelected((prev) => new Set([...prev, name]));
      setActiveEval(name);
      setEditTemplate(newType === "llm_prompt" ? NEW_EVAL_TEMPLATE : "");
      setEditRuleConfig(DEFAULT_RULE_CONFIG);
      setEditBadgeLabel(name.slice(0, 3).toUpperCase());
      setDirty(false);
    } catch (e) { logger.error("eval-selector-modal create eval failed", e); }
    setSaving(false);
  }

  function handleConfirm() {
    onConfirm(selected, overrides);
    onClose();
  }

  const activeEvData = evals.find((e) => e.name === activeEval);
  const builtinEvals = evals.filter((e) => !e.isCustom);
  const customEvals = evals.filter((e) => e.isCustom);
  const hasOverride = activeEval ? !!overrides[activeEval] : false;

  function typeTag(ev: EvalItem) {
    if (ev.evalType === "code_rule") return { label: "RULE", color: "bg-muted text-muted-foreground" };
    if (ev.evalType === "api") return { label: "API", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" };
    if (ev.evalType === "builtin") return { label: "BUILT-IN", color: "bg-foreground/10 text-foreground/70" };
    return { label: "LLM", color: "bg-foreground text-background" };
  }

  return (
    <ModalShell open={open} onClose={onClose} size="xl" className="h-[600px] max-w-[960px] w-full">
      <ModalHeader title={t.evaluations.title} />
      <div className="flex min-h-0 flex-1">
        {/* Left: eval list */}
        <div className="flex w-72 shrink-0 flex-col border-r overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {builtinEvals.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Active Evaluations
                </p>
                {builtinEvals.map((ev) => {
                  const tag = typeTag(ev);
                  const isActive = activeEval === ev.name;
                  const hasOv = !!overrides[ev.name];
                  return (
                    <div
                      key={ev.name}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-4 py-2.5 transition-colors",
                        isActive ? "bg-accent" : "hover:bg-accent/50"
                      )}
                      onClick={() => selectEval(ev.name)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCheck(ev.name); }}
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                          selected.has(ev.name)
                            ? "border-foreground bg-foreground text-background"
                            : "border-muted-foreground/30 hover:border-muted-foreground"
                        )}
                      >
                        {selected.has(ev.name) && <Check className="size-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium">{ev.name}</p>
                          {hasOv && <span className="size-1.5 rounded-full bg-foreground" title="Dataset override" />}
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {BUILTIN_DESCRIPTIONS[ev.name] || "Custom evaluation"}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold", tag.color)}>
                        {tag.label}
                      </span>
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                    </div>
                  );
                })}
              </>
            )}

            {customEvals.length > 0 && (
              <>
                <p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Custom
                </p>
                {customEvals.map((ev) => {
                  const tag = typeTag(ev);
                  const isActive = activeEval === ev.name;
                  const hasOv = !!overrides[ev.name];
                  return (
                    <div
                      key={ev.name}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-4 py-2.5 transition-colors",
                        isActive ? "bg-accent" : "hover:bg-accent/50"
                      )}
                      onClick={() => selectEval(ev.name)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCheck(ev.name); }}
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                          selected.has(ev.name)
                            ? "border-foreground bg-foreground text-background"
                            : "border-muted-foreground/30 hover:border-muted-foreground"
                        )}
                      >
                        {selected.has(ev.name) && <Check className="size-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium">{ev.name}</p>
                          {hasOv && <span className="size-1.5 rounded-full bg-foreground" title="Dataset override" />}
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">Custom evaluation</p>
                      </div>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold", tag.color)}>
                        {tag.label}
                      </span>
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Create new */}
          <div className="border-t p-3">
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Plus className="size-3.5" /> {t.evaluations.addEval}
              </button>
            ) : (
              <div className="space-y-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                  placeholder="Eval name..."
                  className="h-8 text-xs"
                  autoFocus
                />
                <div className="flex gap-1">
                  <div className="flex flex-1 rounded-md border">
                    <button
                      onClick={() => setNewType("llm_prompt")}
                      className={cn("flex-1 rounded-l-md px-2 py-1 text-[10px] transition-colors", newType === "llm_prompt" ? "bg-foreground text-background" : "hover:bg-accent")}
                    >LLM</button>
                    <button
                      onClick={() => setNewType("code_rule")}
                      className={cn("flex-1 px-2 py-1 text-[10px] transition-colors", newType === "code_rule" ? "bg-foreground text-background" : "hover:bg-accent")}
                    >Rule</button>
                    <button
                      onClick={() => setNewType("api")}
                      className={cn("flex-1 rounded-r-md px-2 py-1 text-[10px] transition-colors", newType === "api" ? "bg-foreground text-background" : "hover:bg-accent")}
                    >API</button>
                  </div>
                  <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || saving} className="h-7 px-3 text-xs">
                    Create
                  </Button>
                </div>
                {newType === "api" && (
                  <input
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs font-mono mt-1"
                    value={newApiEndpoint}
                    onChange={(e) => setNewApiEndpoint(e.target.value)}
                    placeholder="http://localhost:2024/evaluate"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: eval detail */}
        <div className="flex-1 overflow-y-auto">
          {!activeEvData ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <p className="text-sm">Select an evaluation to view or edit</p>
            </div>
          ) : (
            <div className="p-5">
              {/* Header + Scope */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">{activeEvData.name}</h2>
                  <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", typeTag(activeEvData).color)}>
                    {typeTag(activeEvData).label}
                  </span>
                </div>
                {dirty && (
                  <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>

              {/* Scope toggle */}
              {activeEvData.evalType !== "builtin" && (
                <div className="mb-5 flex items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="text-[10px] text-muted-foreground">Scope:</span>
                  <button
                    onClick={() => setScope("global")}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      scope === "global" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Global
                  </button>
                  <button
                    onClick={() => setScope("dataset")}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      scope === "dataset" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {datasetName}
                  </button>
                  {scope === "dataset" && hasOverride && (
                    <button
                      onClick={handleResetOverride}
                      className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                      title="Reset to global"
                    >
                      <RotateCcw className="size-3" /> Reset
                    </button>
                  )}
                </div>
              )}

              {/* Builder */}
              {activeEvData.evalType === "api" ? (
                <div className="rounded-lg border p-4 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                  <p className="text-sm font-semibold">External API Evaluator</p>
                  <p className="text-[11px] text-muted-foreground">
                    {activeEvData.description || "외부 API 엔드포인트를 호출하여 평가합니다."}
                  </p>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">Endpoint</label>
                    <code className="block rounded bg-muted px-3 py-2 text-xs font-mono">
                      {(() => { try { return JSON.parse(activeEvData.ruleConfig)?.endpoint ?? '—'; } catch { return '—'; } })()}
                    </code>
                  </div>
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <p><strong>Request:</strong> POST endpoint {`{ evalName, query, response, context }`}</p>
                    <p><strong>Response:</strong> {`{ score, label, explanation }`}</p>
                  </div>
                </div>
              ) : activeEvData.evalType === "code_rule" ? (
                <RuleBuilder
                  config={editRuleConfig}
                  onChange={(c) => { setEditRuleConfig(c); setDirty(true); }}
                />
              ) : activeEvData.evalType === "builtin" ? (
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">
                    This is a Phoenix built-in evaluation. It runs automatically via the Phoenix eval worker.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {BUILTIN_DESCRIPTIONS[activeEvData.name] || ""}
                  </p>
                </div>
              ) : (
                <PromptBuilder
                  template={editTemplate}
                  evalName={activeEvData.name}
                  badgeLabel={editBadgeLabel}
                  onChange={(t) => { setEditTemplate(t); setDirty(true); }}
                  onBadgeLabelChange={(l) => { setEditBadgeLabel(l); setDirty(true); }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {selected.size} evaluation{selected.size !== 1 ? "s" : ""} selected
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="text-xs">{t.common.cancel}</Button>
          <Button onClick={handleConfirm} className="text-xs">{t.common.confirm}</Button>
        </div>
      </div>
    </ModalShell>
  );
}
