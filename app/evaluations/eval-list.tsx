"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Check, ChevronRight, Settings2 } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarItem, SidebarItemDiv } from "@/components/ui/sidebar";
import { RoleGate } from "@/components/ui/role-gate";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EvalPrompt {
  id: string;
  name: string;
  evalType: string; // "llm_prompt" | "code_rule" | "builtin"
  outputMode: string; // "score" | "binary"
  template: string;
  ruleConfig: string; // JSON
  badgeLabel: string;
  description: string;
  isCustom: boolean;
  model: string;
}

export interface ProjectEvalConfig {
  id: string;
  projectId: string;
  evalName: string;
  enabled: boolean;
  template: string | null;
}

const CONTEXT_SOURCES = [
  { id: "auto", label: "Auto", desc: "TOOL/RETRIEVER outputs → input tags → system prompt" },
  { id: "tool_outputs", label: "TOOL Outputs", desc: "Only from TOOL/RETRIEVER span outputs" },
  { id: "system_prompt", label: "System Prompt", desc: "From LLM system message content" },
  { id: "input_tags", label: "Input Tags", desc: "From <context> tags in input" },
  { id: "none", label: "None", desc: "Always use (no context)" },
];

interface EvalListProps {
  selectedProject: string | null;
  selectedEval: string | null;
  globalPrompts: EvalPrompt[];
  projectConfigs: ProjectEvalConfig[];
  onSelectEval: (name: string) => void;
  onToggleEval: (name: string) => void;
  onStartCreating: () => void;
  onShowSettings?: () => void;
  globalMode?: boolean;
  projectId?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EvalList({
  selectedProject,
  selectedEval,
  globalPrompts,
  projectConfigs,
  onSelectEval,
  onToggleEval,
  onStartCreating,
  onShowSettings,
  globalMode,
  projectId,
}: EvalListProps) {
  const builtInEvals = globalPrompts.filter((p) => !p.isCustom);
  const customEvals = globalPrompts.filter((p) => p.isCustom);

  function isEnabled(name: string): boolean {
    const c = projectConfigs.find((c) => c.evalName === name);
    if (c) return c.enabled;
    // Built-in evals default to enabled, custom evals default to disabled
    return builtInEvals.some((p) => p.name === name);
  }

  function EvalRow({ prompt, showDescription }: { prompt: EvalPrompt; showDescription?: boolean }) {
    const enabled = isEnabled(prompt.name);
    const hasOverride = projectConfigs.some((c) => c.evalName === prompt.name && c.template);
    const t = prompt.evalType;
    return (
      <SidebarItemDiv active={selectedEval === prompt.name}>
        {!globalMode && (
          <RoleGate>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleEval(prompt.name); }}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                enabled ? "border-foreground bg-foreground" : "border-muted-foreground/30",
              )}
            >
              {enabled && <Check className="size-2.5 text-background" />}
            </button>
          </RoleGate>
        )}
        <button
          onClick={() => onSelectEval(prompt.name)}
          className="flex flex-1 items-center gap-1.5 text-left min-w-0"
        >
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm truncate", !globalMode && !enabled && "text-muted-foreground line-through")}>{prompt.name}</p>
            {showDescription && prompt.description && (
              <p className="text-[10px] text-muted-foreground truncate">{prompt.description}</p>
            )}
          </div>
          {hasOverride && (
            <span className="shrink-0 rounded bg-foreground/10 px-1 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">
              override
            </span>
          )}
          <span className={cn(
            "shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase",
            t === "code_rule" ? "bg-muted text-muted-foreground"
              : t === "api" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              : t === "builtin" ? "bg-foreground/10 text-foreground/70"
              : "bg-foreground text-background"
          )}>
            {t === "code_rule" ? "rule" : t === "api" ? "api" : t === "builtin" ? "built-in" : "llm"}
          </span>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </SidebarItemDiv>
    );
  }

  return (
    <Sidebar>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <SidebarHeader>{globalMode ? "Evaluation Templates" : "Active Evaluations"}</SidebarHeader>
      </div>

      {selectedProject ? (
        <div className="flex-1 overflow-y-auto">
          {/* Built-in */}
          {globalMode && builtInEvals.length > 0 && (
            <div className="px-3 pt-1 pb-1">
              <SidebarHeader>Default Evaluations</SidebarHeader>
            </div>
          )}
          <div className="px-2 pt-1">
            {builtInEvals.map((p) => (
              <EvalRow key={p.name} prompt={p} showDescription />
            ))}
          </div>

          {/* Custom evals */}
          {customEvals.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <SidebarHeader>{globalMode ? "Custom Templates" : "Custom"}</SidebarHeader>
              </div>
              <div className="px-2">
                {customEvals.map((p) => (
                  <EvalRow key={p.name} prompt={p} showDescription />
                ))}
              </div>
            </>
          )}

          {/* Add new */}
          <div className="px-3 py-3 space-y-1.5">
            <RoleGate>
              <Button
                size="sm"
                variant="outline"
                onClick={onStartCreating}
                className="w-full gap-1.5 text-xs"
              >
                <Plus className="size-3" /> Add Evaluation
              </Button>
            </RoleGate>
          </div>

          {/* Eval Settings */}
          {!globalMode && projectId && onShowSettings && (
            <div className="border-t px-3 py-2">
              <RoleGate>
                <button
                  onClick={onShowSettings}
                  className="flex w-full items-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Settings2 className="size-3" />
                  Eval Settings
                </button>
              </RoleGate>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a project
        </div>
      )}
    </Sidebar>
  );
}
